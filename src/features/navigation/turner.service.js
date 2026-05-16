import logger from '../../services/logger.service.js';
import stateManager from '../state/state.manager.js';
import { isExtensionAlive } from '../../services/utils.service.js';
import captureMetadata from '../capture/capture.metadata.js';
import { KEY_CODES, TIMEOUTS } from './navigation.constants.js';

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
   * Design Intent: Standardized entry point for the sidebar orchestrator.
   * Prevents "init is not a function" TypeErrors.
   */
  init() {
      logger.log('NAV', 'Turner Service Active');
  }

  /**
   * Simulates a keyboard keydown event.
   * @param {string} key - The key to simulate (e.g., 'ArrowRight', 'ArrowLeft').
   */
  simulateKeydown(key) {
    const isRight = key === 'ArrowRight';
    const code = isRight ? KEY_CODES.ARROW_RIGHT : (key === 'ArrowLeft' ? KEY_CODES.ARROW_LEFT : KEY_CODES.DEFAULT);

    const event = new KeyboardEvent('keydown', {
      key: key,
      code: key,
      keyCode: code,
      which: code,
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
    * Dispatches navigation requests.
    * First tries direct DOM event (worked in earlier versions), 
    * falls back to background debugger for trusted events if needed.
    */
   async requestGlobalNavigation(direction) {
     const key = direction === 'next' ? 'ArrowRight' : 'ArrowLeft';
     const code = direction === 'next' ? KEY_CODES.ARROW_RIGHT : KEY_CODES.ARROW_LEFT;

     // 1. Click next button (most reliable on mosaic-book)
     try {
       const nextBtn = document.querySelector(
         'button[aria-label*="Next"], .next-button, [data-testid="next-btn"], .vst-icon-next, mosaic-book button[aria-label*="Next"]'
       );
       if (nextBtn) {
         nextBtn.click();
         return 'button';
       }
     } catch (e) {}

     // 2. Direct keyboard dispatch
     try {
       const event = new KeyboardEvent('keydown', {
         key,
         code: key,
         keyCode: code,
         which: code,
         bubbles: true,
         cancelable: true
       });
       document.dispatchEvent(event);
       if (window.top && window.top !== window) {
         window.top.document.dispatchEvent(event);
       }
       return 'direct';
     } catch (e) {}

     // 3. Debugger fallback
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
    if (!isExtensionAlive()) return false;

    const navResult = await this.requestGlobalNavigation(direction);

    if (navResult === 'button' || navResult === 'direct') {
      await new Promise(r => setTimeout(r, 350));
      return true;
    }

    const success = await this.waitForPageChange(stateManager.getCurrentPage(), TIMEOUTS.PAGE_CHANGE_MAX);
    return success;
  }

  async waitForPageChange(oldValue, timeout = TIMEOUTS.PAGE_CHANGE_DEFAULT) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const newValue = captureMetadata.getCurrentPageValue();
      if (newValue !== oldValue) return true;
      await new Promise(r => setTimeout(r, TIMEOUTS.POLL_INTERVAL));
    }
    return false; // Timeout reached, but maybe it worked anyway
  }

  async navigateToPage(message) {
    // Handle JUMP command - navigate to specific page/chapter
    // For now, log and do nothing as specific page navigation may not be implemented
    logger.log('NAV', 'navigateToPage called with:', message);
    // TODO: Implement specific page navigation if needed
  }

  async triggerNext() {
    // Trigger the next page turn
    return this.nextPage();
  }
}

const serviceInstance = new TurnerService();
export default serviceInstance;