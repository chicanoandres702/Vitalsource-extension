/**
 * autopilot.feature.js
 * Manages the high-level snapping state machine and retry logic.
 */

const PilotAutopilot = {
    isSnapping: false,
    sessionHashes: new Set(),
    capturedCount: 0,

    snapWithRetry(attempt = 0, force = false) {
        if (this.isSnapping && !force) return;

        if (PilotStabilizer.isSpinnerActive()) {
            if (PilotStabilizer._spinnerAttempts++ < 15) {
                setTimeout(() => this.snapWithRetry(attempt, force), 400); return;
            }
        }
        PilotStabilizer._spinnerAttempts = 0;

        let target = window.customSelector ? 
            PilotScanner.findDeep(window.customSelector) : 
            PilotScanner.autoDetectContent();

        if (target && !force) {
            const stable = PilotStabilizer.verifyStability(
                target, attempt, () => {}, 
                (d) => setTimeout(() => this.snapWithRetry(attempt, force), d)
            );
            if (!stable) return;
        }

        if (target) {
            this.executeSnap(target, force);
        } else if (attempt < 5) {
            setTimeout(() => this.snapWithRetry(attempt + 1, force), 500);
        }
    },

    executeSnap(target, force) {
        this.isSnapping = true;
        PilotScanner.highlight(target); // Capture Pulse
        
        try {
            const html = PilotCleaner.cleanAndResolveHTML(target);
            const pageId = window.PilotOrchestrator.getCurrentPageId();
            const styles = this.capturedCount === 0 ? PilotCleaner.getAbsoluteStyles() : '';
            
            const meta = {
                pageId,
                fingerprint: PilotCleaner.quickHash(pageId + '|' + html),
                url: location.href,
                timestamp: Date.now()
            };

            window.PilotOrchestrator.sendData(html, styles, meta);
            this.capturedCount++;
            
            // Brief persistence then clear
            setTimeout(() => PilotScanner.clearHighlight(), 300);
        } finally {
            this.isSnapping = false;
        }
    }
};

window.PilotAutopilot = PilotAutopilot;
