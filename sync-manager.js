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

    // ============================================
    // LOCAL TRIP ID PREDICTION
    // Predicts the next R-number locally so records
    // appear with a real ID instantly (no "Saving...")
    // ============================================
    _localMaxId: 0,          // highest known ID number
    _localAssigned: [],       // IDs assigned locally but not yet confirmed by server

    /**
     * Initialize SyncManager with the Web App URL
     * Must be called before any other method
     */
    async init(webAppUrl) {
        this._webAppUrl = webAppUrl;
        await this._openDB();

        // Restore local max ID from localStorage
        try {
            const saved = parseInt(localStorage.getItem('sync_local_max_id')) || 0;
            if (saved > this._localMaxId) this._localMaxId = saved;
        } catch(e) {}

        // Scan cached data to find the highest known ID
        this._scanCachedDataForMaxId();

        // Auto-sync when coming back online
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => {
                console.log('🌐 SyncManager: Back online, syncing...');
                setTimeout(() => this.syncAll(), 1500);
            });
        }

        // Start initial sync of any pending items
        setTimeout(() => this.syncAll(), 2000);

        console.log('✅ SyncManager initialized (localMaxId: R' + String(this._localMaxId).padStart(3, '0') + ')');
    },

    /**
     * Predict the next trip ID locally.
     * Call this BEFORE submitting to get an instant ID for display.
     * Returns e.g. 'R010', 'R011', etc.
     */
    predictNextId() {
        this._localMaxId++;
        this._localAssigned.push(this._localMaxId);
        const predicted = 'R' + String(this._localMaxId).padStart(3, '0');
        // Persist so other pages (driver/nurse) stay in sync
        try { localStorage.setItem('sync_local_max_id', String(this._localMaxId)); } catch(e) {}
        console.log('🔮 SyncManager: Predicted next ID:', predicted);
        return predicted;
    },

    /**
     * Update the local max ID tracker when fresh data arrives from server.
     * Call this from loadAllNurseData / loadAdminData / driver data load.
     * @param {Array} records - Array of record objects with ID field
     */
    updateMaxIdFromRecords(records) {
        if (!Array.isArray(records)) return;
        let maxFound = this._localMaxId;
        for (let i = 0; i < records.length; i++) {
            const id = records[i].ID || records[i].id || records[i].tripId || '';
            const num = parseInt(String(id).replace(/\D/g, '')) || 0;
            if (num > maxFound) maxFound = num;
        }
        if (maxFound > this._localMaxId) {
            this._localMaxId = maxFound;
            try { localStorage.setItem('sync_local_max_id', String(this._localMaxId)); } catch(e) {}
            // Clear confirmed assignments
            this._localAssigned = this._localAssigned.filter(n => n > maxFound);
            console.log('📊 SyncManager: Updated maxId from server data → R' + String(maxFound).padStart(3, '0'));
        }
    },

    /**
     * Scan DataCache localStorage entries to find the highest ID on init.
     * Covers nurse records, admin records, and pending trips.
     */
    _scanCachedDataForMaxId() {
        try {
            const keys = Object.keys(localStorage);
            for (const key of keys) {
                if (!key.startsWith('cache_')) continue;
                try {
                    const raw = JSON.parse(localStorage.getItem(key));
                    if (!raw || !raw.data) continue;
                    const data = raw.data;
                    // Nurse data: { records: [...], trips: [...] }
                    if (data.records) this.updateMaxIdFromRecords(data.records);
                    if (data.trips) this.updateMaxIdFromRecords(data.trips);
                    // Admin data: { data: [...] } or direct array
                    if (Array.isArray(data)) this.updateMaxIdFromRecords(data);
                    if (data.data && Array.isArray(data.data)) this.updateMaxIdFromRecords(data.data);
                } catch(e) {}
            }
        } catch(e) { console.warn('SyncManager: Cache scan error (non-fatal):', e); }
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

        await this._updateStatus(localId, 'syncing');

        try {
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
                await this._updateStatus(localId, 'queued');
                this._scheduleOnlineRetry(localId);
                return;
            }

            const result = await ReliablePost.send(this._webAppUrl, entry.data, {
                background: false,
                timeout: 45000
            });

            if (result.success && !result.offline && !result.queued) {
                await this._updateEntry(localId, {
                    status: 'synced',
                    serverResponse: result,
                    syncedAt: Date.now()
                });
                console.log('✅ SyncManager: Synced to server:', localId);
                this._emit('synced', { localId, action: entry.action, serverResponse: result, data: entry.data });
            } else if (result.offline || result.queued) {
                await this._updateStatus(localId, 'queued');
                const retryDelay = Math.min(5000 * Math.pow(1.5, (entry.retryCount || 0)), 60000);
                console.warn('⚠️ SyncManager: Queued for retry in', Math.round(retryDelay/1000) + 's:', localId);
                setTimeout(() => this._syncOne(localId), retryDelay);
            } else {
                throw new Error(result.error || 'Unknown sync error');
            }
        } catch (error) {
            const entry2 = await this._getEntry(localId);
            const retryCount = (entry2 ? entry2.retryCount : 0) + 1;

            if (retryCount >= 8) {
                await this._updateEntry(localId, { status: 'failed', retryCount: retryCount });
                console.error('❌ SyncManager: Max retries reached:', localId);
                this._emit('failed', { localId, action: entry.action, error: error.message });
            } else {
                await this._updateEntry(localId, { status: 'queued', retryCount: retryCount });
                var delay = Math.min(2000 * Math.pow(1.5, retryCount - 1), 30000);
                console.warn('⚠️ SyncManager: Retry', retryCount, 'in', Math.round(delay/1000) + 's for:', localId);
                setTimeout(() => this._syncOne(localId), delay);
            }
        }
    },

    _scheduleOnlineRetry(localId) {
        var handler = function() {
            window.removeEventListener('online', handler);
            setTimeout(function() { SyncManager._syncOne(localId); }, 500);
        };
        window.addEventListener('online', handler);
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
            // Also retry items stuck in 'syncing' (e.g. page closed mid-sync)
            const stuck = await this._getByStatus('syncing');
            const stuckOld = stuck.filter(e => Date.now() - e.createdAt > 30000);
            const allToSync = [...entries, ...stuckOld];

            if (allToSync.length === 0) {
                this._syncing = false;
                return;
            }

            console.log(`🔄 SyncManager: Syncing ${allToSync.length} items...`);

            for (const entry of allToSync) {
                if (Date.now() - entry.createdAt > 72 * 60 * 60 * 1000) {
                    await this._updateStatus(entry.localId, 'expired');
                    continue;
                }
                if (stuckOld.includes(entry)) {
                    await this._updateStatus(entry.localId, 'queued');
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
