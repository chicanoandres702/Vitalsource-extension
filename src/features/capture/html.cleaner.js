/**
 * HTML cleaning and processing service
 */
import { findDeep } from '../../services/utils.service.js';

const UNWANTED_SELECTORS = [
    '.pbk-page-header', '.vst-navigation-header', '.epub-running-head',
    '.epub-running-hf', '.epub-running-foot', '.vst-sidebar-ignore',
    '.breadcrumb', '.page-heading-nav', '.vst-breadcrumbs', '.vst-tooltip',
    '.sr-only', '.visually-hidden', '.assistive-text', '[aria-hidden="true"]',
    '#page-number-input', '.page-number-display', '.reader-toolbar', '.site-nav'
];

class HtmlCleaner {
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
        const originalCanvases = node.tagName === 'CANVAS' ? [node] : Array.from(node.querySelectorAll('canvas'));
        const clonedCanvases = wrapper.tagName === 'CANVAS' ? [wrapper] : Array.from(wrapper.querySelectorAll('canvas'));
        for (let i = 0; i < originalCanvases.length; i++) {
            if (originalCanvases[i].width < 50 || originalCanvases[i].height < 50) {
                clonedCanvases[i].remove();
                continue;
            }
            try {
                const dataUrl = originalCanvases[i].toDataURL('image/png');
                if (dataUrl.length < 3500) {
                    clonedCanvases[i].remove();
                    continue;
                }
                const img = document.createElement('img');
                img.src = dataUrl;
                img.className = clonedCanvases[i].className;
                img.style.cssText = clonedCanvases[i].style.cssText;
                clonedCanvases[i].replaceWith(img);
            } catch (e) {
                // Canvas CORS taint - cannot export to image
            }
        }
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

export const htmlCleaner = new HtmlCleaner();