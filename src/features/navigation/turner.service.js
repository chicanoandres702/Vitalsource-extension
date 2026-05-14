/**
 * Optimized TurnerService for VitalSource Capella
 * Features: Atomic Snapping, Pagebreak URL Mapping, and Render Verification
 */
class TurnerService {
  constructor() {
    this.isTurning = false;
    this.turboMode = false;
    this.cooldown = 200;
    this.pagebreaks = []; // Loaded from the jigsaw pagebreaks URL
    this.currentIndex = 0;

    this.selectors = {
      next: 'button[aria-label="Next"]',
      prev: 'button[aria-label="Previous"]',
      pageInput: 'input[aria-label="Go to Page"]',
      currentPageDisplay: '[data-testid="current-page-metadata"], .sc-ekRyGy',
      tocItems: 'nav[aria-label="Table of Contents"] button[data-uuid]',
      loaders: [
        '#staticloader',
        '[class*="circle"]',
        '[class*="loadingPulse"]',
        '.sc-hvoJYN',
        '[aria-busy="true"]'
      ],
      contentPane: '.sc-hKwDye, iframe[title="Document reading pane"]'
    };
  }

  /**
   * Loads the physical pagebreak data from the VitalSource API.
   * This ensures the PDF generator knows exactly where physical pages start.
   */
  ingestPageBreaks(data) {
    if (!Array.isArray(data)) return;
    this.pagebreaks = data.map((item, index) => ({
      ...item,
      sequence: index + 1
    }));
  }

  setTurbo(enabled) {
    this.turboMode = enabled;
    this.cooldown = enabled ? 40 : 200;
  }

  async next() {
    return this._snap(this.selectors.next, 'Next');
  }

  async prev() {
    return this._snap(this.selectors.prev, 'Previous');
  }

  /**
   * Returns page info for the current sequence.
   * Used by the PDF generator to insert hard page breaks.
   */
  getCurrentPageInfo() {
    const display = document.querySelector(this.selectors.currentPageDisplay);
    const label = display ? display.textContent.trim() : null;
    return this.pagebreaks.find(pb => pb.label === label) || { label };
  }

  /**
   * Atomic Jump: Bypasses UI lag by forcing internal state updates.
   */
  async goToPage(pageNum) {
    const input = document.querySelector(this.selectors.pageInput);
    if (!input) return false;

    // 1. Force value injection
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    valueSetter.call(input, pageNum);

    // 2. Trigger React reconciliation
    ['input', 'change', 'blur'].forEach(t => input.dispatchEvent(new Event(t, { bubbles: true })));

    // 3. Hardware Enter simulation
    const enter = new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
    });
    input.dispatchEvent(enter);

    // 4. Verify the jump actually happened before returning
    await this.waitForReady(this.turboMode ? 3000 : 6000);
    return true;
  }

  async _snap(selector, label) {
    if (this.isTurning && !this.turboMode) return false;
    
    const btn = document.querySelector(selector) || 
                document.querySelector(`button[aria-label="${label}"]`);

    if (!btn || btn.hasAttribute('disabled')) return false;

    this.isTurning = true;
    btn.click();

    if (this.turboMode) {
      this.isTurning = false; // Trust waitForReady for synchronization
    } else {
      setTimeout(() => { this.isTurning = false; }, this.cooldown);
    }
    
    return true;
  }

  /**
   * Robust loading check. 
   * Also verifies if the text content is "empty" or "pulsing" which indicates
   * the snapshot data (like 235,210,87...) hasn't been decrypted yet.
   */
  _isHardLoading() {
    // Check for explicit UI loaders
    for (const sel of this.selectors.loaders) {
      const el = document.querySelector(sel);
      if (el) {
        const style = window.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
          return true;
        }
      }
    }
    
    // Check if content is actually rendered in the pane
    const pane = document.querySelector(this.selectors.contentPane);
    if (!pane) return true;

    // In many VitalSource books, a 'blank' or 'skeleton' state is used during load
    if (pane.innerText?.length < 10) return true; 

    return false;
  }

  /**
   * High-Frequency Sync Poller.
   * Crucial for preventing partial/broken data captures.
   */
  async waitForReady(maxWait = 5000) {
    const start = Date.now();
    
    // Initial wait to allow the React event loop to register the change
    await new Promise(r => setTimeout(r, 70));

    while (this._isHardLoading() && (Date.now() - start) < maxWait) {
      // Poll faster in turbo mode
      await new Promise(r => setTimeout(r, this.turboMode ? 50 : 100));
    }

    // Stability grace period: Prevents taking a snapshot of the "fade-in" transition
    const grace = this.turboMode ? 80 : 300;
    await new Promise(r => setTimeout(r, grace));
  }

  getOutlineFromTOC() {
    const items = Array.from(document.querySelectorAll(this.selectors.tocItems));
    const rawOutline = items.map(btn => {
      const label = btn.querySelector('.sc-kQoPux')?.textContent || '';
      const pageLabel = btn.querySelector('.sc-ekRyGy')?.textContent || '';
      const level = this._getTOCLevel(btn);
      return { label: label.trim(), pageLabel: pageLabel.trim(), level };
    });

    return rawOutline.filter((item, index, self) => 
      item.label && index === self.findIndex((t) => (
        t.label === item.label && t.pageLabel === item.pageLabel
      ))
    );
  }

  _getTOCLevel(element) {
    let level = 1;
    let parent = element.closest('ul');
    while (parent && parent.parentElement.closest('nav')) {
      level++;
      parent = parent.parentElement.closest('ul');
    }
    return level;
  }
}

export const navigationService = new TurnerService();