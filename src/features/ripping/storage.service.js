/**
 * Storage Service
 * Handles data persistence and communication with the background script
 */

class StorageService {
  constructor() {
    this.data = [];
    this.isInitialized = false;
    this.contextValid = true;
    this.initializing = false;
    this.retryTimer = null;
    this.bridgeListenersSetup = false;
    this.setupInboundBridge();
  }

  setupInboundBridge() {
    if (this.bridgeListenersSetup) return;
    this.bridgeListenersSetup = true;

    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data?.pilotBridgeInbound) return;
      const { requestId, action, payload } = event.data;
      if (!requestId || !action) return;

      let response = null;
      switch (action) {
        case 'GET_PILOT_STORAGE_COUNT':
          response = { count: this.getCount() };
          break;
        case 'GET_PILOT_STORAGE_PAGES':
          response = { pages: this.getAllPages() };
          break;
        case 'CLEAR_PILOT_STORAGE':
          this.data = [];
          response = { success: true };
          break;
        default:
          response = { error: 'Unknown action' };
      }

      window.postMessage({
        pilotBridgeResponse: true,
        requestId,
        response
      }, '*');
    });
  }

  markInvalid() {
    if (this.contextValid && this.isInitialized) {
      console.warn('[Pilot] Context invalidated. Refresh required.');
    }
    this.contextValid = false;
  }

  checkContext() {
    const directRuntime = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
    const pageBridge = typeof window !== 'undefined' && typeof window.postMessage === 'function';
    if (!directRuntime && !pageBridge) {
      if (this.isInitialized) {
        this.markInvalid();
      } else {
        this.contextValid = false;
      }
      return false;
    }
    return true;
  }

  scheduleRetry() {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.init();
    }, 3000);
  }

  initBridge() {
    if (this.bridgeInitialized) return;
    this.bridgeInitialized = true;
    this.bridgeResolvers = new Map();

    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data?.pilotBridgeResponse) return;
      const { requestId, response } = event.data;
      const resolver = this.bridgeResolvers.get(requestId);
      if (!resolver) return;
      this.bridgeResolvers.delete(requestId);
      resolver.resolve(response);
    });
  }

  sendViaBridge(message) {
    this.initBridge();
    return new Promise((resolve, reject) => {
      const requestId = `pilot_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      this.bridgeResolvers.set(requestId, { resolve, reject });
      window.postMessage({
        pilotBridgeRequest: true,
        requestId,
        message
      }, '*');

      setTimeout(() => {
        if (this.bridgeResolvers.has(requestId)) {
          this.bridgeResolvers.delete(requestId);
          reject(new Error('Bridge timeout'));
        }
      }, 5000);
    });
  }

  async init() {
    if (this.isInitialized || this.initializing) return;
    if (!this.checkContext()) {
      if (!this.isInitialized) {
        this.isInitialized = true;
        console.log('[Pilot] Storage initialized in local-only mode.');
      }
      return;
    }

    this.initializing = true;
    try {
      const response = await this.sendMessage({ action: 'GET_STORAGE_DATA' });
      if (response?.data) {
        this.data = response.data;
      }
      this.isInitialized = true;
      this.contextValid = true;
      console.log('[Pilot] Storage synced.');
    } catch (e) {
      this.isInitialized = true; // Still allow local use
      console.warn('[Pilot] Storage sync unavailable (using local-only mode)');
      this.scheduleRetry();
    } finally {
      this.initializing = false;
    }
  }

  sendMessage(message) {
    return new Promise((resolve, reject) => {
      if (!this.checkContext()) return reject(new Error('Context invalidated'));

      const hasRuntime = typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function';
      if (hasRuntime) {
        try {
          chrome.runtime.sendMessage(message, (response) => {
            const lastErr = chrome.runtime.lastError;
            if (lastErr) {
              if (lastErr.message.includes('Could not establish connection') ||
                  lastErr.message.includes('Receiving end does not exist')) {
                this.markInvalid();
                return reject(new Error('Context invalidated'));
              }
              return reject(new Error(lastErr.message));
            }
            resolve(response);
          });
        } catch (e) {
          reject(e);
        }
      } else {
        this.sendViaBridge(message)
          .then(resolve)
          .catch(reject);
      }
    });
  }

  getCount() {
    return Array.isArray(this.data) ? this.data.length : 0;
  }

  getAllPages() {
    return Array.isArray(this.data) ? [...this.data] : [];
  }

  async clear() {
    this.data = [];
    try {
      await this.sendMessage({ action: 'CLEAR_STORAGE' });
    } catch (e) {
      console.warn('[Pilot] Background clear failed. Local cache cleared.');
    }
  }

  async savePage(pageData) {
    if (!Array.isArray(this.data)) this.data = [];
    this.data.push(pageData);

    try {
      await this.sendMessage({ 
        action: 'SAVE_PAGE', 
        data: pageData,
        total: this.data.length 
      });
    } catch (e) {
      console.warn('[Pilot] Background sync failed, data stored locally.');
    }
  }
}

window.PilotStorage = new StorageService();
window.PilotStorage.init();