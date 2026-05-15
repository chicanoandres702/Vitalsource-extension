/**
 * Capture Orchestrator Service
 * Design Intent: Gatekeeper logic that determines if the page is ready for a snap.
 */
import { isExtensionAlive, quickHash } from '../../services/utils.service.js'; // quickHash is a named export, keep as is
import stateManager from '../state/state.manager.js';
import messagingService from '../../services/messaging.service.js';
import contentDetector from './content.detector.js';
import htmlCleaner from './html.cleaner.js';
import navigationService from '../navigation/turner.service.js';
import captureMetadata from './capture.metadata.js';
import captureReadiness from './capture.readiness.js';
import captureEngine from './capture-engine.service.js';

const IS_TOP = window.top === window.self;

export const captureOrchestrator = {
    isSnapping: false,
    spinnerWaitAttempts: 0,
    maxRetries: 20,

    snapWithRetry(attempt = 0, force = false) {
        if (!isExtensionAlive()) return;
        if (!IS_TOP && document.visibilityState !== 'visible' && !force) return;

        // Boundary Check: Stop if we've reached the user-defined limit
        if (stateManager.getAutoPilot() && captureMetadata.getCurrentPageValue() === stateManager.getAutoPilotStopPage()) {
            stateManager.configureEngine({ state: false });
            messagingService.sendChapterComplete(captureMetadata.getCurrentPageValue());
            return;
        }

        // Concurrency Lock
        if (this.isSnapping || (stateManager.getIsTransitioning() && !force)) {
            setTimeout(() => this.snapWithRetry(attempt, force), 300);
            return;
        }

        // Readiness Check: Spinners and Loaders
        if (!force && captureReadiness.isBusy() && this.spinnerWaitAttempts < 30) {
            this.spinnerWaitAttempts++;
            setTimeout(() => this.snapWithRetry(attempt, force), 400);
            return;
        }
        this.spinnerWaitAttempts = 0;

        const target = contentDetector.autoDetectContent(force);
        
        // Asset Check: MathJax and Images
        if (target && !force && (captureReadiness.hasPendingAssets(target) || contentDetector.isMathJaxRendering(target))) {
            setTimeout(() => this.snapWithRetry(attempt, force), 400);
            return;
        }

        // Stability Check: Fingerprint comparison
        if (target && !force) {
            const currentFP = quickHash(contentDetector.getFingerprintSource(target));
            const status = captureReadiness.isStable(currentFP, stateManager.getStabilizeFP(), stateManager.getStabilizeReady());
            stateManager.setStabilizeFP(currentFP);
            stateManager.setStabilizeReady(status.ready);
            if (!status.snap) {
                setTimeout(() => this.snapWithRetry(attempt, force), status.ready ? 500 : 1000);
                return;
            }
        }

        const finalHtml = target ? htmlCleaner.cleanAndResolveHTML(target) : '';
        if (!target || (target && !contentDetector.isContentValid(target) && !force)) {
            if (attempt < this.maxRetries) {
                setTimeout(() => this.snapWithRetry(attempt + 1, force), 400 * (attempt + 1));
            } else if (stateManager.getAutoPilot()) {
                setTimeout(() => navigationService.nextPage(), 1000);
            }
            return;
        }

        const result = captureEngine.executeCapture(target, finalHtml, force);
        if (result === 'retry') {
            setTimeout(() => this.snapWithRetry(0, force), 2500);
        } else if (stateManager.getAutoPilot()) {
            // Right after successful snap, auto-advance when in autonomous mode
            setTimeout(() => navigationService.nextPage(), 800);
        }
    }
};
export default captureOrchestrator;