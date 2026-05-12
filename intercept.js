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
        let items = [];
        if (Array.isArray(data)) {
            data.forEach(item => {
                // Accept items with at least a cfi OR a url — don't require both.
                // VitalSource TOC entries often have cfi but no standalone url.
                if (item.cfi || item.url) {
                    items.push({
                        ...item,
                        absolute_url: item.absoluteURL || item.absolute_url || item.url || ''
                    });
                }
            });
        }
        return items;
    }

    function detectAndSendMetadata(data, url) {
        // Look for the specific shape: array of objects with cfi, path, title, page
        const items = processMetadata(data);
        if (items && items.length > 0) {
            // Extract bookId from URL if possible
            // Patterns: /books/BOOKID/... or bookshelf.vitalsource.com/#/books/BOOKID
            let bookId = null;
            const bookMatch = url.match(/\/books\/([^\/]+)/);
            if (bookMatch) bookId = bookMatch[1];

            // Deduplicate items by cfi
            const uniqueItems = [];
            const seenCfi = new Set();
            for (let i = 0; i < items.length; i++) {
                if (!seenCfi.has(items[i].cfi)) {
                    seenCfi.add(items[i].cfi);
                    uniqueItems.push(items[i]);
                }
            }

            const isPagebreaks = url.includes('pagebreaks');
            const messageType = isPagebreaks ? 'VS_PAGEBREAKS_JSON' : 'VS_OUTLINE_JSON';
            
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
