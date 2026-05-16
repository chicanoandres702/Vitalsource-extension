/**
 * Observer service for DOM mutations and auto-snap functionality
 */
import logger from '../../services/logger.service.js';
import { debounce, quickHash } from '../../services/utils.service.js';
import stateManager from '../state/state.manager.js';
import messagingService from '../../services/messaging.service.js';
import contentDetector from '../capture/content.detector.js';
import captureService from '../capture/capture.service.js';
import navigationService from '../navigation/turner.service.js';
import navigationWatchdog from './navigation.watchdog.js';

class ObserverService {
    constructor() {
        this.autoSnapObserver = null;
        this.autoSnapInterval = null;
        this.pageChangeObserver = null;
        this._lastUrl = location.href;
        this._lastHash = location.hash;
    }

    init() {
        this.setupEventListeners();
        this.startNavigationWatchdog();
        logger.log('SENSOR', 'Observer Service Initialized');
    }

    armAutoSnap() {
        let autoSnapFired = false;

        if (this.autoSnapObserver) { this.autoSnapObserver.disconnect(); this.autoSnapObserver = null; }
        if (this.autoSnapInterval) { clearInterval(this.autoSnapInterval); this.autoSnapInterval = null; }

        // Clean up redundant frames: Only arm auto-snap in frames with significant content
        // to prevent background/pre-loaded frames from triggering page turns.
        if (!stateManager.getAutoPilot() && !stateManager.getIsScraping()) return;
        if (window.top !== window.self && document.body.innerText.length < 250) {
            return;
        }

        // Fallback: Force snap after 10 seconds if not fired
        const fallbackTimeout = setTimeout(() => {
            if (!autoSnapFired) {
                logger.log('SENSOR', 'Auto-snap fallback timeout reached — forcing capture.');
                autoSnapFired = true;
                if (this.autoSnapObserver) { this.autoSnapObserver.disconnect(); this.autoSnapObserver = null; }
                if (this.autoSnapInterval) { clearInterval(this.autoSnapInterval); this.autoSnapInterval = null; }
                captureService.scheduleSnap(1000);
                this.armPageChangeObserver();
            }
        }, 10000);

        if (!stateManager.getAutoPilot() && !stateManager.getIsScraping()) {
            logger.log('SENSOR', 'Engine not active — auto-snap fully suppressed. No observers armed.');
            return;
        }

        const checkAndSchedule = () => {
            if (autoSnapFired) return true;
            


            const found = stateManager.getCustomSelector() ? contentDetector.findDeep(stateManager.getCustomSelector()) : contentDetector.autoDetectContent();
            if (contentDetector.isContentValid(found)) {
                logger.log('SENSOR', 'Valid content detected & transition finished — scheduling snap.');
                autoSnapFired = true;
                clearTimeout(fallbackTimeout);
                if (this.autoSnapObserver) { this.autoSnapObserver.disconnect(); this.autoSnapObserver = null; }
                if (this.autoSnapInterval) { clearInterval(this.autoSnapInterval); this.autoSnapInterval = null; }
                captureService.scheduleSnap(5000);
                this.armPageChangeObserver();
                return true;
            }
            return false;
        };

        if (checkAndSchedule()) return;

        try {
            this.autoSnapObserver = new MutationObserver(debounce(() => {
                checkAndSchedule();
            }, 150));
            const root = document.body || document.documentElement;
            this.autoSnapObserver.observe(root, { childList: true, subtree: true });
        } catch (e) {
            logger.log('ERROR', 'MutationObserver failed to arm:', e);
        }

        this.autoSnapInterval = setInterval(() => {
            checkAndSchedule();
        }, 1000);

        logger.log('SENSOR', 'Auto-snap armed (waiting for content + transition idle).');
    }

    armPageChangeObserver() {
        // Completely disabled - user must explicitly start autonomous mode
        // to enable automatic change detection and snapping.
        return;
    }

    onSpaNavigation() {
        logger.log('NAV', 'SPA navigation detected — re-arming sensors.');
        stateManager.setHasSnappedCurrentPage(false);
        contentDetector.invalidateSliderCache();
        this.armAutoSnap();
    }

    startNavigationWatchdog() {
        navigationWatchdog.init(() => this.onSpaNavigation());
        
        // Watch for URL/hash changes
        setInterval(() => {
            if (location.href !== this._lastUrl || location.hash !== this._lastHash) {
                this._lastUrl = location.href;
                this._lastHash = location.hash;
                this.onSpaNavigation();
            }
        }, 1000);
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

export default new ObserverService();