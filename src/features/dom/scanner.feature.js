/**
 * scanner.feature.js
 * Handles deep DOM traversal and shadow-root piercing.
 * Compliance: 100-Line Law
 */

const PilotScanner = {
    _sliderCache: null,
    _highlightEl: null,

    findDeep(selector, root = document) {
        if (!root) return null;
        let el = root.querySelector(selector);
        if (el) return el;

        const nodes = Array.from(root.querySelectorAll('*'));
        for (const n of nodes) {
            if (n.shadowRoot) {
                const found = this.findDeep(selector, n.shadowRoot);
                if (found) return found;
            }
        }

        const iframes = Array.from(root.querySelectorAll('iframe'));
        for (const f of iframes) {
            try {
                const found = this.findDeep(selector, f.contentDocument);
                if (found) return found;
            } catch (e) {}
        }
        return null;
    },

    pierceShadowAtPoint(x, y) {
        let el = document.elementFromPoint(x, y);
        while (el && el.shadowRoot) {
            const inner = el.shadowRoot.elementFromPoint(x, y);
            if (!inner || inner === el) break;
            el = inner;
        }
        return el;
    },

    highlight(el) {
        this.clearHighlight();
        if (!el) return;
        const rect = el.getBoundingClientRect();
        this._highlightEl = document.createElement('div');
        Object.assign(this._highlightEl.style, {
            position: 'fixed', top: `${rect.top}px`, left: `${rect.left}px`,
            width: `${rect.width}px`, height: `${rect.height}px`,
            border: '3px solid #00f2ff', background: 'rgba(0, 242, 255, 0.1)',
            zIndex: '2147483647', pointerEvents: 'none', borderRadius: '4px',
            boxShadow: '0 0 20px rgba(0, 242, 255, 0.4)', transition: 'all 0.15s ease'
        });
        this._highlightEl.id = 'pilot-highlighter';
        document.body.appendChild(this._highlightEl);
    },

    clearHighlight() {
        if (this._highlightEl && this._highlightEl.parentNode) {
            this._highlightEl.parentNode.removeChild(this._highlightEl);
        }
        this._highlightEl = null;
    },

    generateOptimalSelector(el) {
        if (el.id) return `#${el.id}`;
        if (el === document.body) return 'body';
        
        let path = [];
        let curr = el;
        while (curr && curr.nodeType === Node.ELEMENT_NODE && path.length < 5) {
            let s = curr.nodeName.toLowerCase();
            if (curr.className && typeof curr.className === 'string') {
                const c = curr.className.split(/\s+/).filter(x => x && !x.includes(':'))[0];
                if (c) s += `.${c}`;
            }
            path.unshift(s);
            curr = curr.parentNode;
        }
        return path.join(' > ');
    },

    autoDetectContent() {
        for (const s of (window.CONTENT_SELECTORS || [])) {
            const found = this.findDeep(s);
            if (found) return found;
        }
        return null;
    },

    getSlider() {
        if (this._sliderCache) return this._sliderCache;
        return this._sliderCache = this.findDeep('.vst-slider, [role="slider"]');
    }
};

window.PilotScanner = PilotScanner;
