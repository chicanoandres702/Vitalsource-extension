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
