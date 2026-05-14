/**
 * Utility functions for hashing, debouncing, and DOM operations
 */

export function quickHash(str) {
    let h = 5381;
    const sample = str ? str.substring(0, 2500) : '';
    for (let i = 0; i < sample.length; i++) h = ((h << 5) + h) ^ sample.charCodeAt(i);
    return (h >>> 0).toString(36);
}

export function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function findDeep(selector, root = document) {
    if (!selector) return null;
    try { const el = root.querySelector(selector); if (el) return el; } catch (e) {}
    for (const node of root.querySelectorAll('*')) {
        if (node.shadowRoot) {
            const found = findDeep(selector, node.shadowRoot);
            if (found) return found;
        }
    }
    return null;
}

export function pierceShadowAtPoint(x, y) {
    let el = document.elementFromPoint(x, y);
    while (el && el.shadowRoot) {
        const inner = el.shadowRoot.elementFromPoint(x, y);
        if (!inner || inner === el) break;
        el = inner;
    }
    return el;
}

export function getContextId() {
    let url = window.location.href;
    let isbnMatch = url.match(/(\d{10,13})/);
    if (!isbnMatch && document.referrer) {
        isbnMatch = document.referrer.match(/(\d{10,13})/);
    }
    if (!isbnMatch) {
        try { isbnMatch = window.top.location.href.match(/(\d{10,13})/); } catch(e) {}
    }
    const epubMatch = url.match(/epub\/(.*?)\//);
    const id = isbnMatch ? isbnMatch[1] : (epubMatch ? epubMatch[1] : 'vessel_global');
    const normalized = id.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalized;
}