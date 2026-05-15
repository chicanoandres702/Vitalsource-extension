/**
 * Content capture service
 * Design Intent: Facade for capture engine and orchestrator.
 */
import { CaptureScheduler } from './capture.scheduler.js';
import { captureOrchestrator } from './capture-orchestrator.service.js';
import { isExtensionAlive } from '../../services/utils.service.js';

class CaptureService {
    constructor() {
        this.scheduler = new CaptureScheduler(() => captureOrchestrator.snapWithRetry());
    }

    scheduleSnap(delay = 5000) {
        if (!isExtensionAlive()) return;
        this.scheduler.schedule(delay);
    }

    async captureCurrentView() {
        return captureOrchestrator.snapWithRetry();
    }
}

export const captureService = new CaptureService();