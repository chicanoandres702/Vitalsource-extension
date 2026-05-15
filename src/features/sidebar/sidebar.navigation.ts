/**
 * Handles routing logic within the sidebar.
 * Fixes the "navigateToPage is not a function" error by providing a stable interface.
 */
export const sidebarNavigator = {
  /**
   * Standardized entry point for the sidebar orchestrator.
   * Prevents "init is not a function" TypeErrors.
   */
  init(): void {
    // Navigation state setup can be added here if needed
  },

  navigateToPage: (pageId: string): void => {
    // Design Intent: Centralize navigation logic to allow for 
    // state persistence and analytics tracking in the future.
    if (!pageId) return;
    
    const url = new URL(window.location.href);
    url.searchParams.set('page', pageId);
    window.history.pushState({}, '', url.toString());
  }
};