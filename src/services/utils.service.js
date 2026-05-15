
/**
 * Utility functions for hashing, debouncing, and DOM operations
 */

export function quickHash(str) {
    // Design Intent: FNV-1a 32-bit hash for high-speed content comparison
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
}

export function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

export function pierceShadowAtPoint(x, y) {
    if (!isFinite(x) || !isFinite(y)) return null;
    let currentElement = document.elementFromPoint(x, y);
    while (currentElement) {
        // Prioritize Shadow DOM traversal
        if (currentElement.shadowRoot) {
            const shadowElement = currentElement.shadowRoot.elementFromPoint(x, y);
            if (shadowElement && shadowElement !== currentElement) {
                currentElement = shadowElement;
                continue;
            }
        }
        // Traverse into same-origin iframes
        if (currentElement.tagName === 'IFRAME') {
            try {
                const iframeDocument = currentElement.contentDocument || currentElement.contentWindow.document;
                const iframeRect = currentElement.getBoundingClientRect();
                const elementInIframe = iframeDocument.elementFromPoint(x - iframeRect.left, y - iframeRect.top);
                if (elementInIframe) {
                    currentElement = elementInIframe;
                    continue;
                }
            } catch (e) {
                // Cross-origin iframe, cannot access document. Stop traversing this path.
            }
        }
        // If no deeper element found in shadow DOM or iframe, break the loop
        break;
    }
    return currentElement;
}

export function getContextId() {
    // Design Intent: Prioritize URL-based ISBN detection to prevent "Context Drift" 
    // when stale manifest data exists in localStorage for other books.
    const url = window.location.href;
    const match = (str) => str?.match(/(\d{10,13})/);
    
    let isbnMatch = match(url) || match(document.referrer);
    if (!isbnMatch) {
        try { isbnMatch = match(window.top.location.href); } catch(e) {}
    }

    if (isbnMatch) return isbnMatch[0].toLowerCase().replace(/[^a-z0-9]/g, '');

    const epubMatch = url.match(/epub\/(.*?)\//);
    return (epubMatch ? epubMatch[1] : 'vessel_global').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Heartbeat check for extension context validity.
 * Design Intent: Prevent "Extension context invalidated" crashes in zombie 
 * content scripts after extension updates/reloads.
 */
export function isExtensionAlive() {
    try {
        // Design Intent: Explicitly check for property access to trigger the 
        // context error early inside a safe try/catch block.
        return !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
    } catch (e) {
        return false;
    }
}

/** Promisified timeout for async orchestration. */
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));