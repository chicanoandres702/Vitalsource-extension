/**
 * c:\Users\Andrew\Downloads\Vitalsource-extension\src\features\capture\mimeo-bridge.service.js
 *
 * Mimeo Bridge Service
 * Design Intent: Bridges the gap between the isolated content script world
 * and the main page world where window.Mimeo lives via DOM-event tunneling.
 */
export const mimeoBridge = {
    _requestMap: new Map(),

    init() {
        this.injectBridge();
        window.addEventListener('vst-mimeo-response', (e) => {
            const { requestId, result, error, success } = e.detail;
            const resolver = this._requestMap.get(requestId);
            if (resolver) {
                this._requestMap.delete(requestId);
                if (success) resolver.resolve(result);
                else resolver.reject(new Error(error));
            }
        }, true);
    },

    injectBridge() {
        const script = document.createElement('script');
        script.textContent = `
            (function() {
                const mimeoExists = typeof window.Mimeo !== 'undefined';
                console.log('[MimeoBridge] Injected into: ' + window.location.hostname + ' | Mimeo Found:', mimeoExists);

                // Design Intent: Expose a live diagnostic object to the window 
                // context for manual verification in the DevTools console.
                window.__vst_bridge_status = {
                    get mimeoFound() { return typeof window.Mimeo !== 'undefined'; },
                    lastCheck: new Date().toLocaleTimeString()
                };

                window.addEventListener('vst-mimeo-request', async (e) => {
                    const { action, payload, requestId } = e.detail;
                    const target = window.Mimeo;
                    if (!target) {
                        console.error('[MimeoBridge] API Call failed: window.Mimeo is missing in ' + window.location.hostname);
                        return;
                    }
                    
                    try {
                        let result;
                        if (action === 'GET_PRINT_URL') result = await target.getPrintUrl(payload);
                        if (action === 'GET_TOKEN') result = await target.getPrintToken();
                        window.dispatchEvent(new CustomEvent('vst-mimeo-response', { detail: { requestId, result, success: true } }));
                    } catch (err) {
                        window.dispatchEvent(new CustomEvent('vst-mimeo-response', { detail: { requestId, error: err.message, success: false } }));
                    }
                }, true);
            })();
        `;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
    },

    /**
     * Queries the main page world via the injected bridge to check if window.Mimeo is available.
     * @returns {Promise<boolean>} True if window.Mimeo is found, false otherwise.
     */
    async checkMimeoAvailability() {
        // Design Intent: Send a dummy request to the bridge to trigger the availability check.
        // The injected script will log the status directly to the console.
        return this.request('CHECK_MIMEO_AVAILABILITY', null).then(() => true).catch(() => false);
    },

    async request(action, payload) {
        const requestId = Math.random().toString(36).substring(2, 9);
        return new Promise((resolve, reject) => {
            this._requestMap.set(requestId, { resolve, reject });
            window.dispatchEvent(new CustomEvent('vst-mimeo-request', { detail: { action, payload, requestId } }));
        });
    }
};
export default mimeoBridge;