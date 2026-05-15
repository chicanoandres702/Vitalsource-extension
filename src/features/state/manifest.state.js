/**
 * Manifest State Sub-Feature
 * Design Intent: Manages TOC and pagebreak data to keep StateManager under 100 lines.
 */
import statePersistence from './state.persistence.js';
import internalDiscovery from '../capture/internal-discovery.service.js';
import { getContextId } from '../../services/utils.service.js';
import logger from '../../services/logger.service.js';

export const manifestState = {
    outline: [],
    pagebreaks: [],

    setOutline(data, bookId) {
        this.outline = data;
        if (logger.debug) logger.log('DATA', `TOC Updated: ${bookId}`);
    },

    setPagebreaks(data, bookId) {
        this.pagebreaks = data;
        statePersistence.savePagebreaks(bookId, this.pagebreaks);
    },

    discoverInternalData(onLayoutDetected) {
        const bookId = getContextId();
        const data = internalDiscovery.getManifest(bookId);
        if (data) {
            this.setOutline(data.toc, data.bookId);
            if (data.isFixed) onLayoutDetected(true);
        }
    },

    getOutline() { return this.outline; },
    getPagebreaks() { return this.pagebreaks; }
};
export default manifestState;