/**
 * DOM traversal and manipulation utilities.
 * Design Intent: Centralize complex DOM interactions, especially iframe traversal,
 * to keep other services focused on their core responsibilities.
 */

import logger from './logger.service.js';

/**
 * Recursively searches for an element within the given root, including shadow DOMs.
 * @param {string} selector - The CSS selector to search for.
 * @param {Document | Element | ShadowRoot} root - The root element to start the search from.
 * @returns {Element | null} The first matching element, or null if not found.
 */
export function findDeep(selector, root = document, traverseIframes = false) {
    if (!selector) return null;
    try {
        const el = root.querySelector(selector);
        if (el) return el;
    } catch (e) {
        // Ignore selector errors
    }
    for (const node of root.querySelectorAll('*')) {
        if (node.shadowRoot) {
            const found = findDeep(selector, node.shadowRoot);
            if (found) return found;
        }
        // Recursively search within same-origin iframes
        if (traverseIframes && node.tagName === 'IFRAME') {
            try {
                // Accessing contentDocument is only possible for same-origin iframes
                const iframeDocument = node.contentDocument || node.contentWindow.document;
                if (iframeDocument) {
                    const foundInIframe = findDeep(selector, iframeDocument, true); // Recursive call
                    if (foundInIframe) return foundInIframe;
                }
            } catch (e) {
                // Cross-origin iframe, cannot access contentDocument. Ignore.
            }
        }
    }
    return null;
}

/**
 * Extracts pure text content from an iframe's body.
 * @param {HTMLIFrameElement} iframe - The iframe element.
 * @param {function(Element): string} getPureContentTextFn - Function to get pure text from an element.
 * @returns {string} The pure text content from the iframe, or an empty string if inaccessible.
 */
export function getIframeContentText(iframe, getPureContentTextFn) {
    try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        if (doc && doc.body) {
            return getPureContentTextFn(doc.body);
        }
    } catch (e) {
        // CORS or other security restrictions prevent access
        logger.log('DATA', 'Iframe content text inaccessible due to CORS:', iframe.src);
    }
    return '';
}

/**
 * Checks if an iframe contains valid content (text or media).
 * @param {HTMLIFrameElement} iframe - The iframe element.
 * @param {function(Element): string} getPureContentTextFn - Function to get pure text from an element.
 * @param {function(Element): boolean} containsValidMediaFn - Function to check for valid media in an element.
 * @returns {boolean} True if the iframe contains valid content, false otherwise.
 */
export function hasValidIframeContent(iframe, getPureContentTextFn, containsValidMediaFn) {
    if (iframe.src && iframe.src !== 'about:blank' && !iframe.src.includes('empty')) {
        try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            if (doc && doc.body) {
                const iframePureText = getPureContentTextFn(doc.body);
                if (iframePureText.length >= 100 || containsValidMediaFn(doc.body)) {
                    return true;
                }
            }
        } catch (e) {
            // CORS or other security restrictions prevent access, but if it's large, assume it's valid
            if (iframe.offsetWidth > 50 && iframe.offsetHeight > 50) {
                logger.log('DATA', 'Iframe content assumed valid due to size (CORS blocked):', iframe.src);
                return true;
            }
        }
    }
    return false;
}

/**
 * Finds large iframes that might contain significant content.
 * @param {Document | Element} root - The root element to search within.
 * @returns {HTMLIFrameElement[]} An array of large iframe elements.
 */
export function getLargeIframes(root = document) {
    return Array.from(root.querySelectorAll('iframe')).filter(f => {
        const r = f.getBoundingClientRect();
        return r.width > 300 && r.height > 300 && !f.src.includes('about:blank');
    });
}

/**
 * Finds large elements (iframes, canvases, or page-like divs) that might 
 * contain significant book content.
 * @param {Document | Element} root - The root element to search within.
 * @returns {Element[]} An array of large elements.
 */
export function getLargeElements(root = document) {
    const iframes = getLargeIframes(root);
    const others = Array.from(root.querySelectorAll('canvas, div')).filter(el => {
        // Filter for divs that look like pages or main content areas
        if (el.tagName === 'DIV' && !el.className.includes('page') && el.getAttribute('role') !== 'main') return false;
        
        const r = el.getBoundingClientRect();
        return r.width > 300 && r.height > 300;
    });
    return iframes.concat(others);
}

/**
 * Extracts media source information from an iframe's content.
 * @param {HTMLIFrameElement} iframe - The iframe element.
 * @param {function(Element): string} getPureContentTextFn - Function to get pure text from an element.
 * @returns {string} A string representation of media sources within the iframe.
 */
export function getIframeMediaSource(iframe, getPureContentTextFn) {
    try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        if (doc && doc.body) {
            return getPureContentTextFn(doc.body); // Re-using getPureContentText for simplicity, could be more specific
        }
    } catch (e) {
        // CORS or other security restrictions prevent access
    }
    return '';
}