/**
 * Coordinator Service
 * Central State Machine for cross-frame capture and navigation sequence.
 * Enforces strict order of operations and removes race conditions.
 */

// States: IDLE, TURNING, WAITING_FOR_SPINNER, WAITING_FOR_CONTENT, CAPTURING
let state = 'IDLE';
let flipDelay = 1200;
let sendCommandFn = null;

export const coordinatorService = {
    init(sendCommandFunc, delayMs) {
        sendCommandFn = sendCommandFunc;
        flipDelay = delayMs;
        state = 'IDLE';
    },

    setDelay(delayMs) {
        flipDelay = delayMs;
    },

    getState() { return state; },

    // Top-down trigger to turn page
    triggerTurn() {
        if (state !== 'IDLE') return;
        state = 'TURNING';
        
        // Command top frame to execute keyboard events
        sendCommandFn({ action: 'TRIGGER_TURN' });

        // Enter wait sequence
        state = 'WAITING_FOR_SPINNER';
        
        // Wait briefly for UI to transition to spinner, then check
        setTimeout(() => {
            this.checkSpinner();
        }, 100);
    },

    // Target frame responds with spinner status
    handleSpinnerStatus(hasSpinner) {
        if (state === 'WAITING_FOR_SPINNER') {
            if (hasSpinner) {
                // Spinner still visible, ping again shortly
                setTimeout(() => this.checkSpinner(), 100);
            } else {
                // Spinner cleared, wait for content mutation
                state = 'WAITING_FOR_CONTENT';
                sendCommandFn({ action: 'ARM_CAPTURE' });
            }
        }
    },

    checkSpinner() {
        if (state === 'WAITING_FOR_SPINNER') {
            sendCommandFn({ action: 'CHECK_SPINNER' });
        }
    },

    // Notified by target frame that content mutated
    handleContentReady() {
        if (state === 'WAITING_FOR_CONTENT') {
            state = 'CAPTURING';
            // Provide arbitrary small stabilization delay
            setTimeout(() => {
                sendCommandFn({ action: 'EXECUTE_SNAP' });
            }, 300);
        }
    },

    // Target frame sends actual data
    handleCaptureData(dataPayload) {
        if (state === 'CAPTURING' || state === 'IDLE' /* manual snap bypasses loop */) {
            state = 'IDLE';
            // Return true to indicate we processed it successfull
            return true;
        }
        return false;
    },

    abort() {
        state = 'IDLE';
    }
};
