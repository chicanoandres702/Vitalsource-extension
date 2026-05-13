/**
 * orchestrator.js
 * Main orchestrator that loads all PilotPro features and manages auto-rip functionality.
 * Note: Features are loaded as global scripts, not ES modules.
 */

const PilotOrchestrator = {
    isAutoRipActive: false,
    currentPageId: null,
    pageCounter: 0,

    init() {
        console.log('[PilotPro] Orchestrator initializing...');
        this.setupMessageHandlers();
        this.setupNavigationWatcher();
        if (window.PilotWatchdog) {
            window.PilotWatchdog.arm();
        }
    },

    setupMessageHandlers() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            switch (request.type) {
                case 'TOGGLE_AUTO_RIP':
                    this.toggleAutoRip();
                    sendResponse({ success: true });
                    break;
                case 'SNAP':
                    this.handleManualSnap();
                    sendResponse({ success: true });
                    break;
                case 'PICK':
                    // Already handled in content.js
                    break;
            }
            return true;
        });
    },

    setupNavigationWatcher() {
        // Watch for page changes in VitalSource reader
        let lastUrl = location.href;
        const observer = new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                this.onPageChanged();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Also watch for URL changes
        window.addEventListener('popstate', () => this.onPageChanged());
    },

    onPageChanged() {
        if (this.isAutoRipActive && window.PilotAutopilot) {
            setTimeout(() => {
                window.PilotAutopilot.snapWithRetry(0, false);
            }, 2000); // Wait for page to load
        }
    },

    toggleAutoRip() {
        this.isAutoRipActive = !this.isAutoRipActive;
        console.log(`[PilotPro] Auto-rip ${this.isAutoRipActive ? 'ENABLED' : 'DISABLED'}`);

        if (this.isAutoRipActive && window.PilotAutopilot) {
            // Start auto-ripping current page
            setTimeout(() => {
                window.PilotAutopilot.snapWithRetry(0, false);
            }, 1000);
        }

        // Update UI
        chrome.runtime.sendMessage({
            type: 'AUTO_RIP_STATUS_CHANGED',
            active: this.isAutoRipActive
        });
    },

    handleManualSnap() {
        if (window.PilotAutopilot) {
            window.PilotAutopilot.snapWithRetry(0, true);
        }
    },

    getCurrentPageId() {
        // Extract page ID from URL or DOM
        const urlMatch = location.href.match(/page\/([^\/]+)/);
        if (urlMatch) return urlMatch[1];

        // Fallback: use a hash of current content
        const content = document.body.innerText.substring(0, 100);
        return btoa(content).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
    },

    async sendData(html, styles, meta) {
        try {
            const payload = {
                html: html,
                styles: styles,
                index: this.pageCounter++,
                metadata: {
                    ...meta,
                    url: location.href,
                    timestamp: Date.now()
                }
            };

            if (window.PilotStorage) {
                await window.PilotStorage.savePage(payload);
            }
            chrome.runtime.sendMessage({ type: 'PILOT_PAGE_CAPTURED' });
            console.log(`[PilotPro] Page captured: ${payload.index}`);
        } catch (error) {
            console.error('[PilotPro] Failed to save page:', error);
        }
    }
};

// Make it globally available
window.PilotOrchestrator = PilotOrchestrator;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PilotOrchestrator.init());
} else {
    PilotOrchestrator.init();
}