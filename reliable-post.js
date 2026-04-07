/**
 * ReliablePost - إرسال موثوق للبيانات
 * Reliable POST helper for Google Apps Script endpoints
 * 
 * Problem solved:
 * Google Apps Script redirects POST requests (302). With mode:'no-cors',
 * the response is opaque — you can't detect failures. On some devices/PWA
 * contexts the redirect chain fails silently, so data never reaches the server.
 *
 * Solution:
 * 1. Primary: Use mode:'cors' with redirect:'follow' — full visibility
 * 2. Fallback: GET with URL-encoded payload (bypasses CORS entirely)
 * 3. Last resort: no-cors POST (opaque, unverifiable)
 * 4. Automatic retry with exponential backoff (up to 3 attempts)
 * 5. Offline queue: if all attempts fail, queue for later sync
 */

const ReliablePost = {
    OFFLINE_QUEUE_KEY: 'reliable_post_queue',
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    _GET_SUPPORTED_ACTIONS: ['submitCase', 'driverDeparture', 'driverReturn', 'updateRecord', 'saveDraftInspection', 'submitInspectionWeek', 'adminUpdateInspection'],

    /**
     * Send POST data reliably to Google Apps Script
     * @param {string} url - The Web App URL
     * @param {object} data - The data object to send
     * @param {object} options - Optional settings
     * @param {boolean} options.background - If true, don't throw on failure (queue instead)
     * @param {number} options.timeout - Request timeout in ms (default 30000)
     * @returns {Promise<{success: boolean, data?: any, offline?: boolean, error?: string}>}
     */
    async send(url, data, options = {}) {
        const timeout = options.timeout || 45000;
        const background = options.background || false;

        // === Strategy 1: POST with CORS (most reliable when it works) ===
        for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
            try {
                var attemptTimeout = timeout + (attempt * 5000);
                const result = await this._postWithTimeout(url, data, 'cors', attemptTimeout);
                if (result && result.success !== undefined) {
                    return result;
                }
                return { success: true, data: result };
            } catch (error) {
                console.warn(`ReliablePost: CORS attempt ${attempt + 1} failed:`, error.message);
                
                if (error.message && error.message.includes('400')) break;
                
                if (attempt < this.MAX_RETRIES) {
                    await this._sleep(this.RETRY_DELAY * Math.pow(1.5, attempt));
                }
            }
        }

        // === Strategy 2: GET with URL payload (bypasses CORS/redirect entirely) ===
        if (data.action && this._GET_SUPPORTED_ACTIONS.includes(data.action)) {
            try {
                console.log('ReliablePost: Trying GET fallback for', data.action);
                const result = await this._getWithPayload(url, data, timeout);
                if (result && result.success) {
                    console.log('ReliablePost: GET fallback succeeded');
                    return result;
                }
            } catch (error) {
                console.warn('ReliablePost: GET fallback failed:', error.message);
            }
        }

        // === Strategy 3: no-cors POST (fire-and-forget, unverifiable) ===
        try {
            console.log('ReliablePost: Falling back to no-cors mode');
            await this._postNoCors(url, data, timeout);
            console.warn('ReliablePost: no-cors sent but unconfirmed (opaque). Queuing for verification.');
        } catch (error) {
            console.warn('ReliablePost: no-cors fallback also failed:', error.message);
        }

        // All confirmed strategies failed — queue for later retry
        this._queueOffline(url, data);
        if (background) {
            return { success: true, offline: true, queued: true };
        }

        return { success: false, error: 'لم يتم تأكيد الإرسال. سيُعاد المحاولة تلقائياً.', queued: true };
    },

    /**
     * POST with CORS mode and timeout
     */
    async _postWithTimeout(url, data, mode, timeout) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                method: 'POST',
                mode: mode,
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(data),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const text = await response.text();
            try {
                return JSON.parse(text);
            } catch (e) {
                return { success: true, raw: text };
            }
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
    },

    /**
     * GET with payload as URL parameter — bypasses CORS preflight entirely.
     * GAS doGet handles 'postViaGet' action and routes to the correct handler.
     */
    async _getWithPayload(url, data, timeout) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const payload = encodeURIComponent(JSON.stringify(data));
            const getUrl = `${url}?action=postViaGet&payload=${payload}`;
            const response = await fetch(getUrl, {
                method: 'GET',
                redirect: 'follow',
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const text = await response.text();
            try {
                return JSON.parse(text);
            } catch (e) {
                return { success: true, raw: text };
            }
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
    },

    /**
     * POST with no-cors mode (opaque response fallback)
     */
    async _postNoCors(url, data, timeout) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            await fetch(url, {
                method: 'POST',
                mode: 'no-cors',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(data),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    },

    /**
     * Queue failed request for later sync
     */
    _queueOffline(url, data) {
        try {
            const queue = JSON.parse(localStorage.getItem(this.OFFLINE_QUEUE_KEY) || '[]');
            queue.push({
                url: url,
                data: data,
                timestamp: Date.now()
            });
            localStorage.setItem(this.OFFLINE_QUEUE_KEY, JSON.stringify(queue));
            console.log('ReliablePost: Queued for offline sync, queue size:', queue.length);
        } catch (e) {
            console.error('ReliablePost: Failed to queue offline', e);
        }
    },

    /**
     * Process offline queue (call on page load + online event)
     */
    async syncOfflineQueue() {
        const queue = JSON.parse(localStorage.getItem(this.OFFLINE_QUEUE_KEY) || '[]');
        if (queue.length === 0) return;

        console.log(`ReliablePost: Syncing ${queue.length} offline requests`);
        const remaining = [];

        for (const item of queue) {
            if (Date.now() - item.timestamp > 24 * 60 * 60 * 1000) continue;

            let synced = false;

            // Try CORS POST first
            try {
                await this._postWithTimeout(item.url, item.data, 'cors', 30000);
                synced = true;
            } catch (e) {
                // Try GET fallback
                if (item.data.action && this._GET_SUPPORTED_ACTIONS.includes(item.data.action)) {
                    try {
                        const result = await this._getWithPayload(item.url, item.data, 30000);
                        if (result && result.success) synced = true;
                    } catch (e2) {}
                }
            }

            if (!synced) {
                remaining.push(item);
            } else {
                console.log('ReliablePost: Synced offline item');
            }
        }

        localStorage.setItem(this.OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
        if (remaining.length > 0) {
            console.log(`ReliablePost: ${remaining.length} items still pending`);
        }
    },

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

// Auto-sync offline queue on page load and when coming back online
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        setTimeout(() => ReliablePost.syncOfflineQueue(), 2000);
    });
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => ReliablePost.syncOfflineQueue(), 5000);
        });
    } else {
        setTimeout(() => ReliablePost.syncOfflineQueue(), 5000);
    }
}
