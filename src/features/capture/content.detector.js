/**
 * Content detection and validation service
 * Design Intent: Orchestrates the search for content across the viewport
 * and iframes while complying with the 100-line modularity law.
 */
import { findDeep, getLargeElements, getIframeMediaSource } from '../../services/dom.service.js';
import logger from '../../services/logger.service.js';
import { contentHeuristics } from './content.heuristics.js';
import { contentValidator } from './content.validator.js';
import { CONTENT_SELECTORS } from './content.constants.js';
import stateManager from '../state/state.manager.js';
import { isContentValidForSnap } from './strategies/validation.strategy.js';

class ContentDetector {
    constructor() {
        this.sliderCache = null;
        this.sliderCacheTs = 0;
    }

    /**
     * Design Intent: Standardized entry point for the sidebar orchestrator.
     * Prevents "init is not a function" TypeErrors.
     */
    init() {
        logger.log('SENSOR', 'Content Detector Active');
    }

    getSlider() {
        if (this.sliderCache && Date.now() - this.sliderCacheTs < 3000) return this.sliderCache;
        this.sliderCache = findDeep('[role="slider"][aria-label="Book Progression"]');
        this.sliderCacheTs = Date.now();
        return this.sliderCache;
    }

    invalidateSliderCache() { this.sliderCache = null; }
    findDeep(selector, root) { return findDeep(selector, root); }
    isBusy(el) { return contentHeuristics.isBusy(el); }
    containsValidMedia(el) { return contentHeuristics.containsValidMedia(el, this.isBusy); }
    isMathJaxRendering(el) { return contentHeuristics.isMathJaxRendering(el); }
    getPureContentText(el) { return contentValidator.getPureText(el); }
    
    isContentValid(el) {
        const slider = this.getSlider();
        const sliderText = slider ? (slider.getAttribute('aria-valuetext') || '').toLowerCase() : '';
        return isContentValidForSnap(el, contentValidator.getPureText.bind(contentValidator)) 
            && contentValidator.isValid(el, sliderText);
    }

    autoDetectContent(force = false) {
        if (typeof chrome === 'undefined' || !chrome.runtime?.id) return null;

        // Design Intent: Priority 0 - Target the user-picked element.
        // We pierce all frames/shadows to find the specific "mosaic-book" 
        // or custom class provided by the user.
        const customSel = stateManager.getCustomSelector();
        if (customSel) {
            const el = findDeep(customSel, document, true); 
            if (el && contentValidator.isValid(el, '', true)) return el;
        }

        // Design Intent: Priority 1 - Scan for known high-fidelity book containers
        for (const sel of CONTENT_SELECTORS) {
            const el = findDeep(sel, document, true);
            if (el && this.isContentValid(el)) return el;
        }
        const bigElements = getLargeElements();
        for (const el of bigElements) {
            if (this.isContentValid(el)) return el;
        }

        // Smart fallback: strongly prefer mosaic-book container (contains the page iframe)
        const mosaicBook = document.querySelector('body > mosaic-book, mosaic-book');
        if (mosaicBook && this.isContentValid(mosaicBook)) {
            return mosaicBook;
        }

        // Fallback: find the <section> with the most text content
        const sections = document.querySelectorAll('section[role="region"], section.sect2, section[epub\\:type], section');
        let bestSection = null;
        let maxText = 0;
        for (const sec of sections) {
            const textLen = (sec.innerText || '').length;
            if (textLen > maxText && textLen > 200) {
                maxText = textLen;
                bestSection = sec;
            }
        }
        if (bestSection && this.isContentValid(bestSection)) return bestSection;

        // if (force) logger.log('DATA', 'Force mode: extended search exhausted. Returning null — will retry.');
        return null;
    }

    /**
     * Retrieves a raw text representation of the current page's main content.
     * This is used for content stability checks, accounting for both text-heavy
     * (reflowable) and visual-heavy (fixed) layouts.
     * @returns {string} A string representing the page's content.
     */
    getRawPageText() {
        const mainContentElement = this.autoDetectContent();
        let rawText = '';

        if (mainContentElement) {
            rawText = this.getPureContentText(mainContentElement);
            if (rawText.trim().length < 50 && this.containsValidMedia(mainContentElement)) {
                rawText += ' [VISUAL_CONTENT_DETECTED]'; // Marker for visual-only pages
            }
        } else {
            rawText = document.body.innerText; // Fallback to entire body text
        }
        return rawText;
    }

    getFingerprintSource(el) {
        if (!el) return '';
        let text = contentValidator.getPureText(el);
        for (const iframe of el.querySelectorAll('iframe')) {
            text += getIframeMediaSource(iframe, contentValidator.getPureText.bind(contentValidator));
        }
        const media = Array.from(el.querySelectorAll('img, canvas, iframe, video, svg'))
            .map(m => {
                if (m.tagName === 'CANVAS') {
                    return `CANVAS_${m.width}x${m.height}`;
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

export default new ContentDetector();