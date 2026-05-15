/**
 * Content capture service
 * Design Intent: Facade for capture engine and orchestrator.
 */
import { CaptureScheduler } from './capture.scheduler.js';
import captureOrchestrator from './capture-orchestrator.service.js';
import { isExtensionAlive } from '../../services/utils.service.js';

class CaptureService {
    constructor() {
        this.scheduler = new CaptureScheduler(() => captureOrchestrator.snapWithRetry());
    }

    /**
     * Design Intent: Standardized entry point for the sidebar orchestrator.
     * Prevents "init is not a function" TypeErrors.
     */
    init() {
        logger.log('DATA', 'Capture Service Active');
    }

    scheduleSnap(delay = 5000) {
        if (!isExtensionAlive()) return;
        this.scheduler.schedule(delay);
    }

    async captureCurrentView() {
        return captureOrchestrator.snapWithRetry();
    }

    async snapWithRetry(attempt = 0, force = false) {
        return captureOrchestrator.snapWithRetry(attempt, force);
    }
}

export default new CaptureService();