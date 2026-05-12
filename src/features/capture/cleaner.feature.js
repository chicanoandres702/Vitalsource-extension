/**
 * cleaner.feature.js
 * Handles HTML scrubbing, URI resolution, and media extraction.
 */

const PilotCleaner = {
    cleanAndResolveHTML(node) {
        const clone = node.cloneNode(true);
        const baseUrl = location.href.split(/[?#]/)[0];

        // Resolve URLs
        const resolve = (attr) => {
            // Escape colons in namespaced attributes for querySelectorAll
            const escapedAttr = attr.replace(/:/g, '\\:');
            clone.querySelectorAll(`[${escapedAttr}]`).forEach(el => {
                const val = el.getAttribute(attr);
                if (val && !val.startsWith('data:') && !val.startsWith('http')) {
                    try { el.setAttribute(attr, new URL(val, baseUrl).href); } catch(e){}
                }
            });
        };
        ['src', 'href', 'data-src', 'xlink:href'].forEach(resolve);

        // Remove noise
        const noise = 'script, style, iframe, .vst-controls, .vst-nav, [aria-hidden="true"]';
        clone.querySelectorAll(noise).forEach(el => el.remove());

        return clone.innerHTML;
    },

    getAbsoluteStyles() {
        let css = '';
        const sheets = Array.from(document.styleSheets);
        for (const sheet of sheets) {
            try {
                const rules = Array.from(sheet.cssRules || []);
                for (const rule of rules) {
                    if (rule.cssText.includes('@font-face')) continue;
                    css += rule.cssText + '\n';
                }
            } catch (e) {}
        }
        return `<style>${css}</style>`;
    },

    containsValidMedia(node) {
        return node.querySelector('img, svg, canvas, video, audio') !== null;
    },

    quickHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash.toString(36);
    }
};

window.PilotCleaner = PilotCleaner;
