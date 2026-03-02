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
 * 2. Fallback: If CORS fails (rare), retry with no-cors as last resort
 * 3. Automatic retry with exponential backoff (up to 3 attempts)
 * 4. Offline queue: if all attempts fail, queue for later sync
 */

const ReliablePost = {
    OFFLINE_QUEUE_KEY: 'reliable_post_queue',
    MAX_RETRIES: 2,
    RETRY_DELAY: 1500,

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
        const timeout = options.timeout || 30000;
        const background = options.background || false;

        // Try CORS mode first (full response visibility)
        for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
            try {
                const result = await this._postWithTimeout(url, data, 'cors', timeout);
                if (result && result.success !== undefined) {
                    return result;
                }
                // If response doesn't have success field, treat as success
                // (Google Apps Script always returns JSON with success field)
                return { success: true, data: result };
            } catch (error) {
                console.warn(`ReliablePost: CORS attempt ${attempt + 1} failed:`, error.message);
                
                // Don't retry on certain errors
                if (error.message && error.message.includes('400')) break;
                
                // Wait before retry
                if (attempt < this.MAX_RETRIES) {
                    await this._sleep(this.RETRY_DELAY * Math.pow(2, attempt));
                }
            }
        }

        // Fallback: try no-cors (opaque response — can't confirm, but data may arrive)
        try {
            console.log('ReliablePost: Falling back to no-cors mode');
            await this._postNoCors(url, data, timeout);
            // Can't read opaque response, assume success
            return { success: true, opaque: true };
        } catch (error) {
            console.warn('ReliablePost: no-cors fallback also failed:', error.message);
        }

        // All attempts failed — queue for offline sync
        if (background) {
            this._queueOffline(url, data);
            return { success: true, offline: true, queued: true };
        }

        return { success: false, error: 'فشل الإرسال. تحقق من الاتصال بالإنترنت.' };
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
                // Some GAS responses may not be JSON
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
            // Skip items older than 24 hours
            if (Date.now() - item.timestamp > 24 * 60 * 60 * 1000) continue;

            try {
                await this._postWithTimeout(item.url, item.data, 'cors', 30000);
                console.log('ReliablePost: Synced offline item');
            } catch (e) {
                // Try no-cors fallback
                try {
                    await this._postNoCors(item.url, item.data, 30000);
                } catch (e2) {
                    remaining.push(item);
                }
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
    // Sync on load (deferred to not block page)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => ReliablePost.syncOfflineQueue(), 5000);
        });
    } else {
        setTimeout(() => ReliablePost.syncOfflineQueue(), 5000);
    }
}
