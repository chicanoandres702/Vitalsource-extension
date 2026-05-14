/**
 * Manifest Config Service
 * Handles queuing and orchestrating chapter sweeps based on user selection.
 */

import { chapterTreeService } from '../ui/chapter-tree.service.js';

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

    start() {
        const outline = chapterTreeService.getOutline();
        if (outline.length === 0) return;
        
        this.setEngineState(true);
        isRippingManifest = true;
        
        if (chapterTreeService.getMode() === 'chapter') {
            const selectedCfis = chapterTreeService.getSelectedChapters();
            if (selectedCfis.size > 0) {
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
        this.sendCommand({ action: 'ENGINE_CONFIG', state: true, speed: this.flipDelay, forceManualStep: (chapterTreeService.getMode() === 'full') });
        this.processQueue();
    },

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
