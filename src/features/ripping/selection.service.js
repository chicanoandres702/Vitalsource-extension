/**
 * selection.service.js
 * Manages selector persistence and autopick behavior for reusable capture logic.
 */

const PilotSelection = {
    selectedSelector: null,
    autopickEnabled: false,

    init() {
        this.loadState();
    },

    loadState() {
        chrome.storage.local.get(['selected_selector', 'autopick_mode'], (result) => {
            this.selectedSelector = result.selected_selector || null;
            this.autopickEnabled = Boolean(result.autopick_mode);
            if (this.selectedSelector) {
                window.customSelector = this.selectedSelector;
            }
            if (this.autopickEnabled) {
                this.autoPick();
            }
        });
    },

    saveSelector(selector) {
        this.selectedSelector = selector;
        window.customSelector = selector;
        chrome.storage.local.set({ selected_selector: selector });
        return selector;
    },

    clear() {
        this.selectedSelector = null;
        chrome.storage.local.remove(['selected_selector']);
        window.customSelector = null;
    },

    autoPick() {
        const content = PilotScanner.autoDetectContent();
        if (!content) return null;
        const selector = PilotScanner.generateOptimalSelector(content);
        if (selector) {
            this.saveSelector(selector);
        }
        return selector;
    },

    toggleAutopick(enable) {
        this.autopickEnabled = enable;
        chrome.storage.local.set({ autopick_mode: enable });
        if (enable) this.autoPick();
        return enable;
    }
};

window.PilotSelection = PilotSelection;
