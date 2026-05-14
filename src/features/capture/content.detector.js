/**
 * Content detection and validation service
 */
import { findDeep } from '../../services/utils.service.js';
import { logger } from '../../services/logger.service.js';

const CONTENT_SELECTORS = [
    '#epub-content-container', 'section.chapter-rw', '.mosaic-page', '.epub-container',
    '.vst-main', 'main[role="main"]', '.vst-cover', '.cover-image', '.book-cover',
    '.front-matter', 'img[alt*="cover" i]'
];

const UNWANTED_SELECTORS = [
    '.pbk-page-header', '.vst-navigation-header', '.epub-running-head',
    '.epub-running-hf', '.epub-running-foot', '.vst-sidebar-ignore',
    '.breadcrumb', '.page-heading-nav', '.vst-breadcrumbs', '.vst-tooltip',
    '.sr-only', '.visually-hidden', '.assistive-text', '[aria-hidden="true"]',
    '#page-number-input', '.page-number-display', '.reader-toolbar', '.site-nav'
];

class ContentDetector {
    constructor() {
        this.sliderCache = null;
        this.sliderCacheTs = 0;
    }

    getSlider() {
        if (this.sliderCache && Date.now() - this.sliderCacheTs < 3000) return this.sliderCache;
        this.sliderCache = findDeep('[role="slider"][aria-label="Book Progression"]');
        this.sliderCacheTs = Date.now();
        return this.sliderCache;
    }

    invalidateSliderCache() {
        this.sliderCache = null;
    }

    containsValidMedia(el) {
        if (!el) return false;
        const canvases = el.tagName === 'CANVAS' ? [el] : Array.from(el.querySelectorAll('canvas'));
        for (let i = 0; i < canvases.length; i++) {
            if (canvases[i].width > 150 && canvases[i].height > 150) {
                try {
                    const dataURL = canvases[i].toDataURL();
                    if (dataURL.length > 3500) return true;
                } catch(e) { return true; }
            }
        }
        const imgs = el.tagName === 'IMG' ? [el] : Array.from(el.querySelectorAll('img'));
        for (let i = 0; i < imgs.length; i++) {
            const src = imgs[i].src || '';
            const cls = (imgs[i].className || '').toLowerCase();
            if (!src.includes('spin') && !cls.includes('spin') && !src.includes('loader') && !src.includes('skeleton')) {
                if (imgs[i].naturalWidth > 100 || imgs[i].width > 100 || (src.startsWith('data:image') && src.length > 5000)) {
                    return true;
                }
            }
        }
        const svgs = el.tagName === 'SVG' ? [el] : Array.from(el.querySelectorAll('svg'));
        for (let i = 0; i < svgs.length; i++) {
            if (svgs[i].innerHTML.length > 2000 && !svgs[i].classList.contains('spinner')) return true;
        }
        return false;
    }

    getPureContentText(el) {
        if (!el) return '';
        const clone = el.cloneNode(true);
        UNWANTED_SELECTORS.forEach(sel => {
            clone.querySelectorAll(sel).forEach(node => node.remove());
        });
        return (clone.innerText || clone.textContent || '').trim();
    }

    isContentValid(el) {
        if (!el) return false;
        const slider = this.getSlider();
        if (slider) {
            const val = (slider.getAttribute('aria-valuetext') || '').toLowerCase();
            if (val.includes('sync') || val.includes('load')) {
                return false;
            }
        }
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (style.opacity !== '' && parseFloat(style.opacity) < 0.5) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) return false;
        const lowerText = (el.innerText || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (lowerText.includes('loading') || lowerText.includes('pleasewait') || lowerText.includes('spinner') || lowerText.includes('syncing')) {
            return false;
        }
        const pureText = this.getPureContentText(el);
        // Ignore data-strings that look like byte arrays (comma-separated numbers)
        if (pureText.length > 30 && /^[0-9,\s:]+$/.test(pureText.substring(0, 50))) return false;

        // VOCABULARY CHECK: If text is long but has no spaces, it's likely a token/placeholder
        // [FIX] Exclude common non-space-using scripts (Chinese, Japanese, Korean)
        const hasNonLatin = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\uac00-\ud7af]/.test(pureText);

        if (pureText.length > 60 && !pureText.includes(' ') && !hasNonLatin) return false;

        // Ratio check: 1 space per 50 chars is very generous for dense technical text
        const spaceCount = (pureText.match(/ /g) || []).length;
        if (pureText.length > 150 && spaceCount < (pureText.length / 50) && !hasNonLatin) return false;

        if (pureText.length >= 100) return true;
        if (this.containsValidMedia(el)) return true;
        const iframes = el.tagName === 'IFRAME' ? [el] : Array.from(el.querySelectorAll('iframe'));
        for (let i = 0; i < iframes.length; i++) {
            if (iframes[i].src && iframes[i].src !== 'about:blank' && !iframes[i].src.includes('empty')) {
                try {
                    const doc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                    if (doc && doc.body) {
                        const iframePureText = this.getPureContentText(doc.body);
                        if (iframePureText.length >= 100 || this.containsValidMedia(doc.body)) return true;
                    }
                } catch(e) {
                    if (iframes[i].offsetWidth > 50 && iframes[i].offsetHeight > 50) return true;
                }
            }
        }
        return false;
    }

    autoDetectContent(force = false) {
        for (const sel of CONTENT_SELECTORS) {
            const el = findDeep(sel);
            if (el && this.isContentValid(el)) return el;
        }
        const bigElements = Array.from(document.querySelectorAll('iframe, canvas, div')).filter(el => {
            if (el.tagName === 'DIV' && !el.className.includes('page') && el.getAttribute('role') !== 'main') return false;
            const r = el.getBoundingClientRect();
            return r.width > 300 && r.height > 300;
        });
        for (const el of bigElements) {
            if (this.isContentValid(el)) return el;
        }
        if (force) logger.log('DATA', 'Force mode: extended search exhausted. Returning null — will retry.');
        return null;
    }

    getFingerprintSource(el) {
        if (!el) return '';
        let text = this.getPureContentText(el);
        const iframes = el.querySelectorAll('iframe');
        for (let i = 0; i < iframes.length; i++) {
            try {
                const doc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                if (doc && doc.body) text += this.getPureContentText(doc.body);
            } catch(e) {}
        }
        const media = Array.from(el.querySelectorAll('img, canvas, iframe, video, svg'))
            .map(m => {
                if (m.tagName === 'CANVAS') {
                    try {
                        const d = m.toDataURL();
                        return `CANVAS_${m.width}x${m.height}_${d.substring(d.length/2, d.length/2 + 50)}`;
                    } catch(e) {
                        return `CANVAS_${m.width}x${m.height}`;
                    }
                }
                if (m.tagName === 'SVG') return `SVG_${m.innerHTML.length}`;
                if (m.tagName === 'IMG') {
                    if (m.width < 10 || m.height < 10 || m.src.includes('spin')) return '';
                    return m.src.length > 500 ? `IMG_B64_${m.src.length}` : (m.src || m.tagName);
                }
                return m.src || m.tagName;
            }).join('|');
        return text + '|' + media;
    }
}

export const contentDetector = new ContentDetector();