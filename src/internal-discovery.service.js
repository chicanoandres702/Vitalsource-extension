
/**
 * c:\Users\Andrew\Downloads\Vitalsource-extension\src\internal-discovery.service.js
 * Internal Discovery Service
 * Design Intent: Extract high-fidelity metadata and manifest data from 
 * VitalSource's internal state (Mimeo API and localStorage cache).
 */

export const internalDiscovery = {
    /**
     * Scrapes the high-fidelity TOC from localStorage.
     * Design Intent: Target a specific ISBN to prevent pulling stale TOC 
     * data from previously viewed books.
     */
    getManifest(targetBookId = null) {
        try {
            // If targetBookId is provided, look for that specific key. 
            // Otherwise, fall back to the first TOC found.
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
     * Checks if the Mimeo print service is available in the current context.
     * Accessing window.Mimeo from an isolated content script 
     * requires a world-bridge injection.
     */
    isMimeoAvailable() {
        // Design Intent: Mimeo availability is a heuristic for the Jigsaw 
        // engine being active in the current frame context.
        return typeof window.Mimeo !== 'undefined' || !!document.querySelector('mosaic-book');
    }
};