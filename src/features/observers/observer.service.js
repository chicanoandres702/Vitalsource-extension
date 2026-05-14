/**
 * Observer service for DOM mutations and auto-snap functionality
 */
import { logger } from '../../services/logger.service.js';
import { debounce, quickHash } from '../../services/utils.service.js';
import { stateManager } from '../state/state.manager.js';
import { messagingService } from '../../services/messaging.service.js';
import { contentDetector } from '../capture/content.detector.js';
import { captureService } from '../capture/capture.service.js';
import { navigationService } from '../navigation/turner.service.js';

class ObserverService {
    constructor() {
        this.autoSnapObserver = null;
        this.autoSnapInterval = null;
        this.pageChangeObserver = null;
        this._lastUrl = location.href;
        this._lastHash = location.hash;
    }

    armAutoSnap() {
        let autoSnapFired = false;

        if (this.autoSnapObserver) { this.autoSnapObserver.disconnect(); this.autoSnapObserver = null; }
        if (this.autoSnapInterval) { clearInterval(this.autoSnapInterval); this.autoSnapInterval = null; }

        if (!stateManager.getIsScraping()) {
            logger.log('SENSOR', 'Engine not active — auto-snap suppressed. Arming page-change observer only.');
            this.armPageChangeObserver();
            return;
        }

        const existing = stateManager.getCustomSelector() ? contentDetector.findDeep(stateManager.getCustomSelector()) : contentDetector.autoDetectContent();
        if (contentDetector.isContentValid(existing)) {
            autoSnapFired = true;
            logger.log('SENSOR', 'Content already present — firing snap immediately.');
            captureService.scheduleSnap(300);
            this.armPageChangeObserver();
            return;
        }

        try {
            this.autoSnapObserver = new MutationObserver(debounce(() => {
                if (autoSnapFired) { this.autoSnapObserver && this.autoSnapObserver.disconnect(); return; }
                const found = stateManager.getCustomSelector() ? contentDetector.findDeep(stateManager.getCustomSelector()) : contentDetector.autoDetectContent();
                if (contentDetector.isContentValid(found)) {
                    autoSnapFired = true;
                    this.autoSnapObserver && this.autoSnapObserver.disconnect();
                    if (this.autoSnapInterval) { clearInterval(this.autoSnapInterval); this.autoSnapInterval = null; }
                    logger.log('SENSOR', 'Observer: content appeared — firing snap.');
                    captureService.scheduleSnap(300);
                    this.armPageChangeObserver();
                }
            }, 150));
            const root = document.body || document.documentElement;
            this.autoSnapObserver.observe(root, { childList: true, subtree: true });
        } catch (e) {
            logger.log('ERROR', 'MutationObserver failed to arm:', e);
        }

        this.autoSnapInterval = setInterval(() => {
            if (autoSnapFired) { clearInterval(this.autoSnapInterval); this.autoSnapInterval = null; return; }
            const found = stateManager.getCustomSelector() ? contentDetector.findDeep(stateManager.getCustomSelector()) : contentDetector.autoDetectContent();
            if (contentDetector.isContentValid(found)) {
                autoSnapFired = true;
                clearInterval(this.autoSnapInterval); this.autoSnapInterval = null;
                this.autoSnapObserver && this.autoSnapObserver.disconnect();
                logger.log('SENSOR', 'Interval fallback: content found in shadow DOM — firing snap.');
                captureService.scheduleSnap(300);
                this.armPageChangeObserver();
            }
        }, 1000);

        logger.log('SENSOR', 'Auto-snap armed (observer + interval fallback).');
    }

    armPageChangeObserver() {
        if (this.pageChangeObserver) this.pageChangeObserver.disconnect();

        const checkForChange = debounce(() => {
            if (document.hidden || stateManager.getIsTransitioning()) return;

            const content = stateManager.getCustomSelector() ? contentDetector.findDeep(stateManager.getCustomSelector()) : contentDetector.autoDetectContent();
            if (!content) return;

            const currentFP = quickHash(contentDetector.getFingerprintSource(content));

            // More sensitive change detection - also check text content specifically
            const currentText = contentDetector.getPureContentText(content);
            const currentTextHash = quickHash(currentText);

            const fpChanged = currentFP !== stateManager.getLastContentFP();
            const textChanged = currentTextHash !== stateManager.getLastTextHash();

            if (fpChanged || textChanged) {
                logger.log('SENSOR', `Change detected (FP: ${fpChanged}, Text: ${textChanged}). Queuing snap.`);
                captureService.scheduleSnap(300); // Reduced delay for faster response
            }
        }, 800); // Reduced debounce time

        this.pageChangeObserver = new MutationObserver(checkForChange);
        this.pageChangeObserver.observe(document.body || document.documentElement, {
            childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['src', 'style']
        });
        logger.log('SENSOR', 'Page-change observer armed with enhanced detection.');
    }

    onSpaNavigation() {
        logger.log('NAV', 'SPA navigation detected — re-arming sensors.');
        stateManager.setHasSnappedCurrentPage(false);
        contentDetector.invalidateSliderCache();
        this.armAutoSnap();
    }

    startNavigationWatchdog() {
        // Listen for arrow key navigation (often used in top window readers)
        window.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                logger.log('NAV', 'Arrow key navigation detected.');
                setTimeout(() => this.onSpaNavigation(), 300);
            }
        });

        // Watch for URL/hash changes
        setInterval(() => {
            if (location.href !== this._lastUrl || location.hash !== this._lastHash) {
                this._lastUrl = location.href;
                this._lastHash = location.hash;
                this.onSpaNavigation();
            }
        }, 1000);

        // Watchdog for stalls
        setInterval(() => {
            if (!stateManager.getAutoPilot() || !stateManager.getIsScraping() || document.hidden) return;
            if (Date.now() - stateManager.getLastFlipTime() > 8000) {
                logger.log('NAV', 'WATCHDOG: Stall detected (8s). Nudge recovery.');
                captureService.snapWithRetry(0, false);
                setTimeout(() => navigationService.triggerNext(), 3000);
                stateManager.setLastFlipTime(Date.now());
            }
        }, 3000);
    }

    setupEventListeners() {
        window.addEventListener('pilotpro_spa_nav', this.onSpaNavigation.bind(this));
        window.addEventListener('popstate', this.onSpaNavigation.bind(this));
        window.addEventListener('hashchange', this.onSpaNavigation.bind(this));

        document.addEventListener('visibilitychange', () => {
            const hidden = document.hidden;
            logger.log('SENSOR', hidden ? 'Tab hidden — engine paused.' : 'Tab visible — engine resumed.');
            messagingService.sendTabVisibility(hidden);
        });
    }
}

export const observerService = new ObserverService();