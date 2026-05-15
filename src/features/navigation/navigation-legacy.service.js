/**
 * navigation-legacy.service.js
 * Intent: Resolve "S.navigateToPage is not a function" via centralized tab messaging.
 */

export const NavigationService = {
  /**
   * Communicates with content script to trigger a page jump.
   * @param {number|string} pageNumber 
   */
  async navigateToPage(pageNumber) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.id) {
      throw new Error("No active VitalSource tab detected.");
    }

    return chrome.tabs.sendMessage(tab.id, {
      type: "NAVIGATE_TO_PAGE",
      payload: { pageNumber }
    });
  }
};

// Alias to 'S' if needed for legacy compatibility in bundled files
export const S = NavigationService;