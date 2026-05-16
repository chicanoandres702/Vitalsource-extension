/**
 * Manifest Config Service
 * Handles queuing and orchestrating chapter sweeps based on user selection.
 */

import chapterTreeService from '../ui/chapter-tree.service.js';

let ripQueue = [];
let currentRipIndex = -1;
let isRippingManifest = false;

export const manifestRipService = {
    init(sendCommand, setEngineState, flipDelay) {
        this.sendCommand = sendCommand;
        this.setEngineState = setEngineState;
        this.flipDelay = flipDelay;
    },

    isRipping() {
        return isRippingManifest;
    },

    getCurrentItem() {
        return ripQueue[currentRipIndex] || null;
    },
    
    stop() {
        isRippingManifest = false;
    },

    _startRipping() {
        const outline = chapterTreeService.getOutline();
        console.log('[PilotPro] start(): outline length:', outline.length);
        if (outline.length === 0) {
            console.warn('[PilotPro] start(): outline is empty — loading from localStorage...');
            // Use same key pattern as intercept.entry.js
            const tocKeys = Object.keys(localStorage).filter(k => k.startsWith('__VS_TOC_'));
            if (tocKeys.length > 0) {
                try {
                    const saved = JSON.parse(localStorage.getItem(tocKeys[0]));
                    if (Array.isArray(saved) && saved.length > 0) {
                        chapterTreeService.handleOutlineUpdate(saved);
                        console.log('[PilotPro] start(): loaded TOC from localStorage', saved.length, 'items');
                    }
                } catch (e) {}
            }
            if (chapterTreeService.getOutline().length === 0) {
                alert('No outline loaded yet. Open the book and wait a few seconds for TOC to sync, then try again.');
                return;
            }
        }
        
        this.setEngineState(true);
        isRippingManifest = true;
        console.log('[PilotPro] start(): isRippingManifest set to true, sending ENGINE_CONFIG with initiate:true');
        
        if (chapterTreeService.getMode() === 'chapter') {
            const selectedCfis = chapterTreeService.getSelectedChapters();
            if (selectedCfis.size > 0) {
                console.log('[PilotPro] start(): chapter mode with', selectedCfis.size, 'selected chapters');
                const blocks = [];
                let currentBlock = null;
                for (let i = 0; i < outline.length; i++) {
                    const ch = outline[i];
                    if (selectedCfis.has(ch.cfi)) {
                        if (!currentBlock) currentBlock = { startItem: ch, stopPage: null };
                    } else {
                        if (currentBlock) {
                            currentBlock.stopPage = ch.page;
                            blocks.push(currentBlock);
                            currentBlock = null;
                        }
                    }
                }
                if (currentBlock) {
                    currentBlock.stopPage = 'EOF';
                    blocks.push(currentBlock);
                }
                ripQueue = blocks.map(b => ({ ...b.startItem, stopPage: b.stopPage }));
                console.log('[PilotPro] Grouped selection into', ripQueue.length, 'rip blocks');
            } else {
                ripQueue = [...outline];
            }
        } else {
            ripQueue = [{ ...outline[0], stopPage: 'EOF' }];
            console.log('[PilotPro] Auto Rip set to organic unified sweep.');
        }
        
        currentRipIndex = 0;
        this.sendCommand({ action: 'ENGINE_CONFIG', state: true, speed: this.flipDelay, initiate: true, forceManualStep: (chapterTreeService.getMode() === 'full') });
        this.processQueue();
    }

    start() {
        const waitForOutline = (attempt = 0) => {
            const outline = chapterTreeService.getOutline();
            if (outline.length > 0) {
                this._startRipping();
                return;
            }
            if (attempt >= 20) { // 20 attempts * 100ms = 2 seconds
                console.warn('[PilotPro] start(): outline is empty after waiting — loading from localStorage...');
                // Use same key pattern as intercept.entry.js
                const tocKeys = Object.keys(localStorage).filter(k => k.startsWith('__VS_TOC_'));
                if (tocKeys.length > 0) {
                    try {
                        const saved = JSON.parse(localStorage.getItem(tocKeys[0]));
                        if (Array.isArray(saved) && saved.length > 0) {
                            chapterTreeService.handleOutlineUpdate(saved);
                            console.log('[PilotPro] start(): loaded TOC from localStorage', saved.length, 'items');
                        }
                    } catch (e) {}
                }
                if (chapterTreeService.getOutline().length === 0) {
                    alert('No outline loaded yet. Open the book and wait a few seconds for TOC to sync, then try again.');
                    return;
                }
                this._startRipping();
                return;
            }
            setTimeout(() => waitForOutline(attempt + 1), 100);
        };
        waitForOutline();
    }

    processQueue() {
        if (!isRippingManifest || currentRipIndex >= ripQueue.length) {
            if (currentRipIndex >= ripQueue.length) {
                this.setEngineState(false);
                isRippingManifest = false;
                alert('Manifest Rip Complete!');
            }
            return;
        }

        const item = ripQueue[currentRipIndex];
        console.log('[PilotPro] Ripping manifest item:', item.title, 'page:', item.page, 'StopAt:', item.stopPage);

        this.sendCommand({ action: 'JUMP', cfi: item.cfi, url: item.url, page: item.page, title: item.title });
        this.sendCommand({ action: 'ENGINE_CONFIG', state: true, speed: this.flipDelay, stopPage: item.stopPage });

        setTimeout(() => {
            if (isRippingManifest) this.sendCommand({ action: 'SNAP' });
        }, this.flipDelay + 400);
    },

    advanceQueue() {
        currentRipIndex++;
        this.processQueue();
    },

    handlePageData(d, pgLabel) {
        if (!isRippingManifest) return false;
        
        const currentItem = ripQueue[currentRipIndex];
        if (currentItem) {
            // Apply manifest metadata override
            d.meta.chapter = ripQueue[currentRipIndex].title;
            d.meta.pageText = ripQueue[currentRipIndex].page || d.meta.pageText;

            let stopStr = String(currentItem.stopPage).trim().toLowerCase();
            let currStr = pgLabel.toLowerCase();
            let currClean = currStr.replace(/page/g, '').trim();

            if (stopStr === currStr || stopStr === currClean) {
                // Skip duplicate pagebreak cluster
                while (currentRipIndex < ripQueue.length - 1 && 
                       String(ripQueue[currentRipIndex + 1].page).toLowerCase().replace(/page/g,'').trim() === currClean) {
                    currentRipIndex++;
                }

                console.log('[PilotPro] Boundary Reached, moving queue');
                setTimeout(() => this.advanceQueue(), 300);
                return true; 
            }
            
            if (!currentItem.stopPage || currentItem.stopPage === 'EOF') {
                if (!currentItem.stopPage) {
                    const currentP = currentItem.page;
                    while (currentRipIndex < ripQueue.length - 1 && ripQueue[currentRipIndex + 1].page === currentP) {
                        currentRipIndex++;
                    }
                    this.advanceQueue();
                } else {
                    this.sendCommand({ action: 'PAGE_ACK', url: d.meta.url });
                }
            } else {
                this.sendCommand({ action: 'PAGE_ACK', url: d.meta.url });
            }
            return true;
        }
        return false;
    }
};
export default manifestRipService;

/**
 * DOM fallback: try to read the TOC / outline from the live page DOM
 * when the interceptor relay hasn't arrived yet.
 */
function tryReadOutlineFromDOM() {
    try {
        // Strategy 1: Look for nav[epub:type="toc"] or similar TOC containers
        const tocSelectors = [
            'nav[epub:type="toc"]',
            '.toc, #toc, .table-of-contents, #table-of-contents',
            '[role="navigation"][aria-label*="Table of Contents" i]',
            '[role="navigation"][aria-label*="Contents" i]',
            '.chapter-list, .toc-list',
            'ol.toc, ul.toc'
        ];
        
        for (const selector of tocSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                // Extract outline from TOC navigation structure
                const outline = [];
                elements.forEach(el => {
                    // Look for links that point to sections/chapters
                    const links = el.querySelectorAll('a[href]');
                    links.forEach(link => {
                        const href = link.getAttribute('href');
                        const text = link.innerText.trim();
                        if (href && text && !href.startsWith('javascript:')) {
                            // Extract potential CFI or section ID from href
                            let cfi = '';
                            let page = '';
                            // Try to extract hash-based fragment
                            if (href.includes('#')) {
                                const hash = href.split('#')[1];
                                if (hash) {
                                    cfi = hash;
                                    // Try to get page number from data-cgi or similar
                                    const targetEl = document.getElementById(hash);
                                    if (targetEl) {
                                        const dataCgi = targetEl.getAttribute('data-cgi');
                                        if (dataCgi && /^\d+$/.test(dataCgi)) {
                                            page = dataCgi;
                                        }
                                    }
                                }
                            }
                            outline.push({
                                cfi: cfi || `toc-link-${outline.length}`,
                                page: page || '',
                                title: text,
                                level: 0,
                                url: href
                            });
                        }
                    });
                });
                if (outline.length > 0) {
                    console.log('[PilotPro] DOM fallback: found TOC via selector', selector, 'with', outline.length, 'items');
                    return outline;
                }
            }
        }
        
        // Strategy 2: Skip window.parent access (cross-origin blocked in extension context)
        // Rely on FETCH_TOC message instead (sent to content script which shares origin with VST)
        
        // Strategy 3: Check sessionStorage and localStorage for cached TOC
        try {
            const storageKeys = ['vs_toc', 'vitalsource_toc', 'book_toc', 'chapter_outline'];
            for (const key of storageKeys) {
                const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
                if (raw) {
                    try {
                        const data = JSON.parse(raw);
                        if (Array.isArray(data) && data.length > 0) {
                            // Normalize to our expected format
                            const outline = data.map(ch => ({
                                cfi: ch.cfi || ch.id || '',
                                page: ch.page || ch.pageLabel || '',
                                title: ch.title || ch.label || '',
                                level: ch.level || 0,
                                url: ch.url || ch.path || ''
                            }));
                            console.log('[PilotPro] DOM fallback: found TOC in storage key', key, 'with', outline.length, 'items');
                            return outline;
                        }
                    } catch (parseErr) {
                        // Invalid JSON, continue
                    }
                }
            }
        } catch (e) {
            console.log('[PilotPro] DOM fallback: storage access error:', e);
        }
        
        // Strategy 4: Try to read from content frame via postMessage (synchronous fallback)
        // This is a last resort - we already have FETCH_TOC but we can try a sync version
        try {
            // This won't work in extension context but let's try anyway
            if (window.top && window.top !== window) {
                // Try to reach the content frame through the tab's main frame
                // This is complex and may not work due to framing
            }
        } catch (e) {
            // Ignore
        }
        
        return [];
    } catch (e) {
        console.error('[PilotPro] DOM fallback error:', e);
        return [];
    }
}
