// Configure the side panel to open when the extension icon is clicked
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Optionally, you can restrict the side panel to only be enabled on supported sites
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url) return;
  
  try {
    const url = new URL(tab.url);
    const supportedHosts = [
      'bookshelf.vitalsource.com',
      'capella.vitalsource.com',
      'mosaic.vitalsource.com',
      'jigsaw.vitalsource.com'
    ];
    
    if (supportedHosts.includes(url.hostname) || url.hostname.endsWith('.capella.edu')) {
      // Enable the side panel for this specific tab
      await chrome.sidePanel.setOptions({
        tabId,
        path: 'sidebar.html',
        enabled: true
      });
    } else {
      // Disable the side panel on unsupported sites to avoid confusion
      await chrome.sidePanel.setOptions({
        tabId,
        enabled: false
      });
    }
  } catch (e) {
    // Ignore invalid URLs (like chrome:// or about:blank)
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'CREATE_NATIVE_PDF') {
    const targetTabId = sender.tab ? sender.tab.id : null;
    if (!targetTabId) {
      sendResponse({ success: false, error: 'No source tab available for PDF creation' });
      return false;
    }
    
    chrome.debugger.attach({ tabId: targetTabId }, '1.3', () => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      
      chrome.debugger.sendCommand({ tabId: targetTabId }, 'Page.printToPDF', {
        landscape: false,
        displayHeaderFooter: false,
        printBackground: true,
        marginTop: 0.5,
        marginBottom: 0.5,
        marginLeft: 0.5,
        marginRight: 0.5,
        paperWidth: 8.5,
        paperHeight: 11,
        preferCSSPageSize: true,
        generateDocumentOutline: true
      }, (result) => {
        chrome.debugger.detach({ tabId: targetTabId });
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else if (result.data) {
          sendResponse({ success: true, pdfData: result.data });
        } else {
          sendResponse({ success: false, error: 'Empty result from printToPDF' });
        }
      });
    });
    return true; // Keep message channel open for async sendResponse
  }
  return false; // Not handled here
});
