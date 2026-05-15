/**
 * c:\Users\Andrew\Downloads\Vitalsource-extension\src\features\capture\internal-discovery.service.js
 * Internal Discovery Service
 * Design Intent: Extract high-fidelity metadata and manifest data from 
 * VitalSource's internal state (Mimeo API and localStorage cache).
 */
import { findDeep } from '../../services/dom.service.js';

export const internalDiscovery = {
    /**
     * Scrapes the high-fidelity TOC from localStorage.
     * Design Intent: Target a specific ISBN to prevent pulling stale TOC 
     * data from previously viewed books.
     */
    getManifest(targetBookId = null) {
        try {
            // If targetBookId is provided, look for that specific key. 
            // Otherwise, fall back to the first TOC found (legacy behavior).
            const tocKey = targetBookId 
                ? `__VS_TOC_${targetBookId}` 
                : Object.keys(localStorage).find(k => k.startsWith('__VS_TOC_'));
                
            if (!tocKey) return null;

            const bookId = tocKey.split('_').pop();
            const toc = JSON.parse(localStorage.getItem(tocKey));
            
            // Check if any page path suggests a fixed layout (usually image-based)
            const isFixed = toc.some(item => item.path?.includes('page-'));
            
            return { bookId, toc, isFixed };
        } catch (e) {
            return null;
        }
    },

    /**
     * Mimeo API availability is checked via the presence of the 
     * window.Mimeo object. In the content script context, 
     * this requires a Main World check.
     */
    isMimeoAvailable() {
        // High Fidelity: Check for the definitive Mosaic tag or the jigsaw domain
        // Use findDeep to check within same-origin iframes as well.
        return !!findDeep('mosaic-book', document, true) || 
               window.location.host.includes('jigsaw.vitalsource.com');
    }
};