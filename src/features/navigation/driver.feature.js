/**
 * driver.feature.js
 * Handles navigation actions like next-page and deep linking.
 */

const PilotDriver = {
    triggerNext() {
        // [MOD] Ensure we are significant frame before allowing navigation control
        if (window.top !== window.self && !window.PilotScanner.autoDetectContent()) return;
        
        console.log('[PilotPro] Advancing logic engaged.');
        const nextBtn = window.PilotScanner.findDeep('.next-button, .vst-next, [aria-label*="Next"], button[id*="next"]');
        if (nextBtn) {
            nextBtn.click();
            return true;
        }

        // Keyboard fallback
        const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
        document.dispatchEvent(event);
        return true;
    },

    navigateToPage(cfi, url, pageLabel) {
        console.log(`[PilotPro] Jumping to ${pageLabel} (${cfi})`);
        
        const input = window.PilotScanner.findDeep('input[class*="InputControl__input"], input[id^="text-field-"]');
        if (input && pageLabel && !isNaN(pageLabel)) {
            this.setInputValue(input, pageLabel);
            return;
        }

        if (url) {
            window.location.href = url;
        } else if (cfi) {
            // CFI navigation usually via window message to the reader app
            window.postMessage({ type: 'vst-jump', cfi }, '*');
        }
    },

    setInputValue(input, value) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
};

window.PilotDriver = PilotDriver;
