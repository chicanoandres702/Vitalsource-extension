/**
 * File: chicanoandres702/vitalsource-extension/Vitalsource-extension-temp/sidebar.js
 * Project: VitalSource PilotPro
 * Description: High-stability modular UI Controller for autonomous page ripping.
 * Improvements: Duplicate detection, capture semaphores, and resilient frame targeting.
 */

const Config = {
    DEFAULTS: {
        engineActive: true,
        autopickActive: true,
        targetSelector: 'body', 
        snapDelay: 1800,        // Slightly increased for high-res rendering
        watchdogInterval: 18000, // 18s to allow for network lag/CSP blocks
        kickstartDelay: 2500
    },
    DOM_SELECTORS: {
        BTN_RUN: 'btn-run',
        BTN_SNAP: 'btn-snap',
        BTN_PICK: 'btn-pick',
        BTN_AUTOPICK: 'btn-autopick',
        BTN_CLEAR: 'btn-clear',
        BTN_EXPORT: 'btn-export'
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
    isRecovering: false,
    isPicking: false,
    isProcessing: false, // NEW: Prevent watchdog from firing during heavy capture
    lastCfi: null,       // NEW: Prevent duplicate page saves

    async saveSelector(selector) {
        this.targetSelector = selector;
        await chrome.storage.local.set({ customTargetSelector: selector });
    },

    async restoreSelector() {
        const result = await new Promise(r => chrome.storage.local.get(['customTargetSelector'], r));
        if (result.customTargetSelector) {
            this.targetSelector = result.customTargetSelector;
        }
    }
};

const MessagingService = {
    broadcast(cmd, targetFrame = null) {
        const payload = { type: 'CMD', ...cmd };
        
        const transmit = (tabId) => {
            if (targetFrame !== null) {
                chrome.tabs.sendMessage(tabId, payload, { frameId: targetFrame }, (r) => {
                    if (chrome.runtime.lastError) {
                        chrome.tabs.sendMessage(tabId, payload, () => {});
                    }
                });
            } else {
                chrome.tabs.sendMessage(tabId, payload, () => {
                    if (chrome.runtime.lastError) return;
                });
            }
        };

        if (PilotState.targetTabId) {
            transmit(PilotState.targetTabId);
        } else {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    PilotState.targetTabId = tabs[0].id;
                    transmit(tabs[0].id);
                }
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

const TOCService = {
    process(type, data) {
        try {
            let dataObj = typeof data === 'string' ? JSON.parse(data) : data;
            const subType = type || '';
            
            if (subType.includes('TOC') || subType.includes('OUTLINE')) {
                const items = Array.isArray(dataObj) ? dataObj : (dataObj.items || []);
                const hierarchicalTOC = TOCService.buildHierarchy(items);
                if (window.PilotQueue?.setOutline) window.PilotQueue.setOutline(hierarchicalTOC);
                if (window.PilotRenderer?.renderTOC) window.PilotRenderer.renderTOC(hierarchicalTOC);
            } else if (subType.includes('PAGEBREAKS')) {
                if (window.PilotQueue?.setPagebreaks) window.PilotQueue.setPagebreaks(dataObj);
            }
        } catch (e) {
            console.error('[PilotPro] TOC Error:', e);
        }
    },

    buildHierarchy(flatList) {
        const root = [];
        const stack = [];
        flatList.forEach(item => {
            const node = { ...item, children: [] };
            const level = item.level || 0;
            while (stack.length > 0 && stack[stack.length - 1].level >= level) {
                stack.pop();
            }
            if (stack.length === 0) {
                root.push(node);
            } else {
                stack[stack.length - 1].children.push(node);
            }
            stack.push(node);
        });
        return root;
    }
};

const WatchdogService = {
    timer: null,

    reset() {
        WatchdogService.stop();
        if (!PilotState.engineActive || PilotState.isPicking || PilotState.isProcessing) return;
        
        WatchdogService.timer = setTimeout(() => {
            WatchdogService.onStall();
        }, Config.DEFAULTS.watchdogInterval);
    },

    stop() {
        if (WatchdogService.timer) {
            clearTimeout(WatchdogService.timer);
            WatchdogService.timer = null;
        }
    },

    onStall() {
        // Double check state before barking
        if (!PilotState.engineActive || PilotState.isRecovering || PilotState.isPicking || PilotState.isProcessing) return;
        
        PilotState.isRecovering = true;
        console.warn('[PilotPro] Watchdog: Cycle stalled. Triggering recovery snap...');
        
        try {
            MessagingService.broadcast({ action: 'PING', forceInit: true });
            CaptureService.triggerSnap();
            
            setTimeout(() => {
                if (PilotState.engineActive && PilotState.isRecovering) {
                    console.log('[PilotPro] Watchdog: Recovery snap failed. Forcing page advance.');
                    NavigationService.advance();
                    PilotState.isRecovering = false;
                }
            }, 5000);

            WatchdogService.reset();
        } catch (err) {
            PilotState.isRecovering = false;
            WatchdogService.reset();
        }
    }
};

const CaptureService = {
    triggerSnap() {
        if (!PilotState.engineActive || PilotState.isPicking || PilotState.isProcessing) return;
        MessagingService.broadcast({ 
            action: 'SNAP', 
            selector: PilotState.targetSelector, 
            autoSelect: true 
        }, PilotState.targetFrameId);
    },

    processData(msg) {
        const currentCfi = MessagingService.extractCfi(msg);
        
        // Block duplicates if engine is just spinning on one page
        if (PilotState.lastCfi && currentCfi === PilotState.lastCfi) {
            console.log('[PilotPro] Capture: Skipping duplicate CFI ->', currentCfi);
            if (PilotState.engineActive) NavigationService.advance();
            return;
        }

        PilotState.isProcessing = true;
        PilotState.isRecovering = false;
        WatchdogService.stop(); // Hold the watchdog while we capture
        
        if (msg.html) {
            msg.html = msg.html.replace(/<div[^>]*id="pilot-highlighter"[^>]*>.*?<\/div>/gi, '');
        }
        msg.cfi = currentCfi;

        chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 100 }, (dataUrl) => {
            PilotState.isProcessing = false;
            
            if (!chrome.runtime.lastError && dataUrl) {
                msg.image = dataUrl;
                PilotState.lastCfi = currentCfi;
            }

            if (window.PilotStorage) window.PilotStorage.savePage(msg);
            PilotState.sessionPageCount++;
            
            const count = (window.PilotStorage?.buffer?.length) || (window.PilotStorage?.pages?.length) || PilotState.sessionPageCount;
            if (window.PilotRenderer) window.PilotRenderer.updateProgress(count, 100);
            
            if (PilotState.engineActive) {
                NavigationService.advance();
            } else {
                WatchdogService.reset();
            }
        });
    }
};

const NavigationService = {
    advance() {
        if (PilotState.isPicking || PilotState.isProcessing) return;
        
        // Broadcast NEXT to all frames to ensure it hits the jigsaw navigation controls
        MessagingService.broadcast({ action: 'NEXT_PAGE' }, null); 
        MessagingService.broadcast({ action: 'PAGE_ACK' }, null);
        
        WatchdogService.reset();
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
            if (PilotState.targetFrameId === null && PilotState.engineActive && !PilotState.isPicking) {
                console.log('[PilotPro] Controller: Kickstarting loop...');
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

        const btnPick = document.getElementById(Config.DOM_SELECTORS.BTN_PICK);
        if (btnPick) {
            btnPick.textContent = PilotState.isPicking ? 'CANCEL PICK' : 'PICK CONTENT ELEMENT';
            btnPick.style.borderColor = PilotState.isPicking ? 'var(--green)' : '';
        }
        
        const btnRun = document.getElementById(Config.DOM_SELECTORS.BTN_RUN);
        if (btnRun) {
            btnRun.textContent = PilotState.engineActive ? 'STOP PILOT' : 'START PILOT';
            btnRun.style.backgroundColor = PilotState.engineActive ? 'rgba(255, 0, 0, 0.2)' : '';
        }
    },

    bindUI() {
        const setAction = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.onclick = fn.bind(this);
        };

        setAction(Config.DOM_SELECTORS.BTN_RUN, () => {
            PilotState.engineActive = !PilotState.engineActive;
            PilotState.isPicking = false; 
            PilotState.isProcessing = false;
            this.syncUI();
            if (PilotState.engineActive) {
                WatchdogService.reset();
                CaptureService.triggerSnap();
            } else {
                WatchdogService.stop();
            }
        });

        setAction(Config.DOM_SELECTORS.BTN_SNAP, () => {
            PilotState.lastCfi = null; // Force snap even if same CFI
            WatchdogService.reset();
            CaptureService.triggerSnap();
        });

        setAction(Config.DOM_SELECTORS.BTN_PICK, () => {
            if (PilotState.isPicking) {
                PilotState.isPicking = false;
                MessagingService.broadcast({ action: 'CANCEL_PICK' });
                if (PilotState.engineActive) WatchdogService.reset();
            } else {
                PilotState.isPicking = true;
                WatchdogService.stop();
                if (PilotState.snapTimeout) clearTimeout(PilotState.snapTimeout);
                MessagingService.broadcast({ action: 'PICK' }, null); 
            }
            this.syncUI();
        });

        setAction(Config.DOM_SELECTORS.BTN_AUTOPICK, () => {
            PilotState.autopickActive = !PilotState.autopickActive;
            if (window.PilotStorage?.toggleAutopick) window.PilotStorage.toggleAutopick(PilotState.autopickActive);
            this.syncUI();
        });

        setAction(Config.DOM_SELECTORS.BTN_EXPORT, () => {
            if (window.PilotStorage?.assemble) window.PilotStorage.assemble();
        });

        setAction(Config.DOM_SELECTORS.BTN_CLEAR, () => {
            if (window.PilotStorage) window.PilotStorage.clear();
            PilotState.sessionPageCount = 0;
            PilotState.lastCfi = null;
            PilotState.targetSelector = Config.DEFAULTS.targetSelector;
            chrome.storage.local.remove('customTargetSelector');
            if (window.PilotRenderer) window.PilotRenderer.updateProgress(0, 100);
        });
    },

    bindEvents() {
        chrome.runtime.onMessage.addListener((msg, sender) => {
            const actions = {
                'SELECTOR_PICKED': () => {
                    if (msg.selector) {
                        PilotState.isPicking = false;
                        PilotState.saveSelector(msg.selector);
                        this.syncUI();
                        if (PilotState.engineActive) {
                            WatchdogService.reset();
                            CaptureService.triggerSnap();
                        }
                    }
                },
                'DATA': () => CaptureService.processData(msg),
                'ALIVE': () => {
                    PilotState.isRecovering = false;
                    if (!PilotState.isPicking && !PilotState.isProcessing) WatchdogService.reset();
                    
                    PilotState.activeSensors.set(msg.sensorId, Date.now());
                    const frameUrl = sender.url || msg.url || '';
                    const currentCfi = MessagingService.extractCfi({ url: frameUrl });
                    
                    if (window.PilotRenderer) {
                        PilotRenderer.updateFrameCount(PilotState.activeSensors.size);
                        PilotRenderer.updateVesselInfo(currentCfi || msg.contextId, msg.url);
                    }
                    
                    PilotState.targetTabId = sender.tab?.id || PilotState.targetTabId;
                    
                    // Identify the Book Container Frame
                    if (frameUrl.includes('jigsaw.vitalsource.com') || frameUrl.includes('.xhtml') || frameUrl.includes('epub')) {
                        PilotState.targetFrameId = sender.frameId;
                        
                        if (PilotState.engineActive && !PilotState.isPicking && !PilotState.isProcessing) {
                            if (PilotState.snapTimeout) clearTimeout(PilotState.snapTimeout);
                            PilotState.snapTimeout = setTimeout(() => {
                                CaptureService.triggerSnap();
                            }, Config.DEFAULTS.snapDelay);
                        }
                    }
                },
                'MANIFEST': () => TOCService.process(msg.subType, msg.data)
            };
            if (actions[msg.type]) actions[msg.type]();
        });
    }
};

document.addEventListener('DOMContentLoaded', () => PilotController.init());