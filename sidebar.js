/**
 * File: chicanoandres702/vitalsource-extension/Vitalsource-extension-temp/sidebar.js
 * Project: VitalSource PilotPro
 * Description: High-stability modular UI Controller for autonomous page ripping.
 * Improvements: Duplicate detection, capture semaphores, and resilient frame targeting.
 */

const Config = {
    DEFAULTS: {
        engineActive: false,  // Start disabled - user must click START
        autopickActive: true,
        targetSelector: 'body', 
        snapDelay: 1800,        // Slightly increased for high-res rendering
        watchdogInterval: 8000, // Reduced from 18s for faster stagnation detection
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
        
        const sendToTabAndFrames = (tabId) => {
            // Helper to suppress lastError warnings
            const sendSafe = (message, options = {}) => {
                chrome.tabs.sendMessage(tabId, message, options, () => {
                    // Clear any errors silently
                    void chrome.runtime.lastError;
                });
            };
            
            // If specific frame is targeted, send only to that frame
            if (targetFrame !== null && targetFrame !== undefined) {
                console.log(`[PilotPro] Broadcasting to frame ${targetFrame}:`, cmd.action);
                sendSafe(payload, { frameId: targetFrame });
            } else {
                // Broadcast to all known sensor frames
                console.log(`[PilotPro] Broadcasting to all frames:`, cmd.action, `(${PilotState.activeSensors.size} sensors active)`);
                
                // Send to all active sensor frames only (don't send to frameId 0 blindly)
                let sentCount = 0;
                PilotState.activeSensors.forEach((frameInfo, sensorId) => {
                    if (frameInfo && typeof frameInfo === 'object' && frameInfo.frameId !== undefined) {
                        sendSafe(payload, { frameId: frameInfo.frameId });
                        sentCount++;
                    }
                });
                
                // If no active sensors, broadcast to main frame as fallback
                if (sentCount === 0) {
                    console.log('[PilotPro] No active sensors, broadcasting to main frame');
                    sendSafe(payload);
                }
            }
        };

        if (PilotState.targetTabId) {
            sendToTabAndFrames(PilotState.targetTabId);
        } else {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    PilotState.targetTabId = tabs[0].id;
                    sendToTabAndFrames(tabs[0].id);
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
        console.log('[PilotPro] triggerSnap() called. Engine:', PilotState.engineActive, 'Picking:', PilotState.isPicking, 'Processing:', PilotState.isProcessing);
        
        if (!PilotState.engineActive || PilotState.isPicking || PilotState.isProcessing) {
            console.log('[PilotPro] triggerSnap() - guard condition failed');
            return;
        }
        
        const payload = { 
            action: 'SNAP', 
            selector: PilotState.targetSelector, 
            autoSelect: true 
        };
        
        console.log('[PilotPro] Sending SNAP. targetFrameId:', PilotState.targetFrameId, 'Active sensors:', PilotState.activeSensors.size);
        
        // Priority 1: Send to targetFrameId (primary content frame)
        if (PilotState.targetFrameId !== null && PilotState.targetFrameId !== undefined) {
            console.log('[PilotPro] SNAP -> target frame', PilotState.targetFrameId);
            MessagingService.broadcast(payload, PilotState.targetFrameId);
            return;
        } 
        
        // Priority 2: If we have active sensors, send to all of them
        if (PilotState.activeSensors.size > 0) {
            console.log(`[PilotPro] SNAP -> broadcasting to ${PilotState.activeSensors.size} active sensor(s)`);
            PilotState.activeSensors.forEach((frameInfo, sensorId) => {
                if (frameInfo && typeof frameInfo === 'object' && frameInfo.frameId !== undefined) {
                    console.log(`[PilotPro]   -> Sending to sensor ${sensorId} (frame ${frameInfo.frameId})`);
                    MessagingService.broadcast(payload, frameInfo.frameId);
                }
            });
            return;
        } 
        
        // Priority 3: Broadcast to all frames (for discovery)
        console.log('[PilotPro] SNAP -> broadcast to all frames (discovery)');
        MessagingService.broadcast(payload, null);
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
        if (PilotState.isPicking || PilotState.isProcessing) {
            console.log('[PilotPro] NAV: Skipped (isPicking:', PilotState.isPicking, ', isProcessing:', PilotState.isProcessing, ')');
            return;
        }
        
        console.log('[PilotPro] NAV: Advancing to next page');
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
        // Wait for frames to discover themselves before trying to capture
        let attempts = 0;
        const maxAttempts = 5;
        
        const tryKickstart = () => {
            attempts++;
            
            // Check if we have discovered any frames
            if (PilotState.activeSensors.size > 0 && PilotState.targetFrameId !== null) {
                console.log('[PilotPro] Controller: Frames discovered. Kickstarting loop...');
                if (PilotState.engineActive) {
                    CaptureService.triggerSnap();
                }
            } else if (attempts < maxAttempts) {
                console.log(`[PilotPro] Waiting for frames... (attempt ${attempts}/${maxAttempts})`);
                setTimeout(tryKickstart, 500);
            } else {
                console.log('[PilotPro] Kickstart timeout - frames may not be ready yet');
            }
        };
        
        setTimeout(tryKickstart, 1000);
    },

    syncUI() {
        if (window.PilotRenderer) PilotRenderer.setEngineActive(PilotState.engineActive);
        
        // UPDATE STATUS DISPLAY
        const statusDisplay = document.getElementById('status-display');
        if (statusDisplay) {
            statusDisplay.textContent = PilotState.engineActive ? 'AUTONOMOUS' : 'STANDBY';
        }
        
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
            btnRun.textContent = PilotState.engineActive ? 'STOP PILOT' : 'START AUTO-RIP';
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
                console.log('[PilotPro] Engine starting - sending PING to all frames');
                // Broadcast PING to wake frames and get their frameIds
                MessagingService.broadcast({ action: 'PING', forceInit: true }, null);
                
                // Give frames time to respond with ALIVE messages
                setTimeout(() => {
                    console.log(`[PilotPro] Starting capture loop. Active sensors: ${PilotState.activeSensors.size}`);
                    WatchdogService.reset();
                    CaptureService.triggerSnap();
                }, 1000);
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
                'PING_ACK': () => {
                    console.log('[PilotPro] PING_ACK received from sensor:', msg.sensorId);
                    PilotState.activeSensors.set(msg.sensorId, {
                        frameId: sender.frameId,
                        lastActivity: Date.now(),
                        url: msg.url
                    });
                    PilotState.targetTabId = sender.tab?.id || PilotState.targetTabId;
                },
                'ALIVE': () => {
                    PilotState.isRecovering = false;
                    if (!PilotState.isPicking && !PilotState.isProcessing) WatchdogService.reset();
                    
                    // Store sensor info with frameId for targeting
                    PilotState.activeSensors.set(msg.sensorId, {
                        frameId: sender.frameId,
                        lastActivity: Date.now(),
                        url: msg.url || sender.url
                    });
                    
                    const frameUrl = sender.url || msg.url || '';
                    const currentCfi = MessagingService.extractCfi({ url: frameUrl });
                    
                    console.log(`[PilotPro] ALIVE from sensor ${msg.sensorId} (frame ${sender.frameId})`);
                    
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