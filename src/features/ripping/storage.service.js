/**
 * Storage Service
 * Handles data persistence and communication with the background script
 */

class StorageService {
  constructor() {
    this.data = [];
    this.isInitialized = false;
    this.contextValid = true;
  }

  /**
   * Check if the extension context is still valid
   */
  checkContext() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
      if (this.contextValid) {
        console.warn('[Pilot] Storage: Extension context invalidated. Please refresh the page to resume synchronization.');
        this.contextValid = false;
      }
      return false;
    }
    return true;
  }

  async init() {
    if (this.isInitialized) return;
    if (!this.checkContext()) return;

    try {
      // Attempt to sync existing data from background/storage
      const response = await this.sendMessage({ action: 'GET_STORAGE_DATA' });
      if (response && response.data) {
        this.data = response.data;
      }
      
      this.isInitialized = true;
      console.log('[Pilot] Storage service initialized and synced.');
    } catch (e) {
      console.warn('[Pilot] Storage sync failed (normal during dev reload):', e.message);
    }
  }

  /**
   * Helper to send messages safely with context checks
   */
  sendMessage(message) {
    return new Promise((resolve, reject) => {
      if (!this.checkContext()) {
        return reject(new Error('Extension context invalidated'));
      }

      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      } catch (e) {
        this.checkContext();
        reject(e);
      }
    });
  }

  async savePage(pageData) {
    this.data.push(pageData);
    
    if (this.checkContext()) {
      try {
        await this.sendMessage({ 
          action: 'SAVE_PAGE', 
          data: pageData,
          total: this.data.length 
        });
      } catch (e) {
        console.warn('[Pilot] Storage: Local save successful, but background sync failed.');
      }
    }
  }

  /**
   * Public API for Watchdog and UI
   * Now synchronous to prevent "not available" errors
   */
  getCount() {
    return this.data.length;
  }

  clear() {
    this.data = [];
    if (this.checkContext()) {
      this.sendMessage({ action: 'CLEAR_STORAGE' }).catch(() => {});
    }
  }
}

// Global instance with immediate assignment to window
// This ensures window.PilotStorage.getCount() is available to Watchdog immediately
window.PilotStorage = new StorageService();

// Start initialization sequence
(function() {
  if (window.PilotStorage) {
    window.PilotStorage.init();
  }
})();