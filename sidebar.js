/**
 * filepath: sidebar.js
 */

const Sidebar = {
  async init() {
    this.cacheElements();
    this.bindEvents();
    this.setupListeners();
    await this.refreshUI();
  },

  cacheElements() {
    this.btnExport = document.getElementById('btn-export');
    this.statusDisplay = document.getElementById('status-display');
    this.progressText = document.getElementById('progress-text');
  },

  bindEvents() {
    this.btnExport?.addEventListener('click', () => this.handlePdfExport());
    document.getElementById('btn-snap')?.addEventListener('click', () => this.triggerSnap());
    document.getElementById('btn-pick')?.addEventListener('click', () => this.triggerPick());
    document.getElementById('btn-run')?.addEventListener('click', () => this.toggleAutoRip());
    document.getElementById('btn-clear')?.addEventListener('click', () => this.handleClear());
  },

  async getActiveTabId() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0]?.id ?? null);
      });
    });
  },

  async sendTabRequest(message) {
    const tabId = await this.getActiveTabId();
    if (!tabId) return null;
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        const msgErr = chrome.runtime.lastError;
        if (msgErr) {
          console.warn('[Pilot] Tab request failed:', msgErr.message);
          return resolve(null);
        }
        resolve(response);
      });
    });
  },

  async getStorageCount() {
    const response = await this.sendTabRequest({
      contentBridgeRequest: true,
      requestId: `sidebar_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      action: 'GET_PILOT_STORAGE_COUNT'
    });
    return response?.count ?? 0;
  },

  async getAllPages() {
    const response = await this.sendTabRequest({
      contentBridgeRequest: true,
      requestId: `sidebar_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      action: 'GET_PILOT_STORAGE_PAGES'
    });
    return Array.isArray(response?.pages) ? response.pages : [];
  },

  async clearRemoteStorage() {
    await this.sendTabRequest({
      contentBridgeRequest: true,
      requestId: `sidebar_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      action: 'CLEAR_PILOT_STORAGE'
    });
  },

  async sendCommandToActiveTab(command) {
    const tabId = await this.getActiveTabId();
    if (!tabId) return;
    chrome.tabs.sendMessage(tabId, { type: 'CMD', ...command });
  },

  setupListeners() {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'PILOT_PAGE_CAPTURED') this.refreshUI();
      if (msg.type === 'AUTO_RIP_STATUS_CHANGED') this.updateAutoRipStatus(msg.active);
    });
  },

  async refreshUI() {
    const count = await this.getStorageCount();
    if (this.progressText) this.progressText.textContent = `${count} Pages Saved`;
  },

  triggerPick() {
    this.sendCommandToActiveTab({ action: 'PICK' });
  },
  // Example: send a message to background and handle async response
  async sendAsyncOperation(data) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'ASYNC_OPERATION', data }, (response) => {
        const msgErr = chrome.runtime.lastError;
        if (msgErr) {
          reject(msgErr);
        } else if (response?.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Unknown error'));
        }
      });
    });
  },
  triggerSnap() {
    this.sendCommandToActiveTab({ action: 'SNAP' });
  },

  async handleClear() {
    if (confirm('Permanently delete all session data?')) {
      await this.clearRemoteStorage();
      await this.refreshUI();
    }
  },

  toggleAutoRip() {
    this.sendCommandToActiveTab({ action: 'ENGINE_CONFIG', state: true, speed: 800 });
  },

  /**
   * handlePdfExport
   * Aggregates pages in a bridge tab and requests high-fidelity native print
   */
  async handlePdfExport() {
    const pages = await this.getAllPages();
    if (!pages.length) return alert('No pages captured yet.');

    if (this.statusDisplay) this.statusDisplay.textContent = 'PREPARING...';

    try {
      // 1. Create the invisible print bridge tab
      const printTab = await chrome.tabs.create({ 
        url: chrome.runtime.getURL('print.html'), 
        active: false 
      });

      // 2. Critical delay to allow DOM construction and image fetching
      await new Promise(r => setTimeout(r, 3000));

      // 3. Request PDF from Background
      chrome.runtime.sendMessage({ 
        action: 'CREATE_NATIVE_PDF', 
        targetTabId: printTab.id 
      }, (response) => {
        // Safe check for message channel errors
        const msgErr = chrome.runtime.lastError;
        
        if (response?.success) {
          this.downloadBlob(response.pdfData);
          if (this.statusDisplay) this.statusDisplay.textContent = 'SUCCESS';
        } else {
          const errorMsg = response?.error || msgErr?.message || 'Unknown Error';
          console.error('[PilotPro] Native PDF failed:', errorMsg);
          if (this.statusDisplay) this.statusDisplay.textContent = 'ERR: PRINT';
        }

        // 4. Cleanup bridge tab
        chrome.tabs.remove(printTab.id);
        setTimeout(() => {
          if (this.statusDisplay) this.statusDisplay.textContent = 'STANDBY';
        }, 3000);
      });
    } catch (err) {
      console.error('[PilotPro] Export Process Crash:', err);
      if (this.statusDisplay) this.statusDisplay.textContent = 'ERR: CRASH';
    }
  },

  updateAutoRipStatus(active) {
    const btn = document.getElementById('btn-run');
    if (btn) {
      btn.textContent = active ? 'STOP AUTO-RIP' : 'START AUTO-RIP';
      btn.style.backgroundColor = active ? 'var(--red)' : '';
    }
  },
};

document.addEventListener('DOMContentLoaded', () => Sidebar.init());