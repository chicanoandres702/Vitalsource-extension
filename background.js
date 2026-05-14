/**
 * PilotPro Master Orchestrator (Service Worker)
 * Fixed: Removed any potential 'window' references to prevent registration failure (Status 15).
 */

// Configure side panel behavior - uses 'self' implicitly or chrome API
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[PilotPro] SidePanel config error:', error));

// Domain restriction for SidePanel
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url || info.status !== 'loading') return;
  try {
    const url = new URL(tab.url);
    const isSupported = [
      'bookshelf.vitalsource.com',
      'capella.vitalsource.com',
      'mosaic.vitalsource.com',
      'jigsaw.vitalsource.com'
    ].includes(url.hostname) || url.hostname.endsWith('.capella.edu');

    await chrome.sidePanel.setOptions({ tabId, path: 'sidebar.html', enabled: isSupported });
  } catch (e) {
    // Ignore URL parsing errors for non-standard schemes
  }
});

/**
 * Global Message Listener
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'CREATE_NATIVE_PDF') {
    handlePdfGeneration(request, sender, sendResponse);
    return true; // Keep channel open for async response
  }

  if (request.action === 'SAVE_PAGE') {
    // Simple ack for now
    sendResponse({ success: true });
    return false;
  }

  if (request.action === 'GET_STORAGE_DATA') {
    sendResponse({ data: [] });
    return false;
  }

  return false;
});

/**
 * PDF Generation Logic
 * Uses Debugger API to print the target tab to PDF
 */
async function handlePdfGeneration(request, sender, sendResponse) {
  const targetTabId = request.targetTabId || (sender.tab ? sender.tab.id : null);
    
  if (!targetTabId) {
    sendResponse({ success: false, error: 'Target Tab ID is missing' });
    return;
  }

  try {
    // Attach debugger
    await chrome.debugger.attach({ tabId: targetTabId }, '1.3');
    
    const printParams = {
      printBackground: true,
      preferCSSPageSize: true,
      paperWidth: 8.5,
      paperHeight: 11,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0
    };

    chrome.debugger.sendCommand({ tabId: targetTabId }, 'Page.printToPDF', printParams, (result) => {
      // Detach immediately after getting result
      chrome.debugger.detach({ tabId: targetTabId }).catch(() => {});
      
      const lastErr = chrome.runtime.lastError;
      if (lastErr) {
        sendResponse({ success: false, error: lastErr.message });
      } else if (result && result.data) {
        sendResponse({ success: true, pdfData: result.data });
      } else {
        sendResponse({ success: false, error: 'PDF engine returned null' });
      }
    });
  } catch (err) {
    console.error('[PilotPro] Background Error:', err);
    chrome.debugger.detach({ tabId: targetTabId }).catch(() => {});
    sendResponse({ success: false, error: err.message });
  }
}