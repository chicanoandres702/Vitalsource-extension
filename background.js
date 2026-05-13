/**
 * filepath: background.js
 * PilotPro Master Orchestrator
 * Fixes: Asynchronous message channel closure errors.
 */

// Configure side panel behavior
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
  } catch (e) {}
});

/**
 * Global Message Listener
 * MANDATORY: Every path MUST call sendResponse()
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'CREATE_NATIVE_PDF') {
    const targetTabId = request.targetTabId || (sender.tab ? sender.tab.id : null);
    
    if (!targetTabId) {
      sendResponse({ success: false, error: 'Target Tab ID is missing' });
      return false;
    }

    // Process logic asynchronously
    (async () => {
      try {
        if (!chrome.debugger) {
          throw new Error('Debugger API permission missing from manifest.');
        }

        // Attach debugger
        await chrome.debugger.attach({ tabId: targetTabId }, '1.3');
        
        const printParams = {
          printBackground: true,
          preferCSSPageSize: true,
          generateDocumentOutline: true,
          paperWidth: 8.5,
          paperHeight: 11,
          marginTop: 0,
          marginBottom: 0,
          marginLeft: 0,
          marginRight: 0
        };

        // Send Command and wait for result with timeout
        const result = await Promise.race([
          new Promise((resolve, reject) => {
            chrome.debugger.sendCommand({ tabId: targetTabId }, 'Page.printToPDF', printParams, (result) => {
              const lastErr = chrome.runtime.lastError;
              if (lastErr) {
                reject(lastErr);
              } else {
                resolve(result);
              }
            });
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('PDF generation timeout')), 30000)
          )
        ]);

        // Always detach after command attempt
        await chrome.debugger.detach({ tabId: targetTabId }).catch(() => {});

        if (result && result.data) {
          sendResponse({ success: true, pdfData: result.data });
        } else {
          sendResponse({ success: false, error: 'PDF engine returned null data' });
        }
      } catch (err) {
        console.error('[PilotPro] Background Error:', err);
        // Always detach on error
        chrome.debugger.detach({ tabId: targetTabId }).catch(() => {});
        sendResponse({ success: false, error: err.message });
      }
    })();

    return true; // Keep message channel open for async response
  }

  // Fallback for unhandled messages to prevent channel hang
  // Do not return true here
  return false;
});