/**
 * Verification service for page readiness.
 * Design Intent: Consolidate UI and asset state checks to prevent blank snaps.
 */
import contentDetector from './content.detector.js';

export const captureReadiness = {
    isBusy() {
        const selectors = [
            '[aria-busy="true"]', '.vst-spinner', '.pbk-page-loading',
            '.loading', '.spinner', '[data-testid*="loading"]',
            'img[src*="spin"]', '.skeleton', '.shimmer',
            '[role="progressbar"]', '.loader'
        ].join(', ');
        
        const spinners = document.querySelectorAll(selectors);
        for (const el of spinners) {
            const style = window.getComputedStyle(el);
            if (el.offsetWidth > 0 && el.offsetHeight > 0 && 
                style.visibility !== 'hidden' && style.display !== 'none') {
                return true;
            }
        }
        return false;
    },

    hasPendingAssets(target) {
        if (!target) return false;
        
        const imgs = target.querySelectorAll('img');
        for (const img of imgs) {
            if (!img.complete && img.src && !img.src.includes('data:image')) {
                return true;
            }
        }
        
        const canvases = target.querySelectorAll('canvas');
        for (const canvas of canvases) {
            if (canvas.width === 0 || canvas.height === 0) {
                return true;
            }
        }
        return false;
    },

    isStable(currentFP, storedFP, isReady) {
        if (currentFP !== storedFP) {
            return { stable: false, ready: false };
        }
        if (!isReady) {
            return { stable: true, ready: true };
        }
        return { stable: true, ready: true, snap: true };
    }
};
export default captureReadiness;