/**
 * DataCache - نظام التخزين المؤقت الذكي
 * Smart caching system for instant data loading
 * 
 * Strategy: Stale-While-Revalidate
 * 1. Show cached data instantly on page load (0ms delay)
 * 2. Fetch fresh data from server in background
 * 3. Update UI only if data has changed
 */

const DataCache = {
    // In-flight request deduplication
    _inflight: {},

    // Cache keys
    KEYS: {
        PENDING_TRIPS: 'cache_pending_trips',
        RECORDS: 'cache_records',
        STATS: 'cache_stats',
        VEHICLES: 'cache_vehicles',
        NOTIFICATIONS: 'cache_notifications',
        TIMESTAMPS: 'cache_timestamps',
        ADMIN_DATA: 'cache_admin_data',
        DRIVERS: 'cache_drivers',
        NURSES: 'cache_nurses'
    },

    // Cache expiry times (milliseconds) - Optimized for slow connections
    EXPIRY: {
        PENDING_TRIPS: 1 * 60 * 1000,     // 1 minute (faster sync driver↔nurse)
        RECORDS: 15 * 60 * 1000,          // 15 minutes (longer for stability)
        STATS: 5 * 60 * 1000,             // 5 minutes
        VEHICLES: 60 * 60 * 1000,         // 60 minutes (rarely changes)
        NOTIFICATIONS: 5 * 60 * 1000,     // 5 minutes
        ADMIN_DATA: 5 * 60 * 1000,        // 5 minutes
        DRIVERS: 60 * 60 * 1000,          // 60 minutes (rarely changes)
        NURSES: 60 * 60 * 1000            // 60 minutes (rarely changes)
    },

    // Max cache size (5MB per entry)
    MAX_CACHE_SIZE: 5 * 1024 * 1024,

    /**
     * Simple compression using JSON stringification optimization
     */
    compress(data) {
        try {
            const str = JSON.stringify(data);
            // Check size
            if (str.length > this.MAX_CACHE_SIZE) {
                console.warn('DataCache: Data too large, truncating');
                // If array, keep only recent items
                if (Array.isArray(data)) {
                    return data.slice(0, Math.floor(data.length / 2));
                }
            }
            return data;
        } catch (e) {
            return data;
        }
    },

    /**
     * Save data to localStorage cache with timestamp
     */
    set(key, data) {
        try {
            const compressed = this.compress(data);
            const entry = {
                data: compressed,
                timestamp: Date.now(),
                size: JSON.stringify(compressed).length
            };
            localStorage.setItem(key, JSON.stringify(entry));
        } catch (e) {
            console.warn('DataCache: Storage full, clearing old cache');
            this.clearOldest();
            try {
                const compressed = this.compress(data);
                localStorage.setItem(key, JSON.stringify({ 
                    data: compressed, 
                    timestamp: Date.now(),
                    size: JSON.stringify(compressed).length
                }));
            } catch (e2) {
                console.error('DataCache: Cannot save to storage');
            }
        }
    },

    /**
     * Get cached data if available and not expired
     * Returns { data, isExpired, timestamp } or null
     */
    get(key, expiryMs) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;

            const entry = JSON.parse(raw);
            if (!entry || !entry.data) return null;

            const age = Date.now() - (entry.timestamp || 0);
            return {
                data: entry.data,
                isExpired: age > (expiryMs || 300000),
                age: age,
                timestamp: entry.timestamp
            };
        } catch (e) {
            return null;
        }
    },

    /**
     * Remove a specific cache entry
     */
    remove(key) {
        localStorage.removeItem(key);
    },

    /**
     * Clear all cache entries
     */
    clearAll() {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('cache_')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
    },

    /**
     * Clear oldest cache entries to free up space
     */
    clearOldest() {
        const cacheEntries = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('cache_')) {
                try {
                    const entry = JSON.parse(localStorage.getItem(key));
                    cacheEntries.push({
                        key: key,
                        timestamp: entry.timestamp || 0,
                        size: entry.size || 0
                    });
                } catch (e) {
                    // Invalid entry, remove it
                    localStorage.removeItem(key);
                }
            }
        }

        // Sort by timestamp (oldest first)
        cacheEntries.sort((a, b) => a.timestamp - b.timestamp);

        // Remove oldest 30% of entries
        const removeCount = Math.ceil(cacheEntries.length * 0.3);
        for (let i = 0; i < removeCount; i++) {
            localStorage.removeItem(cacheEntries[i].key);
        }

        console.log(`DataCache: Cleared ${removeCount} oldest entries`);
    },

    /**
     * Generate a simple hash for data comparison
     */
    hash(data) {
        const str = JSON.stringify(data);
        let h = 0;
        for (let i = 0, len = str.length; i < len; i++) {
            h = ((h << 5) - h) + str.charCodeAt(i);
            h = h & h;
        }
        return str.length + '_' + h;
    },

    /**
     * Fetch with cache - Core method
     * Shows cached data instantly, fetches fresh data in background
     * 
     * @param {string} url - Fetch URL
     * @param {string} cacheKey - Cache storage key
     * @param {number} expiryMs - Cache expiry in ms
     * @param {function} onData - Callback when data is available (called 1-2 times)
     * @param {function} extractData - Function to extract data from response
     * @returns {Promise} - Resolves when background fetch completes
     */
    async fetchWithCache(url, cacheKey, expiryMs, onData, extractData) {
        // Step 1: Instantly show cached data (even if expired — stale-while-revalidate)
        const cached = this.get(cacheKey, expiryMs);
        let cachedHash = null;

        if (cached && cached.data) {
            cachedHash = this.hash(cached.data);
            // Show stale data immediately — zero delay
            onData(cached.data, { fromCache: true, isExpired: cached.isExpired });
        }

        // Step 2: Fetch fresh data in background (with request deduplication)
        const bgFetch = async () => {
            try {
                if (!this._inflight[url]) {
                    if (window.__earlyFetch && url.includes('getPendingTrips')) {
                        this._inflight[url] = window.__earlyFetch;
                        window.__earlyFetch = null;
                    } else if (window.__earlyNurseFetch && url.includes('getNurseData')) {
                        this._inflight[url] = window.__earlyNurseFetch;
                        window.__earlyNurseFetch = null;
                    } else if (window.__earlyAdminFetch && url.includes('getAdminData')) {
                        this._inflight[url] = window.__earlyAdminFetch;
                        window.__earlyAdminFetch = null;
                    } else {
                        this._inflight[url] = fetch(url).then(r => r.json());
                    }
                }
                const result = await this._inflight[url];
                delete this._inflight[url];
                const freshData = extractData ? extractData(result) : result;

                if (freshData !== null && freshData !== undefined) {
                    const freshHash = this.hash(freshData);
                    const dataChanged = freshHash !== cachedHash;

                    this.set(cacheKey, freshData);
                    // Always notify with fresh server data so pages can reconcile
                    // localStorage state (e.g. remove admin-deleted trips)
                    onData(freshData, { fromCache: false, isExpired: false, unchanged: !dataChanged });
                }
            } catch (error) {
                delete this._inflight[url];
                // If no cached data was shown, report the error
                if (!cached || !cached.data) {
                    console.error('DataCache: Fetch failed and no cache available', error);
                    onData(null, { fromCache: false, isExpired: true, error: error });
                }
            }
        };

        // If we have cache, don't block — run fetch in background
        if (cached && cached.data) {
            bgFetch(); // intentionally not awaited — non-blocking
        } else {
            // No cache: must await so UI gets initial data
            await bgFetch();
        }
    },

    /**
     * Preload all data for a specific page type
     * Call this as early as possible (before DOM ready)
     */
    _preloadFetch(url, cacheKey, extractData) {
        if (!this._inflight[url]) {
            this._inflight[url] = fetch(url).then(r => r.json());
        }
        return this._inflight[url].then(result => {
            const data = extractData(result);
            if (data) this.set(cacheKey, data);
        }).catch(() => {});
    },

    preload(webAppUrl, pageType) {
        const fetches = [];
        const now = new Date();
        const year = now.getFullYear().toString();
        const month = String(now.getMonth() + 1);

        if (pageType === 'nurse') {
            const session = JSON.parse(localStorage.getItem('userSession') || '{}');
            const staffNum = session.staffNumber || '';

            // Fast: lightweight pending trips (1-2s) for instant display
            fetches.push(
                fetch(`${webAppUrl}?action=getPendingTrips`).then(r => r.json()).then(result => {
                    if (result && result.success && Array.isArray(result.trips)) {
                        const nt = result.trips.filter(t => t.status !== 'submitted');
                        localStorage.setItem('pending_trips_for_nurse', JSON.stringify(nt));
                    }
                }).catch(() => {})
            );

            // Heavy: full nurse data (records + trips + stats)
            let url = `${webAppUrl}?action=getNurseData&year=${year}&month=${month}`;
            if (staffNum) url += `&staffNumber=${encodeURIComponent(staffNum)}`;
            fetches.push(this._preloadFetch(
                url,
                'cache_nurse_data_' + year + '_' + month,
                r => r.success ? r : null
            ));
            let allUrl = `${webAppUrl}?action=getNurseData&year=${year}`;
            if (staffNum) allUrl += `&staffNumber=${encodeURIComponent(staffNum)}`;
            fetches.push(this._preloadFetch(
                allUrl,
                'cache_nurse_data_' + year + '_all',
                r => r.success ? r : null
            ));
        }

        if (pageType === 'driver') {
            fetches.push(this._preloadFetch(
                `${webAppUrl}?action=getPendingTrips`,
                this.KEYS.PENDING_TRIPS,
                r => (r.success && r.trips) ? r.trips : null
            ));
        }

        if (pageType === 'admin') {
            // Fast: lightweight pending trips (1-2s) for instant display
            fetches.push(
                fetch(`${webAppUrl}?action=getPendingTrips`).then(r => r.json()).then(result => {
                    if (result && result.success && Array.isArray(result.trips)) {
                        try { localStorage.setItem('cache_pending_trips', JSON.stringify({ data: result.trips, ts: Date.now() })); } catch(e) {}
                    }
                }).catch(() => {})
            );

            // Heavy: full admin data
            const url = `${webAppUrl}?action=getAdminData&year=${year}&month=${month}`;
            fetches.push(this._preloadFetch(
                url,
                this.KEYS.ADMIN_DATA,
                r => r.success ? r : null
            ));
            // Also preload "all" records for admin (common view)
            fetches.push(this._preloadFetch(
                `${webAppUrl}?action=getAllRecords&year=${year}`,
                this.KEYS.RECORDS + '_' + year + '_all_',
                r => (r.success && r.data) ? r.data : null
            ));
        }

        return Promise.allSettled(fetches);
    },

    /**
     * Check if a cache key has valid (non-expired) data
     * Useful for UI to decide whether to show loading indicator
     */
    has(key, expiryMs) {
        const cached = this.get(key, expiryMs);
        return cached && cached.data && !cached.isExpired;
    },

    /**
     * Invalidate cache after a write operation (submit, update, delete)
     * Forces next load to fetch fresh data
     */
    invalidate(...keys) {
        keys.forEach(key => this.remove(key));
    },

    /**
     * Invalidate all data caches (after submit/update)
     */
    invalidateAll() {
        this.clearAll();
    }
};
