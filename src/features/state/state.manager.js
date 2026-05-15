/**
 * Global state management for the extension
 */
import { logger } from '../../services/logger.service.js';
import { statePersistence } from './state.persistence.js';
import { internalDiscovery } from '../../internal-discovery.service.js';
import { getContextId } from '../../services/utils.service.js';

class StateManager {
    constructor() {
        this.outline = [];
        this.pagebreaks = [];
        this.currentBookId = null;
        this.sessionHashes = new Set();
        this.capturedPageCount = 0;
        this.isScraping = false;
        this.autoPilot = false;
        this.customSelector = null;
        this.autoPilotStopPage = null;
        this.flipDelay = 500;
        this.lastFlipTime = 0;
        this.isTransitioning = false;
        this.hasSnappedCurrentPage = false;
        this.lastContentFP = '';
        this.lastTextHash = '';
        this._lastStabilizeFP = '';
        this._stabilizeReady = false;
        this.fixedLayout = false; // Design Intent: Track book layout for heuristic thresholds

        statePersistence.loadInitial((sel) => { this.customSelector = sel; });
        this.discoverInternalData();
    }

    // Outline management
    setOutline(data, bookId) {
        this.outline = data;
        this.currentBookId = bookId || this.currentBookId;

        if (logger.debug) logger.log('DATA', `Captured TOC for Book: ${this.currentBookId}. Items: ${this.outline.length}`);

        statePersistence.saveOutline(this.currentBookId, this.outline);
    }

    discoverInternalData() {
        // Design Intent: Resolve the current Book ID from the context 
        // before looking up internal manifest data to ensure TOC alignment.
        const bookId = getContextId();
        const data = internalDiscovery.getManifest(bookId);
        if (data) this.setOutline(data.toc, data.bookId);
        if (data?.isFixed) this.setFixedLayout(true);
    }

    // Pagebreaks management
    setPagebreaks(data, bookId) {
        this.pagebreaks = data;
        this.currentBookId = bookId || this.currentBookId;

        if (logger.debug) logger.log('DATA', `Captured Pagebreaks for Book: ${this.currentBookId}. Items: ${this.pagebreaks.length}`);

        statePersistence.savePagebreaks(this.currentBookId, this.pagebreaks);
    }

    // Session management
    clearSessionHashes() {
        this.sessionHashes.clear();
    }

    addSessionHash(hash) {
        this.sessionHashes.add(hash);
    }

    hasSessionHash(hash) {
        return this.sessionHashes.has(hash);
    }

    // Configuration
    configureEngine(config) {
        this.isScraping = config.state;
        this.autoPilot = config.state;
        this.flipDelay = config.speed || this.flipDelay;
        this.autoPilotStopPage = config.stopPage || null;
    }

    setSpeed(speed) {
        this.flipDelay = speed || this.flipDelay;
    }

    // Page state
    setTransitioning(isTransitioning) {
        this.isTransitioning = isTransitioning;
        if (isTransitioning) {
            if (this._transitionSafetyTimeout) clearTimeout(this._transitionSafetyTimeout);
            this._transitionSafetyTimeout = setTimeout(() => {
                if (this.isTransitioning) {
                    logger.log('NAV', 'Transition lock safety timeout reached. Forcing release.');
                    this.setTransitioning(false);
                }
            }, 8000); // 8s safety net
        } else if (this._transitionSafetyTimeout) {
            clearTimeout(this._transitionSafetyTimeout);
            this._transitionSafetyTimeout = null;
        }
    }

    setHasSnappedCurrentPage(hasSnapped) {
        this.hasSnappedCurrentPage = hasSnapped;
    }

    // Fingerprinting
    setLastContentFP(fp) {
        this.lastContentFP = fp;
    }

    setLastTextHash(hash) {
        this.lastTextHash = hash;
    }

    setStabilizeFP(fp) {
        this._lastStabilizeFP = fp;
    }

    setStabilizeReady(ready) {
        this._stabilizeReady = ready;
    }

    getStabilizeFP() {
        return this._lastStabilizeFP;
    }

    getStabilizeReady() {
        return this._stabilizeReady;
    }

    getIsFixedLayout() {
        return this.fixedLayout;
    }

    setFixedLayout(isFixed) {
        this.fixedLayout = isFixed;
    }
    // Getters
    getOutline() { return this.outline; }
    getPagebreaks() { return this.pagebreaks; }
    getCurrentBookId() { return this.currentBookId; }
    getCapturedPageCount() { return this.capturedPageCount; }
    incrementCapturedPageCount() { return ++this.capturedPageCount; }
    getIsScraping() { return this.isScraping; }
    getAutoPilot() { return this.autoPilot; }
    setCustomSelector(selector) {
        this.customSelector = selector;
        statePersistence.saveCustomSelector(selector);
    }
    getCustomSelector() { return this.customSelector; }
    getAutoPilotStopPage() { return this.autoPilotStopPage; }
    getFlipDelay() { return this.flipDelay; }
    getLastFlipTime() { return this.lastFlipTime; }
    setLastFlipTime(time) { this.lastFlipTime = time; }
    getIsTransitioning() { return this.isTransitioning; }
    getHasSnappedCurrentPage() { return this.hasSnappedCurrentPage; }
    getLastContentFP() { return this.lastContentFP; }
    getLastTextHash() { return this.lastTextHash; }

    // Current page
    getCurrentPage() {
        const input = document.querySelector('input[class*="InputControl__input"]');
        if (!input) {
            // Fallback to searching all inputs for a numeric or roman value
            const inputs = Array.from(document.querySelectorAll('input'));
            for (const i of inputs) {
                if (i.value && /^[ivx0-9]+$/i.test(i.value)) return i.value;
            }
        }
        return input ? input.value : 'unknown';
    }

    // Check if at end of book
    isAtEnd() {
        // Check if next button is disabled or not present
        const nextBtn = document.querySelector('button[aria-label="Next Page"], .next-button, [data-testid="next-btn"]');
        return !nextBtn || nextBtn.disabled;
    }
}

export const stateManager = new StateManager();