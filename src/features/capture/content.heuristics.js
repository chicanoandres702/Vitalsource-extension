/**
 * Visual and state heuristics for content identification.
 * Design Intent: Isolate low-level DOM inspection to keep the detector modular.
 */
import { logger } from '../../services/logger.service.js';

export const contentHeuristics = {
    isBusy(el) {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
        const busySelectors = [
            '[aria-busy="true"]', '.vst-spinner', '.loading', '.spinner', 
            '.skeleton', '.shimmer', '.loader', '[data-testid*="loading"]'
        ].join(',');
        return el.matches(busySelectors) || el.querySelector(busySelectors) !== null;
    },

    isMathJaxRendering(el) {
        if (!el) return false;
        const proc = el.querySelectorAll('.MathJax_Processing, .MathJax_Preview, .MathJax_Display[aria-hidden="true"]');
        for (const p of proc) {
            const style = window.getComputedStyle(p);
            if (style.display !== 'none' && style.visibility !== 'hidden') return true;
        }
        const output = el.querySelectorAll('.MathJax, .tex-mml-chtml');
        for (const o of output) {
            const style = window.getComputedStyle(o);
            if (style.display === 'none' || style.visibility === 'hidden' || o.offsetWidth === 0) return true;
        }
        return false;
    },

    containsValidMedia(el, isBusyFn) {
        if (!el) return false;
        const canvases = el.tagName === 'CANVAS' ? [el] : Array.from(el.querySelectorAll('canvas'));
        for (const c of canvases) {
            if (isBusyFn(c)) continue;
            if (c.width > 150 && c.height > 150) return true;
        }
        const imgs = el.tagName === 'IMG' ? [el] : Array.from(el.querySelectorAll('img'));
        for (const img of imgs) {
            const src = img.src || '';
            const cls = (img.className || '').toLowerCase();
            if (!/spin|loader|skeleton|shimmer/i.test(src + cls)) {
                if (isBusyFn(img)) continue;
                if (img.naturalWidth > 100 || (src.startsWith('data:image') && src.length > 5000)) return true;
            }
        }
        const svgs = el.tagName === 'SVG' ? [el] : Array.from(el.querySelectorAll('svg'));
        for (const s of svgs) if (s.innerHTML.length > 2000 && !isBusyFn(s)) return true;
        return false;
    }
};