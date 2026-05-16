// intercept.entry.js
(function() {
    const DEBUG = true; // Always on for TOC sniffing
    function log(...args) {
        if (DEBUG) console.log('[PilotPro INTERCEPT]', ...args);
    }

    log('Injected and active. Wrapping native fetch and XMLHttpRequest.');

    // Wrap fetch
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        try {
            const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
            if (url && (url.includes('.json') || url.includes('outline') || url.includes('/books/') || url.includes('/toc'))) {
                const clonedResponse = response.clone();
                clonedResponse.json().then(data => {
                    log(`[SNIFF] Intercepted JSON from ${url}`);
                    detectAndSendMetadata(data, url);
                }).catch(e => {
                    log(`[SNIFF] Intercepted non-JSON from ${url}`);
                });
            }
        } catch (e) {
            log('Error in fetch wrapper:', e);
        }
        return response;
    };

    // Wrap XHR
    const originalXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
            try {
                if (this.responseType === '' || this.responseType === 'text' || this.responseType === 'json') {
                    if (this.responseURL && (this.responseURL.includes('.json') || this.responseURL.includes('outline') || this.responseURL.includes('/books/') || this.responseURL.includes('/toc'))) {
                        let data;
                        if (this.responseType === 'json') {
                            data = this.response;
                        } else {
                            try {
                                data = JSON.parse(this.responseText);
                            } catch(e) {}
                        }
                        if (data) {
                            detectAndSendMetadata(data, this.responseURL);
                        }
                    }
                }
            } catch (e) {
                log('Error in XHR load handler:', e);
            }
        });
        originalXHRSend.apply(this, arguments);
    };

    function processMetadata(data) {
        let items = [];
        if (Array.isArray(data)) {
            data.forEach(item => {
                // Accept items with cfi + url OR cfi + path (some APIs use 'path')
                if (item.cfi && (item.url || item.path)) {
                    items.push({
                        ...item,
                        absolute_url: item.absoluteURL || item.absolute_url || item.url || item.path || ''
                    });
                }
            });
        }
        return items;
    }

    function detectAndSendMetadata(data, url) {
        // Accept multiple real-world TOC response shapes from VitalSource
        let items = [];

        // Shape 1: flat array of { cfi, url/path, title, page }
        if (Array.isArray(data)) {
            items = data.filter(item => item.cfi && (item.url || item.path || item.href));
        }

        // Shape 2: { toc: [...] } wrapper
        if (!items.length && data.toc && Array.isArray(data.toc)) {
            items = data.toc.filter(item => item.cfi || item.id);
        }

        // Shape 3: { chapters: [...] } wrapper
        if (!items.length && data.chapters && Array.isArray(data.chapters)) {
            items = data.chapters.filter(item => item.cfi || item.id);
        }

        // Shape 4: { results: [...] } wrapper (some book APIs)
        if (!items.length && data.results && Array.isArray(data.results)) {
            items = data.results.filter(item => item.cfi || item.id);
        }

        if (items.length > 0) {
            let bookId = null;
            const bookMatch = url.match(/\/books\/([^\/]+)/);
            if (bookMatch) bookId = bookMatch[1];

            // Normalize each item to canonical shape
            const uniqueItems = [];
            const seen = new Set();
            for (const item of items) {
                const key = item.cfi || item.id || '';
                if (!key || seen.has(key)) continue;
                seen.add(key);
                uniqueItems.push({
                    cfi: key,
                    page: item.page || item.pageLabel || item.page_num || '',
                    title: item.title || item.label || item.name || '',
                    level: item.level || 0,
                    url: item.url || item.path || item.href || item.absoluteURL || item.absolute_url || ''
                });
            }

            const isPagebreaks = url.includes('pagebreaks');
            const messageType = isPagebreaks ? 'VS_PAGEBREAKS_JSON' : 'VS_OUTLINE_JSON';

            log(`[SNIFF] ${messageType}: ${uniqueItems.length} items from ${url}`);
            window.postMessage({
                type: messageType,
                data: uniqueItems,
                bookId: bookId,
                url: url
            }, '*');

            // Also persist to localStorage so internalDiscovery.getManifest can find it later
            if (!isPagebreaks && bookId && uniqueItems.length > 0) {
                try {
                    localStorage.setItem(`__VS_TOC_${bookId}`, JSON.stringify(uniqueItems));
                    log(`[SNIFF] Saved TOC to localStorage key __VS_TOC_${bookId}`);
                } catch (e) {
                    log('[SNIFF] Failed to save TOC to localStorage:', e);
                }
            }
        } else if (url.includes('book') || url.includes('toc') || url.includes('outline')) {
            // Unknown data shape — dump it so we can add a new sniff rule
            log(`[SNIFF-UNKNOWN] url=${url} keys=${Object.keys(data || {}).join(',')}`);
        }
    }
})();
