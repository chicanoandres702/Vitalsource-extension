/**
 * storage.service.js
 * Handles the page buffer and browser storage synchronization.
 */

const PilotStorage = {
    buffer: [],
    styles: '',
    autopickEnabled: false,

    savePage(data) {
        this.buffer.push(data);
        if (data.styles) this.styles = data.styles;
        
        // Persist immediately to prevent data loss on extension crash/reload
        chrome.storage.local.set({ 
            active_rip_buffer: this.buffer,
            active_rip_styles: this.styles
        });
    },

    clear() {
        this.buffer = []; this.styles = '';
        chrome.storage.local.remove(['active_rip_buffer', 'active_rip_styles', 'autopick_mode']);
    },
    
    toggleAutopick(enable) {
        this.autopickEnabled = enable;
        chrome.storage.local.set({ autopick_mode: enable });
    },
    
    loadAutopickState() {
        chrome.storage.local.get('autopick_mode', (result) => {
            this.autopickEnabled = result.autopick_mode || false;
        });
    },

    assemble() {
        // Retrieve pages from both in-memory buffer and persistent storage
        chrome.storage.local.get(['active_rip_buffer', 'active_rip_styles'], (stored) => {
            const finalPages = stored.active_rip_buffer || this.buffer;
            const finalStyles = stored.active_rip_styles || this.styles;
            
            const cache = {
                validPages: finalPages,
                globalStyles: finalStyles,
                bookMetadata: window.bookMetadata,
                bookOutline: PilotQueue.outline,
                pagebreaks: PilotQueue.pagebreaks
            };
            
            console.log('[PilotPro] Packing Vessel for Reconstruct...', cache);
            
            chrome.storage.local.set({ printDataCache: cache }, () => {
                chrome.tabs.create({ url: chrome.runtime.getURL('print.html') });
            });
        });
    }
};

window.PilotStorage = PilotStorage;
