/**
 * c:\Users\Andrew\Downloads\Vitalsource-extension\src\entries\background.entry.js
 * Background Entry Point
 * Design Intent: Acts as the central message router and lifecycle manager.
 * Standardized suffix (.entry) for bundler recognition.
 */
import { navigationBackground } from '../features/navigation/navigation.background.js';
import { downloadBackground } from '../features/capture/download.background.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { type } = message;

    if (type === 'REQUEST_NAVIGATION') {
        // Always target the top-level active tab (not child frames/iframes)
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tabId = tabs[0]?.id;
            if (!tabId) {
                sendResponse({ status: 'error', error: 'No active tab' });
                return;
            }
            
            // Design Intent: Ensure focus before hardware event injection.
            chrome.tabs.update(tabId, { active: true }).catch(() => {});
            
            navigationBackground.handleNavigationRequest(tabId, message.keyCode)
                .then(status => sendResponse({ status }))
                .catch(err => sendResponse({ status: 'error', error: err.message }));
        });
        return true; 
    }

    if (type === 'ACTIVATE_PICKER') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const targetId = tabs[0]?.id;
            if (targetId) {
                // Design Intent: Pierce all frames to trigger picking logic
                // across cross-origin book containers.
                chrome.scripting.executeScript({
                    target: { tabId: targetId, allFrames: true },
                    func: () => { window.dispatchEvent(new CustomEvent('vst-start-picker')); }
                }).catch(() => {
                    chrome.tabs.sendMessage(targetId, { type: 'START_PICKER' }).catch(() => {});
                });
            }
        });
        return false;
    }

    if (type === 'PICKER_COMPLETE') {
        // Design Intent: Relay the pick result to the Sidebar UI.
        chrome.runtime.sendMessage(message, () => {
            if (chrome.runtime.lastError) { /* Sidebar closed */ }
        });
        return false;
    }

    if (type === 'ALIVE') {
        // Design Intent: Surface heartbeat diagnostics to the background console. 
        const origin = new URL(sender.url).hostname || 'top';
        console.debug(`[Pulse] ${origin} | Book: ${!!message.isBookFrame} | Pg: ${message.pageValue || 'N/A'}`);

        if (!message.pageValue) return false;

        // Design Intent: Synchronize state across all frames.
        chrome.tabs.sendMessage(sender.tab.id, { 
            type: 'STATE_SYNC', 
            payload: { currentPage: message.pageValue } 
        }, () => {
            if (chrome.runtime.lastError) { /* Frame navigated */ }
        });
        return false;
    }

    if (type === 'LOG_EVENT') {
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

// Design Intent: Log initialization to verify the entry point is active.
console.log('[PilotPro] Background Engine Initialized.');

// Open sidebar when the extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
    if (tab?.id) {
        chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
    }
});