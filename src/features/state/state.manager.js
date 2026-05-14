/**
 * Global state management for the extension
 */
import { logger } from '../../services/logger.service.js';

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
        this.flipDelay = 1200;
        this.lastFlipTime = 0;
        this.isTransitioning = false;
        this.hasSnappedCurrentPage = false;
        this.lastContentFP = '';
        this.lastTextHash = '';
        this._lastStabilizeFP = '';
        this._stabilizeReady = false;

        try {
            chrome.storage.local.get(['lastCustomSelector'], (res) => {
                if (res.lastCustomSelector) {
                    this.customSelector = res.lastCustomSelector;
                }
            });
        } catch (e) {}
    }

    // Outline management
    setOutline(data, bookId) {
        this.outline = data;
        this.currentBookId = bookId || this.currentBookId;

        if (logger.debug) logger.log('DATA', `Captured TOC for Book: ${this.currentBookId}. Items: ${this.outline.length}`);

        try {
            if (this.currentBookId) {
                const saveObj = { bookId: this.currentBookId };
                saveObj[`outline_${this.currentBookId}`] = this.outline;
                chrome.storage.local.set(saveObj);
            }
        } catch (e) {}
    }

    // Pagebreaks management
    setPagebreaks(data, bookId) {
        this.pagebreaks = data;
        this.currentBookId = bookId || this.currentBookId;

        if (logger.debug) logger.log('DATA', `Captured Pagebreaks for Book: ${this.currentBookId}. Items: ${this.pagebreaks.length}`);

        try {
            if (this.currentBookId) {
                const saveObj = { bookId: this.currentBookId };
                saveObj[`pagebreaks_${this.currentBookId}`] = this.pagebreaks;
                chrome.storage.local.set(saveObj);
            }
        } catch (e) {}
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
        try {
            chrome.storage.local.set({ lastCustomSelector: selector });
        } catch (e) {}
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
}

export const stateManager = new StateManager();