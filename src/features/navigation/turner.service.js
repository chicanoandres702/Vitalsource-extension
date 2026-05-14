/**
 * Optimized TurnerService for VitalSource Capella
 * Designed for "Snap-Action" navigation and streamlined DOM interaction.
 */
class TurnerService {
  constructor() {
    this.isTurning = false;
    this.turnLockTimeout = 400; // ms to lock between snaps
    this.selectors = {
      next: 'button[aria-label="Next"]',
      prev: 'button[aria-label="Previous"]',
      pageInput: 'input[aria-label="Go to Page"]',
      loader: '#staticloader, [class*="loadingPulse"]',
      progressSlider: '[role="slider"][aria-label="Book Progression"]'
    };
  }

  /**
   * Snaps to the next page using the most direct DOM path.
   */
  async next() {
    return this._performSnap(this.selectors.next, 'Next');
  }

  /**
   * Snaps to the previous page.
   */
  async prev() {
    return this._performSnap(this.selectors.prev, 'Previous');
  }

  /**
   * Streamlined page jump bypassing the input UI if possible.
   * @param {number|string} pageNum 
   */
  async goToPage(pageNum) {
    const input = document.querySelector(this.selectors.pageInput);
    if (!input) return false;

    input.value = pageNum;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Simulate Enter key for the React form
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true
    });
    input.dispatchEvent(enterEvent);
    return true;
  }

  /**
   * Internal snap logic
   */
  async _performSnap(selector, label) {
    if (this.isTurning || this._isBookLoading()) return false;

    const btn = document.querySelector(selector);
    if (!btn || btn.disabled) {
      // Fallback: search by text/aria if class names changed
      const fallback = Array.from(document.querySelectorAll('button'))
        .find(b => b.getAttribute('aria-label') === label);
      
      if (!fallback) return false;
      return this._executeClick(fallback);
    }

    return this._executeClick(btn);
  }

  _executeClick(element) {
    this.isTurning = true;
    
    // High-priority click dispatch
    element.click();

    // Auto-unlock after transition
    setTimeout(() => {
      this.isTurning = false;
    }, this.turnLockTimeout);

    return true;
  }

  /**
   * Checks if the reader is currently in a "busy" or "loading" state
   * to prevent snapping during asset fetches.
   */
  _isBookLoading() {
    const loader = document.querySelector(this.selectors.loader);
    if (loader && window.getComputedStyle(loader).display !== 'none') {
      return true;
    }
    return false;
  }

  /**
   * Returns current progression percentage from the slider DOM
   */
  getProgression() {
    const slider = document.querySelector(this.selectors.progressSlider);
    if (!slider) return 0;
    return parseFloat(slider.getAttribute('aria-valuenow')) || 0;
  }
}

// Renamed to match the expected import in capture.service.js, observer.service.js, and content.entry.js
export const navigationService = new TurnerService();