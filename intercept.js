// intercept.js
(function() {
    const DEBUG = false;
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
            if (url && (url.includes('.json') || url.includes('outline') || url.includes('/books/'))) {
                const clonedResponse = response.clone();
                clonedResponse.json().then(data => {
                    detectAndSendMetadata(data, url);
                }).catch(e => {}); // not valid JSON
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
                    if (this.responseURL && (this.responseURL.includes('.json') || this.responseURL.includes('outline') || this.responseURL.includes('/books/'))) {
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
        const items = [];
        const normalize = (item) => {
            if (!item || typeof item !== 'object') return null;
            const hasCfi = !!item.cfi;
            const hasUrl = !!item.url || !!item.absoluteURL || !!item.absolute_url || !!item.href || !!item.path || !!item.uri;
            if (!hasCfi && !hasUrl) return null;
            return {
                ...item,
                absolute_url: item.absoluteURL || item.absolute_url || item.url || item.href || item.path || item.uri || ''
            };
        };

        if (Array.isArray(data)) {
            data.forEach(item => {
                const normalized = normalize(item);
                if (normalized) items.push(normalized);
            });
        } else if (data && typeof data === 'object') {
            ['outline', 'table_of_contents', 'items', 'pages', 'pagebreaks'].forEach(key => {
                if (Array.isArray(data[key])) {
                    data[key].forEach(item => {
                        const normalized = normalize(item);
                        if (normalized) items.push(normalized);
                    });
                }
            });
        }

        return items;
    }

    function detectAndSendMetadata(data, url) {
        const items = processMetadata(data);
        if (items && items.length > 0) {
            let bookId = null;
            const bookMatch = url.match(/\/books\/([^\/]+)/);
            if (bookMatch) bookId = bookMatch[1];

            const uniqueItems = [];
            const seenCfi = new Set();
            for (let i = 0; i < items.length; i++) {
                if (!items[i].cfi) {
                    uniqueItems.push(items[i]);
                    continue;
                }
                if (!seenCfi.has(items[i].cfi)) {
                    seenCfi.add(items[i].cfi);
                    uniqueItems.push(items[i]);
                }
            }

            const isPagebreaks = url.includes('pagebreaks');
            const isPages = !isPagebreaks && (url.includes('/pages') || url.includes('pages'));
            const messageType = isPagebreaks ? 'VS_PAGEBREAKS_JSON' : isPages ? 'VS_PAGES_JSON' : 'VS_OUTLINE_JSON';

            log(`Detected Book Metadata (${messageType}) for`, bookId || 'unknown', 'from', url, `(${uniqueItems.length} items)`);
            window.postMessage({
                type: messageType,
                data: uniqueItems,
                bookId: bookId,
                url: url
            }, '*');
        }
    }
})();
