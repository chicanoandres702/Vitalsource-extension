/**
 * stabilizer.feature.js
 * Detects spinners, placeholder states, and DOM mutations.
 */

const PilotStabilizer = {
    _lastFP: '',
    _isReady: false,
    _spinnerAttempts: 0,

    isContentValid(node) {
        if (!node) return false;
        const text = node.textContent || '';
        // Common VitalSource loading patterns
        const invalid = ['loading...', 'syncing', 'please wait', 'fetching'];
        const lower = text.toLowerCase();
        return !invalid.some(word => lower.includes(word)) && text.trim().length > 0;
    },

    isSpinnerActive() {
        const spinner = window.PilotScanner.findDeep('.loading-spinner, .vst-spinner, [class*="spinner"], .progress-circle');
        if (spinner) {
            const rect = spinner.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        }
        return false;
    },

    verifyStability(target, attempt, onStable, onWait) {
        const currentFP = window.PilotCleaner.quickHash(target.outerHTML);
        
        if (currentFP !== this._lastFP) {
            this._lastFP = currentFP;
            this._isReady = false;
            onWait(250, 'DOM mutation detected');
            return false;
        }

        if (!this._isReady) {
            this._isReady = true;
            onWait(150, 'DOM signature matched, verifying final stability');
            return false;
        }

        return true;
    }
};

window.PilotStabilizer = PilotStabilizer;
