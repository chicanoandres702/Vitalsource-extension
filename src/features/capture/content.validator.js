/**
 * Content validation logic.
 * Design Intent: Isolate heuristic evaluation to keep the detector clean 
 * and ensure rules for different layout types (Fixed vs Reflowable) are distinct.
 */
import { contentHeuristics } from './content.heuristics.js';
import { stateManager } from '../state/state.manager.js';
import { logger } from '../../services/logger.service.js';
import { hasValidIframeContent } from '../../services/dom.service.js';
import { JUNK_PHRASES, UNWANTED_SELECTORS } from './content.constants.js';

export const contentValidator = {
    getPureText(el) {
        if (!el) return '';
        const clone = el.cloneNode(true);
        UNWANTED_SELECTORS.forEach(sel => {
            clone.querySelectorAll(sel).forEach(node => node.remove());
        });
        return (clone.innerText || clone.textContent || '').trim();
    },

    isValid(el, sliderValue = '', isManual = false) {
        if (!el || !el.isConnected) return false;

        // Check reader state (e.g. "Page Loading...")
        if (sliderValue.includes('sync') || sliderValue.includes('load')) return false;

        // Design Intent: If the user manually picked this element (Priority 0),
        // we bypass the majority of heuristic checks to ensure the capture 
        // proceeds as requested.
        if (isManual) return true;

        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (style.opacity !== '' && parseFloat(style.opacity) < 0.5) return false;

        // Heuristic: Spinner detection
        if (contentHeuristics.isBusy(el)) return false;

        const rect = el.getBoundingClientRect();
        if (rect.width < 20 || rect.height < 20) return false;

        const rawText = el.innerText || '';
        const lowerText = rawText.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        // Filter common "junk" states
        if (lowerText.includes('loading') || lowerText.includes('pleasewait') || lowerText.includes('spinner') || lowerText.includes('syncing')) return false;
        if (JUNK_PHRASES.some(p => rawText.toLowerCase().includes(p))) return false;

        const pureText = this.getPureText(el);
        const hasValidMedia = contentHeuristics.containsValidMedia(el, contentHeuristics.isBusy);

        // Filter encrypted payload blobs
        if (pureText.length > 30 && (
            /^[0-9,\s:]+$/.test(pureText.substring(0, 50)) || 
            /\d{1,3}(,\d{1,3}){3,}:[A-Za-z0-9+/=]{10,}/.test(pureText)
        )) return false;

        const hasNonLatin = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\uac00-\ud7af]/.test(pureText);
        if (pureText.length > 60 && !pureText.includes(' ') && !hasNonLatin) return false;

        // Layout-specific thresholds
        const isCover = window.location.href.includes('cover-page');
        if (stateManager.getIsFixedLayout() || isCover) {
            if (hasValidMedia || pureText.length > 5) return true;
        } else {
            if (pureText.length >= 150) {
                const spaceCount = (pureText.match(/ /g) || []).length;
                if (spaceCount < (pureText.length / 50) && !hasNonLatin) {
                    logger.log('SENSOR', 'isContentValid: Low space density rejected.');
                    return false;
                }
                return true;
            }
            if (hasValidMedia && pureText.length > 20) return true;
        }
        
        const iframes = el.tagName === 'IFRAME' ? [el] : Array.from(el.querySelectorAll('iframe'));
        for (const iframe of iframes) {
            if (hasValidIframeContent(iframe, this.getPureText.bind(this), (e) => contentHeuristics.containsValidMedia(e, contentHeuristics.isBusy))) return true;
        }
        return false;
    }
};