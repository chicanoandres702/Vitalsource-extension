/**
 * Communication layer between sidebar and background scripts.
 * Prevents "Receiving end does not exist" errors using try-catch blocks.
 */
export const sidebarMessenger = {
  sendMessage: async (message: object): Promise<unknown> => {
    try {
      // Check if extension context is still valid before sending
      if (!chrome.runtime?.id) {
        throw new Error('Extension context invalidated');
      }
      
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      /**
       * RCA: Connection errors usually happen if the background script is idle.
       * We catch it here to prevent the UI from crashing.
       */
      console.debug('Extension connection suppressed:', error);
      return null;
    }
  }
};