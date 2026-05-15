/**
 * Navigation Background Service
 * Design Intent: Handles elevated privilege navigation tasks, specifically
 * simulating 'isTrusted' hardware events via the Chrome Debugger API.
 */

const activeDebugSessions = new Set();

export const navigationBackground = {
    /**
     * Orchestrates a trusted key navigation request.
     * @param {number} tabId
     * @param {number} keyCode
     * @returns {Promise<string>} Status indicator
     */
    async handleNavigationRequest(tabId, keyCode) {
        if (activeDebugSessions.has(tabId)) return 'busy';
        
        return new Promise((resolve, reject) => {
            this.executeTrustedKeyNavigation(tabId, keyCode, (err) => {
                if (err) reject(err);
                else resolve('initiated');
            });
        });
    },

    /**
     * Injects a trusted key sequence into the target tab.
     * Design Intent: Explicitly focuses the window via Runtime.evaluate 
     * to ensure "Frame 0" receives the hardware-level event, bypassing 
     * focus entrapment in content iframes.
     */
    executeTrustedKeyNavigation(tabId, keyCode, callback) {
        const target = { tabId };
        activeDebugSessions.add(tabId);

        chrome.debugger.attach(target, '1.3', () => {
            if (chrome.runtime.lastError) {
                activeDebugSessions.delete(tabId);
                return callback(new Error(chrome.runtime.lastError.message));
            }

            console.log(`[Debugger] Successfully attached to Tab ${tabId}`);

            // Step 1: Force focus to the main window (Frame 0)
            chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
                expression: 'window.focus();'
            }, () => {
                // Step 2: Send the KeyDown
                chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
                    type: 'rawKeyDown',
                    windowsVirtualKeyCode: keyCode,
                    nativeVirtualKeyCode: keyCode,
                    modifiers: 0, // Design Intent: Explicitly neutral modifiers to match VS expectations
                    isTrusted: true
                }, () => {
                    // Step 3: Small delay for VS reflow stability
                    setTimeout(() => {
                        chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
                            type: 'keyUp',
                            windowsVirtualKeyCode: keyCode,
                            nativeVirtualKeyCode: keyCode,
                            modifiers: 0
                        }, () => {
                            chrome.debugger.detach(target, () => {
                                activeDebugSessions.delete(tabId);
                                callback();
                            });
                        });
                    }, 50);
                });
            });
        });
    }
};

// Design Intent: Monitor for external detachment (e.g. user closing the bar)
// to maintain session awareness in the background console.
// Defensive check ensures module evaluation doesn't crash if the worker 
// environment is partially initialized.
if (typeof chrome !== 'undefined' && chrome.debugger) {
    chrome.debugger.onDetach.addListener((source, reason) => {
        console.warn(`[Debugger] Detached from Tab ${source.tabId}. Reason: ${reason}`);
        activeDebugSessions.delete(source.tabId);
    });
}