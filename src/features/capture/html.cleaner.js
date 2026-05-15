/**
 * HTML cleaning and processing service
 */
import { findDeep } from '../../services/dom.service.js';
import canvasCleaner from './canvas-cleaner.js';

const UNWANTED_SELECTORS = [
    '.pbk-page-header', '.vst-navigation-header', '.epub-running-head',
    '.epub-running-hf', '.epub-running-foot', '.vst-sidebar-ignore',
    '.breadcrumb', '.page-heading-nav', '.vst-breadcrumbs', '.vst-tooltip',
    '.sr-only', '.visually-hidden', '.assistive-text', '[aria-hidden="true"]',
    '#page-number-input', '.page-number-display', '.reader-toolbar', '.site-nav'
];

class HtmlCleaner {
    /**
     * Design Intent: Placeholder init method to prevent TypeError
     * if calling modules expect a service to have an initialization function.
     */
    init() {
        // No specific initialization logic required for HtmlCleaner at this time.
    }
    getAbsoluteStyles() {
        let out = '';
        document.querySelectorAll('link[rel="stylesheet"], style').forEach(el => {
            if (el.tagName === 'STYLE') {
                out += el.outerHTML;
            } else if (el.href) {
                try { out += `<link rel="stylesheet" href="${new URL(el.href, location.href).href}">`; } catch (e) {}
            }
        });
        return out;
    }

    cleanAndResolveHTML(node) {
        const wrapper = document.createElement('div');
        wrapper.appendChild(node.cloneNode(true));
        wrapper.querySelectorAll('#pilot-root').forEach(el => el.remove());

        // NUKE UNWANTED RECURRING HEADERS/NAV
        UNWANTED_SELECTORS.forEach(sel => {
            wrapper.querySelectorAll(sel).forEach(el => el.remove());
        });

        const resolve = url => {
            if (!url || url.startsWith('data:') || url.startsWith('http')) return url;
            try { return new URL(url, location.href).href; } catch (e) { return url; }
        };
        wrapper.querySelectorAll('img, source, image').forEach(el => {
            const src = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('xlink:href');
            if (src) el.setAttribute('src', resolve(src));
        });
        const originalIframes = node.tagName === 'IFRAME' ? [node] : Array.from(node.querySelectorAll('iframe'));
        const clonedIframes = wrapper.tagName === 'IFRAME' ? [wrapper] : Array.from(wrapper.querySelectorAll('iframe'));
        for (let i = 0; i < originalIframes.length; i++) {
            try {
                const doc = originalIframes[i].contentDocument || originalIframes[i].contentWindow.document;
                if (doc && doc.body) {
                    const iframeBase = doc.location.href;
                    const div = document.createElement('div');
                    div.innerHTML = doc.body.innerHTML;
                    div.querySelectorAll('img, source, image').forEach(el => {
                        const src = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('xlink:href');
                        if (src) {
                            try { el.setAttribute('src', new URL(src, iframeBase).href); } catch(e){}
                        }
                    });
                    clonedIframes[i].replaceWith(div);
                }
            } catch (e) {
                // Iframe extraction blocked by CORS. Leaving native frame.
            }
        }
        canvasCleaner.convertCanvases(node, wrapper);
        ['__hrp__', '.vstskip', '.vst-ignore', 'script', 'button', 'template',
         '.sc-czWrlN', '.Tooltip__tooltip', '.sr-only', '.visually-hidden',
         '.assistive-text', '[aria-hidden="true"]', '[role="tooltip"]'].forEach(sel => {
            wrapper.querySelectorAll(sel).forEach(el => el.remove());
        });

        // SCRUB WATERMARK CANDIDATES & UI NOISE
        wrapper.querySelectorAll('*').forEach(el => {
            // Remove elements that are meant to be hidden from users
            const style = el.getAttribute('style') || '';
            if (style.includes('display: none') || style.includes('visibility: hidden')) {
                el.remove();
                return;
            }

            // Remove typical "hidden watermark" or "ui label" containers
            const text = (el.textContent || '').trim();
            // If text is a long single word (no spaces) but isn't code, it might be a hash/watermark
            if (text.length > 30 && !text.includes(' ') && el.children.length === 0) {
                if (!/^[a-zA-Z0-9+/=]+$/.test(text)) { // Not clearly base64, so maybe random noise
                     el.remove();
                     return;
                }
            }

            Array.from(el.attributes).forEach(attr => {
                if (/^(rtrvr-|mosaic-|data-)/.test(attr.name)) el.removeAttribute(attr.name);
            });
        });
        return wrapper.innerHTML || '';
    }
}

export default new HtmlCleaner();