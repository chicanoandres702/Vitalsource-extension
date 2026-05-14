/**
 * filepath: background.js
 * PilotPro Master Orchestrator
 * Handles: SidePanel lifecycle, Native PDF Printing, and Global Messaging
 */

// 1. Configure SidePanel to open on extension icon click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[PilotPro] SidePanel Init Error:', error));

// 2. Streamlined SidePanel restriction to VitalSource/Capella domains
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

    await chrome.sidePanel.setOptions({
      tabId,
      path: 'sidebar.html',
      enabled: isSupported
    });
  } catch (e) {
    // Silent fail for non-standard URLs
  }
});

// 3. Native PDF Creation & Message Handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request.action === 'CREATE_NATIVE_PDF') {
    const targetTabId = sender.tab ? sender.tab.id : null;
    
    if (!targetTabId) {
      sendResponse({ success: false, error: 'No source tab found for PDF generation' });
      return false;
    }

    // Use Chrome DevTools Protocol to print the page as a high-quality PDF
    chrome.debugger.attach({ tabId: targetTabId }, '1.3', () => {
      if (chrome.runtime.lastError) {
        // Log the error for debugging purposes
        console.error('[PilotPro] Debugger Attach Error:', chrome.runtime.lastError.message);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }

      // Streamlined print options for a clean PDF output, removing all margins.
      const printOptions = {
        landscape: false,
        displayHeaderFooter: false,
        printBackground: true,
        // Set margins to 0 for a full-bleed content capture,
        // eliminating unnecessary whitespace around the content.
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
        paperWidth: 8.5,
        paperHeight: 11,
        preferCSSPageSize: true,
        generateDocumentOutline: true
      };

      chrome.debugger.sendCommand({ tabId: targetTabId }, 'Page.printToPDF', printOptions, (result) => {
        // Always detach immediately after command
        chrome.debugger.detach({ tabId: targetTabId });
        
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else if (result && result.data) {
          sendResponse({ success: true, pdfData: result.data });
        } else {
          // This case should ideally not happen if no runtime.lastError but also no result.data
          console.error('[PilotPro] printToPDF: Unexpected missing PDF data.');
          sendResponse({ success: false, error: 'Failed to generate PDF data' });
        }
      });
    });
    return true; // Keep channel open for async response
  }

  // Handle generic stats relay from content to sidebar
  if (request.type === 'PILOT_PAGE_CAPTURED') {
    // This allows the sidebar to refresh without the background script needing to manage storage
    console.log('[PilotPro] Broadcast: Capture Event');
  }
  // For messages not handled by the if-conditions above, assume synchronous response (or no response needed).
  return false; 
});

console.log('[PilotPro] Engine v10.0 Online');