import { logger } from '../../services/logger.service.js';
import { stateManager } from '../state/state.manager.js';
import { isExtensionAlive } from '../../services/utils.service.js';
import { captureMetadata } from '../capture/capture.metadata.js';

/**
 * TurnerService handles the actual DOM interactions for page turning.
 */
class TurnerService {
  constructor() {
    this.selectors = {
      nextButton: 'button[aria-label*="Next"], .next-button, [data-testid="next-btn"], .vst-icon-next',
      prevButton: 'button[aria-label*="Prev"], .prev-button, [data-testid="prev-btn"], .vst-icon-prev'
    };
  }

  /**
   * Simulates a keyboard keydown event.
   * @param {string} key - The key to simulate (e.g., 'ArrowRight', 'ArrowLeft').
   */
  simulateKeydown(key) {
    const event = new KeyboardEvent('keydown', {
      key: key,
      code: key,
      keyCode: key === 'ArrowRight' ? 39 : (key === 'ArrowLeft' ? 37 : 0), // Deprecated but some systems might still use it
      which: key === 'ArrowRight' ? 39 : (key === 'ArrowLeft' ? 37 : 0), // Deprecated but some systems might still use it
      bubbles: true,
      cancelable: true,
      composed: true
    });

    // Design Intent: Reader shells usually listen for keys on the top window. 
    // We attempt to dispatch to window.top if accessible (same-origin).
    try {
      if (window.top && window.top.document) {
        window.top.document.dispatchEvent(event);
        return;
      }
    } catch (e) {
      // CORS barrier: Navigation will be handled by requestGlobalNavigation() 
      // which uses the background debugger targeting the main frame.
    }
    document.dispatchEvent(event);
  }

  /** 
   * Dispatches navigation requests to the background script.
   * This allows for 'isTrusted' events via the Debugger API.
   */
  async requestGlobalNavigation(direction) {
    const key = direction === 'next' ? 'ArrowRight' : 'ArrowLeft';
    const code = direction === 'next' ? 39 : 37;
    
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ 
        type: 'REQUEST_NAVIGATION', 
        direction,
        key,
        keyCode: code,
        method: 'chrome_debugger'
      }, (response) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(response);
      });
    });
  }

  /**
   * Moves to next page and returns a promise that resolves when the UI has changed.
   */
  async nextPage() {
    return this.navigate('next', this.selectors.nextButton);
  }

  /**
   * Moves to previous page.
   */
  async previousPage() {
    return this.navigate('prev', this.selectors.prevButton);
  }

  async navigate(direction, selector) {
    const previousPageText = stateManager.getCurrentPage();
    try {
      stateManager.setTransitioning(true);
      if (!isExtensionAlive()) return false;

      // Design Intent: Always use the background debugger to navigate. 
      // This bypasses CORS issues when the content script is in an iframe 
      // and the buttons are in the top-level shell.
      await this.requestGlobalNavigation(direction);
      const success = await this.waitForPageChange(previousPageText, 8000);

      return success;
    } finally {
      stateManager.setTransitioning(false);
    }
  }

  async waitForPageChange(oldValue, timeout = 3000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const newValue = captureMetadata.getCurrentPageValue();
      if (newValue !== oldValue) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return false; // Timeout reached, but maybe it worked anyway
  }
}

const serviceInstance = new TurnerService();

// Export as navigationService for capture/observer services
export const navigationService = serviceInstance;

// Export as turnerService for coordinator service
export const turnerService = serviceInstance;