/**
 * Automated snap scheduling service with extension lifecycle awareness.
 */
import { isExtensionAlive } from '../../services/utils.service.js';
import { stateManager } from '../state/state.manager.js';

export class CaptureScheduler {
    constructor(snapCallback) {
        this.snapCallback = snapCallback;
        this._snapTimeout = null;
        this._countdownInterval = null;
    }

    schedule(delay = 5000) {
        if (!isExtensionAlive()) return;
        this.clear();

        // Safe broadcast utility
        const broadcast = (msg) => {
            if (!isExtensionAlive()) return;
            chrome.runtime.sendMessage(msg, () => {
                if (chrome.runtime.lastError) { /* Suppress connection noise */ }
            });
        };

        broadcast({ type: 'SNAP_PENDING_UPDATE', state: true });

        if (delay >= 2000 && stateManager.getAutoPilot()) {
            const totalDelaySeconds = Math.round(delay / 1000);
            let remaining = totalDelaySeconds;
            
            broadcast({ type: 'STATUS_UPDATE', message: `Snap in ${remaining}s...` });
            broadcast({ type: 'PROGRESS_UPDATE', progress: (remaining / totalDelaySeconds) * 100 });
            
            this._countdownInterval = setInterval(() => {
                if (!isExtensionAlive()) { this.clear(); return; }
                remaining--;
                if (remaining > 0) {
                    broadcast({ type: 'STATUS_UPDATE', message: `Snap in ${remaining}s...` });
                    broadcast({ type: 'PROGRESS_UPDATE', progress: (remaining / totalDelaySeconds) * 100 });
                } else {
                    clearInterval(this._countdownInterval);
                }
            }, 1000);
        }

        this._snapTimeout = setTimeout(() => {
            if (!isExtensionAlive()) return;
            this.clear();
            // Design Intent: Utilize the closure-scoped broadcast helper defined 
            // at the top of the schedule() method to maintain consistent 
            // error suppression across the final execution.
            if (stateManager.getAutoPilot()) broadcast({ type: 'STATUS_UPDATE', message: 'Capturing...' });
            broadcast({ type: 'PROGRESS_UPDATE', progress: 0 });
            broadcast({ type: 'SNAP_PENDING_UPDATE', state: false });
            
            this.snapCallback();
        }, delay);
    }

    clear() {
        if (this._snapTimeout) clearTimeout(this._snapTimeout);
        if (this._countdownInterval) clearInterval(this._countdownInterval);
    }
}