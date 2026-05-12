/**
 * File: chicanoandres702/vitalsource-extension/Vitalsource-extension-temp/sidebar.js
 * Project: VitalSource PilotPro
 * Description: Refactored Modular UI Controller for autonomous page ripping.
 * Features: Zero-Click Auto-Start, Anti-Stall Watchdog, and CFI Extraction.
 */

const Config = {
    DEFAULTS: {
        engineActive: true,
        autopickActive: true,
        targetSelector: 'body', // Automatically choose the outermost element
        snapDelay: 1200,
        watchdogInterval: 6000,
        kickstartDelay: 1500
    },
    DOM_SELECTORS: {
        BTN_RUN: 'btn-run',
        BTN_SNAP: 'btn-snap',
        BTN_PICK: 'btn-pick',
        BTN_AUTOPICK: 'btn-autopick',
        BTN_RECONSTRUCT: 'btn-reconstruct',
        BTN_CLEAR: 'btn-clear'
    }
};

const PilotState = {
    engineActive: Config.DEFAULTS.engineActive,
    autopickActive: Config.DEFAULTS.autopickActive,
    targetSelector: Config.DEFAULTS.targetSelector,
    sessionPageCount: 0,
    targetTabId: null,
    targetFrameId: null,
    activeSensors: new Map(),
    snapTimeout: null,

    async saveSelector(selector) {
        this.targetSelector = selector;
        await chrome.storage.local.set({ customTargetSelector: selector });
    },

    async restoreSelector() {
        const result = await new Promise(r => chrome.storage.local.get(['customTargetSelector'], r));
        if (result.customTargetSelector) {
            this.targetSelector = result.customTargetSelector;
            console.log('[PilotPro] State: Custom Selector Restored ->', this.targetSelector);
        }
    }
};

const MessagingService = {
    /**
     * Tunnels a command directly to a specific frame to bypass CORS/Security blocks.
     */
    broadcast(cmd, targetFrame = null) {
        const payload = { type: 'CMD', ...cmd };
        if (PilotState.targetTabId) {
            const options = targetFrame !== null ? { frameId: targetFrame } : {};
            chrome.tabs.sendMessage(PilotState.targetTabId, payload, options, () => {
                if (chrome.runtime.lastError) return;
            });
        } else {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                tabs.forEach(t => chrome.tabs.sendMessage(t.id, payload, () => {
                    if (chrome.runtime.lastError) return;
                }));
            });
        }
    },

    extractCfi(msg) {
        const url = msg.meta?.url || msg.url || '';
        const pageId = msg.meta?.pageId || '';
        const cfiMatch = url.match(/(?:#|\?)cfi=([^&#]+)/);
        if (cfiMatch) return decodeURIComponent(cfiMatch[1]);
        if (pageId.includes('cfi=')) return decodeURIComponent(pageId.split('cfi=')[1]);
        return null;
    }
};

const CaptureService = {
    /**
     * Commands the target frame to snap the specified element automatically.
     */
    triggerSnap() {
        if (!PilotState.engineActive) return;
        
        console.log(`[PilotPro] Capture: Auto-commanding SNAP to Frame ${PilotState.targetFrameId || 'Top'}...`);
        MessagingService.broadcast({ 
            action: 'SNAP', 
            selector: PilotState.targetSelector, 
            autoSelect: true // Enforces zero-interaction selection
        }, PilotState.targetFrameId);
    },

    processData(msg) {
        console.log('[PilotPro] Capture: Processing page payload...');
        
        // Clean highlighter traces from HTML
        if (msg.html) {
            msg.html = msg.html.replace(/<div[^>]*id="pilot-highlighter"[^>]*>.*?<\/div>/gi, '');
        }
        
        msg.cfi = MessagingService.extractCfi(msg);

        // Perform visual capture before advancing
        chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 100 }, (dataUrl) => {
            if (!chrome.runtime.lastError && dataUrl) msg.image = dataUrl;

            if (window.PilotStorage) PilotStorage.savePage(msg);
            PilotState.sessionPageCount++;
            
            const count = (window.PilotStorage?.buffer?.length) || 
                          (window.PilotStorage?.pages?.length) || 
                          (typeof window.PilotStorage?.getPageCount === 'function' ? window.PilotStorage.getPageCount() : PilotState.sessionPageCount);
            
            if (window.PilotRenderer) PilotRenderer.updateProgress(count, 100);
            
            if (PilotState.engineActive) {
                NavigationService.advance();
            }
        });
    }
};

const NavigationService = {
    advance() {
        console.log('[PilotPro] Navigation: Triggering page turn.');
        MessagingService.broadcast({ action: 'NEXT_PAGE' }, 0); // Always frame 0 for UI nav
        MessagingService.broadcast({ action: 'PAGE_ACK' }, 0);
        WatchdogService.reset();
    }
};

const WatchdogService = {
    timer: null,

    reset() {
        if (this.timer) clearTimeout(this.timer);
        if (!PilotState.engineActive) return;

        this.timer = setTimeout(() => {
            if (!PilotState.engineActive) return;
            
            console.warn('[PilotPro] Watchdog: Stagnation detected! Forcing cycle...');
            try {
                CaptureService.triggerSnap();
                
                // Force navigation if no data follows the snap
                setTimeout(() => {
                    if (PilotState.engineActive) {
                        NavigationService.advance();
                    }
                }, 2000);

                this.reset();
            } catch (err) {
                console.error('[PilotPro] Watchdog Error:', err);
            }
        }, Config.DEFAULTS.watchdogInterval);
    },

    stop() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    }
};

const PilotController = {
    async init() {
        this.bindUI();
        this.bindEvents();
        
        await PilotState.restoreSelector();
        this.syncUI();
        
        console.log('[PilotPro] HUD SYSTEM ONLINE');
        
        WatchdogService.reset();
        this.kickstart();
    },

    kickstart() {
        setTimeout(() => {
            if (PilotState.targetFrameId === null) {
                console.log('[PilotPro] Engine: Kickstarting dormant session...');
                CaptureService.triggerSnap();
            }
        }, Config.DEFAULTS.kickstartDelay);
    },

    syncUI() {
        if (window.PilotRenderer) PilotRenderer.setEngineActive(PilotState.engineActive);
        const btnAuto = document.getElementById(Config.DOM_SELECTORS.BTN_AUTOPICK);
        if (btnAuto) {
            btnAuto.style.borderColor = PilotState.autopickActive ? 'var(--green)' : 'var(--cyan)';
            btnAuto.style.color = PilotState.autopickActive ? 'var(--green)' : '';
            btnAuto.textContent = PilotState.autopickActive ? 'AUTOPICK: ON' : 'AUTOPICK';
        }
    },

    bindUI() {
        const setAction = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.onclick = fn.bind(this);
        };

        setAction(Config.DOM_SELECTORS.BTN_RUN, () => {
            PilotState.engineActive = !PilotState.engineActive;
            this.syncUI();
            if (PilotState.engineActive) {
                WatchdogService.reset();
                CaptureService.triggerSnap();
            } else {
                WatchdogService.stop();
            }
        });

        setAction(Config.DOM_SELECTORS.BTN_SNAP, () => CaptureService.triggerSnap());

        setAction(Config.DOM_SELECTORS.BTN_PICK, () => {
            const btn = document.getElementById(Config.DOM_SELECTORS.BTN_PICK);
            if (btn) btn.textContent = 'PICKING...';
            MessagingService.broadcast({ action: 'PICK' }, PilotState.targetFrameId);
            setTimeout(() => { if (btn) btn.textContent = 'PICK'; }, 3000);
        });

        setAction(Config.DOM_SELECTORS.BTN_AUTOPICK, () => {
            PilotState.autopickActive = !PilotState.autopickActive;
            if (window.PilotStorage?.toggleAutopick) {
                PilotStorage.toggleAutopick(PilotState.autopickActive);
            }
            this.syncUI();
        });

        setAction(Config.DOM_SELECTORS.BTN_RECONSTRUCT, () => {
            if (window.PilotStorage) PilotStorage.assemble();
        });

        setAction(Config.DOM_SELECTORS.BTN_CLEAR, () => {
            if (window.PilotStorage) PilotStorage.clear();
            PilotState.sessionPageCount = 0;
            PilotState.targetSelector = Config.DEFAULTS.targetSelector;
            chrome.storage.local.remove('customTargetSelector');
            if (window.PilotRenderer) PilotRenderer.updateProgress(0, 100);
            console.log('[PilotPro] Session Reset.');
        });
    },

    bindEvents() {
        chrome.runtime.onMessage.addListener((msg, sender) => {
            const actions = {
                'SELECTOR_PICKED': () => {
                    if (msg.selector) PilotState.saveSelector(msg.selector);
                },
                'DATA': () => {
                    WatchdogService.reset();
                    CaptureService.processData(msg);
                },
                'ALIVE': () => {
                    WatchdogService.reset();
                    PilotState.activeSensors.set(msg.sensorId, Date.now());
                    
                    const frameUrl = sender.url || msg.url || '';
                    const currentCfi = MessagingService.extractCfi({ url: frameUrl });
                    
                    if (window.PilotRenderer) {
                        PilotRenderer.updateFrameCount(PilotState.activeSensors.size);
                        PilotRenderer.updateVesselInfo(currentCfi || msg.contextId, msg.url);
                    }
                    
                    PilotState.targetTabId = sender.tab?.id || PilotState.targetTabId;
                    
                    // Filter specifically for Jigsaw textbook frames
                    if (frameUrl.includes('jigsaw.vitalsource.com') || frameUrl.includes('.xhtml') || frameUrl.includes('epub')) {
                        PilotState.targetFrameId = sender.frameId;
                        
                        if (PilotState.engineActive) {
                            if (PilotState.snapTimeout) clearTimeout(PilotState.snapTimeout);
                            PilotState.snapTimeout = setTimeout(() => {
                                CaptureService.triggerSnap();
                            }, Config.DEFAULTS.snapDelay);
                        }
                    }
                },
                'MANIFEST': () => {
                    try {
                        const dataObj = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;
                        const sub = msg.subType || '';
                        if (sub.includes('TOC') || sub.includes('OUTLINE')) {
                            if (window.PilotQueue) PilotQueue.setOutline(dataObj);
                            if (window.PilotRenderer) PilotRenderer.renderTOC(dataObj);
                        } else if (sub.includes('PAGEBREAKS')) {
                            if (window.PilotQueue) PilotQueue.setPagebreaks(dataObj);
                        }
                    } catch (e) { console.error('[PilotPro] Manifest Error:', e); }
                }
            };
            if (actions[msg.type]) actions[msg.type]();
        });
    }
};

document.addEventListener('DOMContentLoaded', () => PilotController.init());