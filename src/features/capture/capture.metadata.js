/**
 * Metadata extraction service for book capture.
 */
import contentDetector from './content.detector.js';
import stateManager from '../state/state.manager.js';
import { findDeep } from '../../services/dom.service.js';

const IS_TOP = window.top === window.self;

export const captureMetadata = {
    getCurrentPageValue() {
        // Fallback: If we are in an iframe and can't see the DOM input, use the last synced value
        if (!IS_TOP) return stateManager.getCurrentPage();

        const input = document.querySelector('input[class*="InputControl__input"]');
        if (!input) {
            const inputs = Array.from(document.querySelectorAll('input'));
            for (const i of inputs) {
                if (i.value && /^[ivx0-9]+$/i.test(i.value)) return i.value;
            }
        }
        return input ? input.value : null;
    },

    getAccuratePageLabel() {
        const pagebreaks = stateManager.getPagebreaks();
        if (!pagebreaks || pagebreaks.length === 0) return null;

        for (const pb of pagebreaks) {
            if (!pb || !pb.cfi) continue;
            const idMatch = pb.cfi.match(/\[([^\];=]+)\]$/);
            if (idMatch) {
                const el = document.getElementById(idMatch[1]);
                if (el) {
                    const rect = el.getBoundingClientRect();
                    if (rect.top >= -100 && rect.left >= -100 &&
                        rect.top < window.innerHeight + 100 &&
                        rect.left < window.innerWidth + 100) {
                        return pb.label;
                    }
                }
            }
        }

        const path = new URL(location.href).pathname;
        const urlMatches = pagebreaks.filter(p => p.url && (path.includes(p.url) || path.endsWith(p.url)));
        if (urlMatches.length > 0) return urlMatches[0].label;

        const hash = location.hash;
        if (hash) {
            const pageMatch = hash.match(/page[=\/](\d+)/i);
            if (pageMatch) {
                const pageNum = pageMatch[1];
                const pageMatchPb = pagebreaks.find(p => p.label == pageNum || p.label == `Page ${pageNum}`);
                if (pageMatchPb) return pageMatchPb.label;
            }
        }
        return null;
    },

    getPageInfo() {
        let pageId, pageText;
        try {
            const slider = IS_TOP ? contentDetector.getSlider() : null;
            if (slider && slider.getAttribute) {
                pageId = slider.getAttribute('aria-valuenow');
                pageText = slider.getAttribute('aria-valuetext');
            } else {
                const accurateLabel = this.getAccuratePageLabel();
                if (accurateLabel) {
                    pageId = accurateLabel;
                    pageText = 'Page ' + accurateLabel;
                } else {
                    const pgEl = findDeep('.page-number, .vst-page-count, [data-page], .pbk-page-number', document, true);
                    pageId = pgEl ? (pgEl.getAttribute('data-page') || pgEl.innerText.trim()) : location.href;
                    pageText = pgEl ? pgEl.innerText.trim() : (document.title || 'Page');
                }
            }
        } catch (e) {
            pageId = location.href;
            pageText = document.title || 'Page';
        }
        if (!pageId) pageId = 'unknown-pg';
        if (!pageText || pageText === 'undefined') pageText = 'Current Page';
        return { pageId, pageText };
    },

    getChapterInfo() {
        // Priority 1: Match against the ingested high-fidelity TOC
        const currentPage = this.getCurrentPageValue();
        const outline = stateManager.getOutline();
        if (outline && outline.length > 0 && currentPage) {
            // Normalize for comparison (handles Roman numerals and numeric strings)
            const numericPg = parseInt(String(currentPage).replace(/\D/g, '')) || 0;
            const entry = [...outline].reverse().find(item => parseInt(item.page) <= numericPg);
            if (entry) return entry.title;
        }

        // Priority 2: Fallback to DOM Heuristics
        const chEl = findDeep('.chapter-title, h1, h2, h3, .vst-chapter, .pc img, .title-block', document, true);
        let chapter = chEl ? (chEl.tagName === 'IMG' ? chEl.alt : chEl.innerText.trim()) : 'Book Content';

        if (!chapter || chapter === 'undefined') chapter = 'Active Chapter';
        return chapter;
    }
};
export default captureMetadata;