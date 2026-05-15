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
            .catch(err => sendResponse({ status: 'error', error: err.message }));
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
                    // Design Intent: Suppress port closure errors by providing 
                    // an empty callback for the fallback message.
                    chrome.tabs.sendMessage(targetId, { type: 'START_PICKER' }, () => {
                        if (chrome.runtime.lastError) { /* Expected if frame is dead */ }
                    });
                });
            }
        });
        sendResponse({ status: 'picker_activated' });
        return false;
    }

    if (type === 'PICKER_COMPLETE') {
        // Design Intent: Broadcast the new selector to the Sidebar AND all active frames.
        // This ensures that whichever frame captures the next page uses the user-defined target.
        // Use a safeSend-like pattern to suppress console noise from closed ports.
        const sendSafe = (msg, tabId = null) => {
            if (tabId) {
                chrome.tabs.sendMessage(tabId, msg, () => {
                    if (chrome.runtime.lastError) { /* Frame might be closed */ }
                });
            } else {
                chrome.runtime.sendMessage(msg, () => {
                    if (chrome.runtime.lastError) { /* Sidebar might be closed */ }
                });
            }
        };

        sendSafe(message); // Send to sidebar
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                sendSafe({ type: 'SYNC_SELECTOR', payload: message.payload }, tabs[0].id); // Send to content scripts
            }
        });
        sendResponse({ status: 'broadcast_complete' });
        return false;
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
        sendResponse({ status: 'reset_complete' });
        return false;
    }

    if (type === 'ALIVE') {
        // Design Intent: Surface heartbeat diagnostics to the background console. 
        // This allows developers to verify which frames have successfully 
        // located the book container (isBookFrame).
        const origin = new URL(sender.url).hostname || 'top';
        console.debug(`[Pulse] ${origin} | Book: ${!!message.isBookFrame} | Pg: ${message.pageValue || 'N/A'}`);

        if (!message.pageValue) return false;

        // Design Intent: Broadcast the page number from the Top frame to 
        // all content iframes to bypass CORS state blindness.
        chrome.tabs.sendMessage(sender.tab.id, { 
            type: 'STATE_SYNC', 
            payload: { currentPage: message.pageValue } 
        }, () => {
            if (chrome.runtime.lastError) { /* Frame might have been closed */ }
        });
        return false;
    }

    if (type === 'LOG_EVENT') {
        // Design Intent: Centralize logging for debugging production bundles
        console.log(`[Bkg-Log] ${message.category}: ${message.message}`, message.data || '');
        return false;
    }

    if (type === 'DOWNLOAD_RESOURCE') {
        const { url, token, filename } = message.payload;
        downloadBackground.downloadWithProgress(url, token, filename);
        return false;
    }
    return false; 
});