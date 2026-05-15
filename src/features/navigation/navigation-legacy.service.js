
/**
 * navigation-legacy.service.js
 * Intent: Resolve "S.navigateToPage is not a function" via centralized tab messaging.
 */

const NavigationService = {
  /**
   * Standardized entry point for the sidebar orchestrator.
   * Prevents "init is not a function" TypeErrors during boot.
   */
  init() {
    // No internal state to initialize for legacy navigation
  },

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

export default NavigationService;