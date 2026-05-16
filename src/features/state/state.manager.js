/**
 * Global state management for the extension
 */
import logger from '../../services/logger.service.js';
import statePersistence from './state.persistence.js'; // Assuming this is correct
import { getContextId } from '../../services/utils.service.js';
import manifestState from './manifest.state.js';
import stabilizationState from './stabilization.state.js';
class StateManager {
    constructor() {
        this.currentBookId = null;
        this.sessionHashes = new Set();
        this.capturedPageCount = 0;
        this.isScraping = false;
        this.autoPilot = false;
        this.customSelector = null;
        this.autoPilotStopPage = null;
        this.flipDelay = 500;
        this.lastFlipTime = 0;
        this.hasSnappedCurrentPage = false;
        this.fixedLayout = false; // Design Intent: Track book layout for heuristic thresholds

        statePersistence.loadInitial((sel) => { this.customSelector = sel; });
    }

    /**
     * Design Intent: Standardized entry point for the sidebar orchestrator.
     * Prevents "init is not a function" TypeErrors.
     */
    init() {
        this.discoverInternalData();
        logger.log('BRIDGE', 'State Manager Initialized');
    }

    discoverInternalData() {
        manifestState.discoverInternalData((isFixed) => this.setFixedLayout(isFixed));
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


    setHasSnappedCurrentPage(hasSnapped) {
        this.hasSnappedCurrentPage = hasSnapped;
    }

    // Fingerprinting
    setLastContentFP(fp) { stabilizationState.setLastContentFP(fp); }
    getLastContentFP() { return stabilizationState.getLastContentFP(); }
    setLastTextHash(hash) { stabilizationState.setLastTextHash(hash); }
    getLastTextHash() { return stabilizationState.getLastTextHash(); }
    setStabilizeFP(fp) { stabilizationState.setStabilizeFP(fp); }
    getStabilizeFP() { return stabilizationState.getStabilizeFP(); }
    setStabilizeReady(ready) { stabilizationState.setStabilizeReady(ready); }
    getStabilizeReady() { return stabilizationState.getStabilizeReady(); }

    getIsFixedLayout() {
        return this.fixedLayout;
    }

    setFixedLayout(isFixed) {
        this.fixedLayout = isFixed;
    }
    // Getters
    getOutline() { return manifestState.getOutline(); }
    getPagebreaks() { return manifestState.getPagebreaks(); }
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

    getHasSnappedCurrentPage() { return this.hasSnappedCurrentPage; }

    // TOC / Outline sync (restored from old git commits)
    setOutline(outline, bookId) {
        this.currentBookId = bookId || this.currentBookId;
        this.outline = outline || [];
        // Broadcast to side panel
        try {
            chrome.runtime.sendMessage({ type: 'TOC_UPDATE', data: this.outline, bookId: this.currentBookId });
        } catch (e) {}
        console.log('[State] Outline synced:', this.outline.length, 'items');
    }

    setPagebreaks(pagebreaks, bookId) {
        this.pagebreaks = pagebreaks || [];
        try {
            chrome.runtime.sendMessage({ type: 'PAGEBREAKS_UPDATE', data: this.pagebreaks, bookId: this.currentBookId });
        } catch (e) {}
    }

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

export default new StateManager();