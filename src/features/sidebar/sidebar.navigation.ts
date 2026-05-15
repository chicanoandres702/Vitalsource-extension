/**
 * Handles routing logic within the sidebar.
 * Fixes the "navigateToPage is not a function" error by providing a stable interface.
 */
export const sidebarNavigator = {
  navigateToPage: (pageId: string): void => {
    // Design Intent: Centralize navigation logic to allow for 
    // state persistence and analytics tracking in the future.
    if (!pageId) return;
    
    const url = new URL(window.location.href);
    url.searchParams.set('page', pageId);
    window.history.pushState({}, '', url.toString());
  }
};