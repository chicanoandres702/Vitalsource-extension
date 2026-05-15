/**
 * Background Service Worker
 * Design Intent: Acts as the central message router for the extension.
 * Orchestrates feature-specific background logic to maintain modularity.
 */
import { navigationBackground } from './features/navigation/navigation.background.js';
import { downloadBackground } from './features/capture/download.background.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { type } = message;

    if (type === 'REQUEST_NAVIGATION') {
        const tabId = sender.tab?.id;
        if (!tabId) return;
        
        // Design Intent: Ensure the tab is active. Hardware-level events 
        // injected via the debugger (isTrusted: true) often require the 
        // window/tab to have active focus to be processed by the 
        // top-level application event loop.
        chrome.tabs.update(tabId, { active: true }).catch(() => {});
        
        navigationBackground.handleNavigationRequest(tabId, message.keyCode)
            .then(status => sendResponse({ status }))
            .catch(err => sendResponse({ status: 'error', error: err.message })); // Design Intent: Respond with error status on failure.
        return true; // Maintain channel for async response
    }

    if (type === 'ACTIVATE_PICKER') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const targetId = tabs[0]?.id;
            if (targetId) {
                // Design Intent: tabs.sendMessage only targets Frame 0. 
                // We use executeScript to trigger the picker in ALL frames 
                // so the user can click elements inside nested iframes. 
                // We trigger both a window event and a direct message for redundancy.
                chrome.scripting.executeScript({
                    target: { tabId: targetId, allFrames: true },
                    func: () => { 
                        window.dispatchEvent(new CustomEvent('vst-start-picker'));
                        console.log('[PilotPro] Picker signal received in frame.');
                    }
                }).catch(() => {
                    // Design Intent: Fallback to top-frame only if scripting is restricted, suppressing console errors for non-existent frames.
                    chrome.tabs.sendMessage(targetId, { type: 'START_PICKER' }).catch(() => {});
                });
            }
        });
        return false;
    }

    if (type === 'PICKER_COMPLETE') {
        // Design Intent: Broadcast the new selector to the Sidebar AND all active frames.
        // This ensures that whichever frame captures the next page uses the user-defined target.
        // Use a safeSend-like pattern to suppress console noise from closed ports. 
        // The response is sent immediately, so we indicate a synchronous response.
        const sendSafe = (msg, tabId = null) => {
            if (tabId) {
                chrome.tabs.sendMessage(tabId, msg, () => {
                    // Design Intent: Suppress "Receiving end does not exist" for frames that might have closed.
                    if (chrome.runtime.lastError) { /* Frame might be closed */ } 
                });
            } else {
                chrome.runtime.sendMessage(msg, () => {
                    // Design Intent: Suppress "Receiving end does not exist" for sidebar that might have closed.
                    if (chrome.runtime.lastError) { /* Sidebar might be closed */ } 
                });
            }
        };

        sendSafe(message); // Send to sidebar
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                sendSafe({ type: 'SYNC_SELECTOR', payload: message.payload }, tabs[0].id); // Design Intent: Send to content scripts.
            }
        });
        sendResponse({ status: 'synced' });
        return true; // Design Intent: Signal an async response, as sendResponse is called.
    }

    if (type === 'RESET_SELECTOR') {
        // Design Intent: Logic to clear the custom selector across the system.
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'SYNC_SELECTOR', payload: { selector: null } }, () => {
                    if (chrome.runtime.lastError) { /* Frame might be closed */ }
                });
            }
        });
        sendResponse({ status: 'reset' });
        return false;
    }

    if (type === 'ALIVE') {
        // Design Intent: Surface heartbeat diagnostics to the background console. 
        // This allows developers to verify which frames have successfully 
        // located the book container (isBookFrame).
        const origin = new URL(sender.url).hostname || 'top';
        console.debug(`[Pulse] ${origin} | Book: ${!!message.isBookFrame} | Pg: ${message.pageValue || 'N/A'}`);

        if (!message.pageValue) {
            sendResponse({ ack: true });
            return false;
        }

        chrome.tabs.sendMessage(sender.tab.id, { 
            type: 'STATE_SYNC', 
            payload: { currentPage: message.pageValue } 
        }, () => {
            if (chrome.runtime.lastError) { /* Frame might have been closed */ }
        });
        sendResponse({ ack: true });
        return true; // Design Intent: Signal an async response, as sendResponse is called.
    }

    if (type === 'LOG_EVENT') {
        // Design Intent: Centralize logging for debugging production bundles
        console.log(`[Bkg-Log] ${message.category}: ${message.message}`, message.data || '');
        sendResponse({ logged: true });
        return false;
    }

    if (type === 'DOWNLOAD_RESOURCE') {
        const { url, token, filename } = message.payload;
        downloadBackground.downloadWithProgress(url, token, filename);
        sendResponse({ status: 'downloading' });
        return false;
    }
    return false; 
});