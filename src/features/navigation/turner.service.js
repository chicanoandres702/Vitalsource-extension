/**
 * Navigation service for page turning and jumping
 */
import { findDeep } from '../../services/utils.service.js';
import { logger } from '../../services/logger.service.js';
import { stateManager } from '../state/state.manager.js';
import { messagingService } from '../../services/messaging.service.js';
import { contentDetector } from '../capture/content.detector.js';
import { captureService } from '../capture/capture.service.js';

const NEXT_SELECTORS = [
    'button[aria-label="Next"]',
    '[aria-label="Next page"]',
    '[aria-label*="Next"]',
    '[aria-label*="forward" i]',
    '.IconButton__button-bQttMI[aria-label="Next"]',
    '.next-button',
    '.vst-icon-next',
    '[data-testid="next-page"]'
].join(', ');

class NavigationService {
    constructor() {
        this.pageInputCache = null;
    }

    findPageInput() {
        // Search for it including inside shadow DOMs
        return findDeep('input.InputControl__input') ||
               findDeep('input[id^="text-field-"]')   ||
               document.querySelector('input.InputControl__input') ||
               document.querySelector('input[id^="text-field-"]');
    }

    // Simulate the full React synthetic + native event chain on an input
    setInputValue(input, value) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(input, value);
        input.dispatchEvent(new Event('input',  { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    navigateToPage(cmd) {
        // cmd has: { page, cfi, url, title }
        const pageNum = cmd.page ? String(cmd.page).trim() : null;
        const currentPos = captureService.getCurrentPageValue();

        // Guard: Don't re-jump if we are already where we need to be.
        // This prevents the "reset to chapter start" stutter.
        if (pageNum && currentPos && String(pageNum) === String(currentPos)) {
            logger.log('NAV', 'Already at target page: ' + pageNum + '. Skipping JUMP.');
            // If we were supposed to snap, fire it anyway
            if (stateManager.getIsScraping()) captureService.scheduleSnap(200);
            return;
        }

        if (pageNum) {
            const input = this.findPageInput();
            if (input) {
                logger.log('NAV', `Navigating via page input to: ${pageNum}`);
                input.focus();
                this.setInputValue(input, pageNum);

                // Fire the full keyboard Enter chain that React/VS listeners expect
                const enterOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
                input.dispatchEvent(new KeyboardEvent('keydown',  enterOpts));
                input.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
                input.dispatchEvent(new KeyboardEvent('keyup',    enterOpts));

                // Also submit the parent form if present
                const form = input.closest('form');
                if (form) form.dispatchEvent(new Event('submit', { bubbles: true }));

                // Delayed repeat in case React processes asynchronously
                setTimeout(() => {
                    input.dispatchEvent(new KeyboardEvent('keydown',  enterOpts));
                    input.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
                    input.dispatchEvent(new KeyboardEvent('keyup',    enterOpts));
                }, 50);

                return;
            }
        }

        // Fallback: CFI hash navigation
        if (cmd.cfi) {
            logger.log('NAV', `Fallback CFI nav: ${cmd.cfi}`);
            window.location.hash = cmd.cfi;
        } else if (cmd.url) {
            const clean = cmd.url.split('#')[0];
            if (window.location.pathname.includes(clean)) {
                const h = cmd.url.split('#')[1];
                if (h) window.location.hash = h;
            } else {
                window.location.href = cmd.url;
            }
        }
    }

    triggerNext() {
        const now = Date.now();
        if (now - stateManager.getLastFlipTime() < stateManager.getFlipDelay() * 0.8) return;
        stateManager.setLastFlipTime(now);

        // Check if we hit the limit for chapter ripping
        const currentPage = captureService.getCurrentPageValue();
        if (stateManager.getAutoPilot() && stateManager.getAutoPilotStopPage() && currentPage === stateManager.getAutoPilotStopPage()) {
            logger.log('AUTO', 'Reached stop boundary: ' + currentPage + '. Ending chapter sweep.');
            stateManager.configureEngine({ state: false });
            messagingService.sendChapterComplete(currentPage);
            return;
        }

        stateManager.setHasSnappedCurrentPage(false);
        contentDetector.invalidateSliderCache();

        stateManager.setTransitioning(true);
        setTimeout(() => { stateManager.setTransitioning(false); }, Math.min(1000, stateManager.getFlipDelay() * 0.6)); // Reduced transition time

        const nextBtn = findDeep(NEXT_SELECTORS);

        // Prioritize Keyboard ArrowRight as requested, then fallback to click
        const keyOptions = { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, which: 39, bubbles: true, cancelable: true };
        const targets = [document, window, document.body];
        try { if (window.top !== window.self) targets.push(window.top.document, window.top); } catch(e) {}

        logger.log('NAV', 'Simulating ArrowRight trigger...');
        targets.forEach(t => {
            try {
                if (t.focus) t.focus();
                t.dispatchEvent(new KeyboardEvent('keydown', keyOptions));
                t.dispatchEvent(new KeyboardEvent('keyup',   keyOptions));
            } catch(err) {}
        });

        // Fallback to physical click if keyboard didn't seem to work (or as a double-tap)
        if (nextBtn && !nextBtn.disabled) {
            logger.log('NAV', 'Sending fallback Click to Next button.');
            nextBtn.click();
        }

        // Explicitly schedule the next snap to ensure the loop continues even if mutations are missed
        const lastP = captureService.getCurrentPageValue();
        let moveRetries = 0;
        const checkMove = setInterval(() => {
            if (!stateManager.getAutoPilot() || !stateManager.getIsScraping()) { clearInterval(checkMove); return; }
            const currentP = captureService.getCurrentPageValue();
            if (currentP !== lastP) {
                logger.log('NAV', `Page advanced: ${lastP} -> ${currentP}`);
                clearInterval(checkMove);
                return;
            }
            moveRetries++;
            if (moveRetries > 8) { // Wait roughly 4s (8 * 500ms)
                logger.log('NAV', 'No page movement detected after retries. Nudge recovery.');
                clearInterval(checkMove);
                this.triggerNext(); // Double-tap nudge
            }
        }, 500);
    }
}

export const navigationService = new NavigationService();
