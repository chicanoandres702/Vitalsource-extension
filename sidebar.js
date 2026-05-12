/**
 * sidebar.js - UI Controller
 * Compliance: 100-Line Law
 */

const PilotController = {
    activeSensors: new Map(),

    init() {
        this.bindUI(); this.bindEvents();
        console.log('[PilotPro] HUD SYSTEM ONLINE');
    },

    bindUI() {
        const setAction = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.onclick = fn;
        };
        setAction('btn-run', () => {
            window.engineActive = !window.engineActive;
            PilotRenderer.setEngineActive(window.engineActive);
            this.broadcast({ action: 'ENGINE_CONFIG', state: window.engineActive });
        });
        setAction('btn-snap', () => this.broadcast({ action: 'SNAP' }));
        setAction('btn-pick', () => {
            const btn = document.getElementById('btn-pick');
            if (btn) btn.textContent = 'PICKING...';
            this.broadcast({ action: 'PICK' });
            setTimeout(() => { if (btn) btn.textContent = 'PICK'; }, 3000);
        });
        setAction('btn-autopick', () => {
            const btn = document.getElementById('btn-autopick');
            PilotStorage.toggleAutopick(!PilotStorage.autopickEnabled);
            if (btn) {
                btn.style.borderColor = PilotStorage.autopickEnabled ? 'var(--green)' : 'var(--cyan)';
                btn.style.color = PilotStorage.autopickEnabled ? 'var(--green)' : '';
            }
            this.broadcast({ action: 'AUTOPICK', enabled: PilotStorage.autopickEnabled });
        });
        setAction('btn-reconstruct', () => PilotStorage.assemble());
        setAction('btn-clear', () => {
            PilotStorage.clear(); PilotRenderer.updateProgress(0, 100);
        });
    },

    bindEvents() {
        chrome.runtime.onMessage.addListener((msg, sender) => {
            const actions = {
                'DATA': () => {
                    PilotStorage.savePage(msg);
                    PilotRenderer.updateProgress(PilotStorage.buffer.length, 100);
                    this.broadcast({ action: 'PAGE_ACK' });
                },
                'ALIVE': () => {
                    this.activeSensors.set(msg.sensorId, Date.now());
                    PilotRenderer.updateFrameCount(this.activeSensors.size);
                    PilotRenderer.updateVesselInfo(msg.contextId, msg.url);
                    window.targetTabId = sender.tab?.id || window.targetTabId;
                },
                'MANIFEST': () => {
                    if (msg.subType === 'VS_TOC_JSON' || msg.subType === 'VS_OUTLINE_JSON') {
                        PilotQueue.setOutline(msg.data);
                        PilotRenderer.renderTOC(msg.data);
                    } else if (msg.subType === 'VS_PAGEBREAKS_JSON') {
                        PilotQueue.setPagebreaks(msg.data);
                    }
                }
            };
            if (actions[msg.type]) actions[msg.type]();
        });
    },

    broadcast(cmd) {
        const send = (id) => chrome.tabs.sendMessage(id, { type: 'CMD', ...cmd }, () => {
            if (chrome.runtime.lastError) return;
        });
        if (window.targetTabId) send(window.targetTabId);
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            tabs.forEach(t => { if (t.id !== window.targetTabId) send(t.id); });
        });
    }
};

document.addEventListener('DOMContentLoaded', () => PilotController.init());