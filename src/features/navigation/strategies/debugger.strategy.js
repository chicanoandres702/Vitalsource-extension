/**
 * Debugger Strategy (Background)
 * Falls back to chrome.debugger for isTrusted key events.
 */
import { navigationBackground } from '../navigation.background.js';

export async function tryDebuggerNavigation(direction) {
    const key = direction === 'next' ? 'ArrowRight' : 'ArrowLeft';
    const code = direction === 'next' ? 39 : 37;

    try {
        await navigationBackground.handleNavigationRequest(
            // We pass a placeholder tabId; the background will resolve the active tab
            0, 
            code
        );
        return true;
    } catch (e) {
        return false;
    }
}
