/**
 * SyncManager - طبقة وسيطة للحفظ الفوري والمزامنة الخلفية
 * Instant local save (IndexedDB) + background sync to Google Sheets
 * 
 * Flow:
 * 1. User clicks Submit → saved to IndexedDB instantly (0ms)
 * 2. Background sync sends data to Google Sheets via ReliablePost
 * 3. On success: record marked as synced, real ID updated
 * 4. On failure/offline: retries automatically when online
 * 5. Admin delete: removes from both server and local buffer
 * 
 * Depends on: reliable-post.js (for actual POST requests)
 */

const SyncManager = {
    DB_NAME: 'ambulance_sync_db',
    DB_VERSION: 1,
    STORE_NAME: 'pending_sync',
    _db: null,
    _syncing: false,
    _listeners: {},
    _webAppUrl: null,

    /**
     * Initialize SyncManager with the Web App URL
     * Must be called before any other method
     */
    async init(webAppUrl) {
        this._webAppUrl = webAppUrl;
        await this._openDB();

        // Auto-sync when coming back online
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => {
                console.log('🌐 SyncManager: Back online, syncing...');
                setTimeout(() => this.syncAll(), 1500);
            });
        }

        // Start initial sync of any pending items
        setTimeout(() => this.syncAll(), 2000);

        console.log('✅ SyncManager initialized');
    },

    /**
     * Open/create IndexedDB
     */
    _openDB() {
        return new Promise((resolve, reject) => {
            if (this._db) { resolve(this._db); return; }

            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'localId' });
                    store.createIndex('status', 'status', { unique: false });
                    store.createIndex('action', 'action', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                this._db = event.target.result;
                resolve(this._db);
            };

            request.onerror = (event) => {
                console.error('SyncManager: IndexedDB error', event.target.error);
                reject(event.target.error);
            };
        });
    },

    /**
     * Save a record locally and queue for background sync
     * Returns immediately with a local ID — UI can update instantly
     * 
     * @param {string} action - 'submitCase', 'driverDeparture', 'driverReturn', 'updateRecord', 'deleteRecord'
     * @param {object} data - The form data to send to server
     * @param {object} options - { optimisticRecord: {...} } for display purposes
     * @returns {Promise<{localId: string, status: 'queued'}>}
     */
    async save(action, data, options = {}) {
        const db = await this._openDB();
        const localId = 'sync_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

        const entry = {
            localId: localId,
            action: action,
            data: data,
            status: 'queued',        // queued → syncing → synced → failed
            createdAt: Date.now(),
            retryCount: 0,
            serverResponse: null,
            optimisticRecord: options.optimisticRecord || null
        };

        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const req = store.put(entry);

            req.onsuccess = () => {
                console.log('💾 SyncManager: Saved locally:', localId, action);
                resolve({ localId: localId, status: 'queued' });

                // Start background sync immediately (non-blocking)
                this._syncOne(localId).catch(err => {
                    console.warn('SyncManager: Background sync failed, will retry:', err.message);
                });
            };

            req.onerror = (event) => {
                console.error('SyncManager: Save error', event.target.error);
                reject(event.target.error);
            };
        });
    },

    /**
     * Sync a single queued item to the server
     */
    async _syncOne(localId) {
        const db = await this._openDB();
        const entry = await this._getEntry(localId);
        if (!entry || entry.status === 'synced' || entry.status === 'syncing') return;

        // Mark as syncing
        await this._updateStatus(localId, 'syncing');

        try {
            // Check if online
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
                await this._updateStatus(localId, 'queued');
                console.log('📴 SyncManager: Offline, keeping queued:', localId);
                return;
            }

            const result = await ReliablePost.send(this._webAppUrl, entry.data, {
                background: false,
                timeout: 30000
            });

            if (result.success && !result.offline) {
                // Server confirmed — mark as synced and store server response
                await this._updateEntry(localId, {
                    status: 'synced',
                    serverResponse: result,
                    syncedAt: Date.now()
                });
                console.log('✅ SyncManager: Synced to server:', localId);
                this._emit('synced', { localId, action: entry.action, serverResponse: result, data: entry.data });
            } else if (result.offline || result.queued) {
                // ReliablePost queued it — keep as queued for our retry
                await this._updateStatus(localId, 'queued');
                console.log('📴 SyncManager: Queued for later:', localId);
            } else {
                throw new Error(result.error || 'Unknown sync error');
            }
        } catch (error) {
            const entry2 = await this._getEntry(localId);
            const retryCount = (entry2 ? entry2.retryCount : 0) + 1;

            if (retryCount >= 5) {
                await this._updateEntry(localId, { status: 'failed', retryCount: retryCount });
                console.error('❌ SyncManager: Max retries reached:', localId);
                this._emit('failed', { localId, action: entry.action, error: error.message });
            } else {
                await this._updateEntry(localId, { status: 'queued', retryCount: retryCount });
                console.warn('⚠️ SyncManager: Retry', retryCount, 'for:', localId);
                // Exponential backoff retry
                setTimeout(() => this._syncOne(localId), 3000 * Math.pow(2, retryCount - 1));
            }
        }
    },

    /**
     * Sync all queued items (called on init, online event, etc.)
     */
    async syncAll() {
        if (this._syncing) return;
        this._syncing = true;

        try {
            const db = await this._openDB();
            const entries = await this._getByStatus('queued');

            if (entries.length === 0) {
                this._syncing = false;
                return;
            }

            console.log(`🔄 SyncManager: Syncing ${entries.length} queued items...`);

            for (const entry of entries) {
                // Skip items older than 48 hours
                if (Date.now() - entry.createdAt > 48 * 60 * 60 * 1000) {
                    await this._updateStatus(entry.localId, 'expired');
                    continue;
                }
                await this._syncOne(entry.localId);
            }
        } catch (e) {
            console.error('SyncManager: syncAll error:', e);
        }

        this._syncing = false;
    },

    /**
     * Get count of pending (unsynced) items
     */
    async getPendingCount() {
        const queued = await this._getByStatus('queued');
        const syncing = await this._getByStatus('syncing');
        return queued.length + syncing.length;
    },

    /**
     * Get all entries with a specific status
     */
    async getByStatus(status) {
        return this._getByStatus(status);
    },

    /**
     * Remove a synced entry from the local buffer (cleanup)
     */
    async remove(localId) {
        const db = await this._openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const req = store.delete(localId);
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e.target.error);
        });
    },

    /**
     * Clean up old synced entries (keep buffer small)
     * Call periodically (e.g., on page load)
     */
    async cleanup() {
        const db = await this._openDB();
        const synced = await this._getByStatus('synced');
        const expired = await this._getByStatus('expired');
        const failed = await this._getByStatus('failed');

        const toRemove = [...synced, ...expired, ...failed].filter(
            e => Date.now() - (e.syncedAt || e.createdAt) > 60 * 60 * 1000 // 1 hour
        );

        for (const entry of toRemove) {
            await this.remove(entry.localId);
        }

        if (toRemove.length > 0) {
            console.log(`🧹 SyncManager: Cleaned up ${toRemove.length} old entries`);
        }
    },

    // ============================================
    // EVENT SYSTEM
    // ============================================

    /**
     * Listen for sync events
     * @param {string} event - 'synced', 'failed'
     * @param {function} callback - (detail) => {}
     */
    on(event, callback) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(callback);
    },

    _emit(event, detail) {
        const listeners = this._listeners[event] || [];
        for (const cb of listeners) {
            try { cb(detail); } catch (e) { console.error('SyncManager listener error:', e); }
        }
    },

    // ============================================
    // INTERNAL IndexedDB HELPERS
    // ============================================

    _getEntry(localId) {
        return new Promise((resolve, reject) => {
            const tx = this._db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const req = store.get(localId);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = (e) => reject(e.target.error);
        });
    },

    _updateStatus(localId, status) {
        return this._updateEntry(localId, { status: status });
    },

    async _updateEntry(localId, updates) {
        const entry = await this._getEntry(localId);
        if (!entry) return;

        Object.assign(entry, updates);

        return new Promise((resolve, reject) => {
            const tx = this._db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const req = store.put(entry);
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e.target.error);
        });
    },

    _getByStatus(status) {
        return new Promise((resolve, reject) => {
            const tx = this._db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const index = store.index('status');
            const req = index.getAll(status);
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = (e) => reject(e.target.error);
        });
    }
};
