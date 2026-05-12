/**
 * watchdog.service.js
 * Tracks timing between page captures to detect hangs.
 */

const PilotWatchdog = {
    _timer: null,
    _lastActivity: Date.now(),
    _timeoutMs: 12000,

    arm() {
        this.reset();
        if (this._timer) clearInterval(this._timer);
        this._timer = setInterval(() => this.checkStall(), 3000);
    },

    disarm() {
        if (this._timer) clearInterval(this._timer);
        this._timer = null;
    },

    reset() {
        this._lastActivity = Date.now();
    },

    checkStall() {
        if (Date.now() - this._lastActivity > this._timeoutMs) {
            console.warn('[PilotWatchdog] Stall detected. Attempting nudge...');
            window.dispatchEvent(new Event('pilot-stall-detected'));
            this.reset(); // Don't spam nudges
        }
    }
};

window.PilotWatchdog = PilotWatchdog;
