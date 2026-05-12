/**
 * content.js - Orchestrator Agent
 * Compliance: 100-Line Law
 */

const SENSOR_ID = Math.random().toString(36).substring(2, 9);
const CONTEXT_ID = location.pathname.split('/')[2] || 'unknown';
window.CONTENT_SELECTORS = [
    '.epub-view', '#epub-reader-frame', '.vst-container', 
    '.pbook-content', 'main', '[class*="ReaderContainer"]'
];

const PilotOrchestrator = {
    _pulseTimer: null,
    
    init() {
        this.bindMessages(); this.bindMetadata(); this.startPulse();
        // Load autopick mode preference
        chrome.storage.local.get('autopick_mode', (result) => {
            if (result.autopick_mode) {
                const content = PilotScanner.autoDetectContent();
                if (content) window.customSelector = PilotScanner.generateOptimalSelector(content);
            }
        });
        console.log(`[PilotPro] Agent Online: ${SENSOR_ID}`);
    },

    bindMessages() {
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            if (msg.type !== 'CMD') return;
            this.handleCommand(msg);
            this.forwardCommandToFrames(msg);
            sendResponse({ ack: true }); return false;
        });

        window.addEventListener('message', (e) => {
            if (!e.data?.type || e.data.type !== 'PILOTPRO_CMD' || !e.data.command) return;
            if (e.source === window) return;
            this.handleCommand(e.data.command);
            this.forwardCommandToFrames(e.data.command);
        });
    },

    handleCommand(msg) {
        const { action, ...p } = msg;
        if (action === 'SNAP') PilotAutopilot.snapWithRetry(0, true);
        if (action === 'PICK') this.activatePicker();
        if (action === 'AUTOPICK') {
            if (p.enabled) {
                const content = PilotScanner.autoDetectContent();
                if (content) window.customSelector = PilotScanner.generateOptimalSelector(content);
            } else {
                window.customSelector = null;
            }
        }
        if (action === 'PAGE_ACK') {
            PilotDriver.triggerNext();
            if (window.isScraping) setTimeout(() => PilotAutopilot.snapWithRetry(), 1500);
        }
        if (action === 'ENGINE_CONFIG') {
            window.isScraping = p.state;
            if (window.isScraping) PilotAutopilot.snapWithRetry();
        }
    },

    forwardCommandToFrames(cmd) {
        Array.from(document.querySelectorAll('iframe')).forEach((frame) => {
            try {
                frame.contentWindow?.postMessage({ type: 'PILOTPRO_CMD', command: cmd }, '*');
            } catch (e) {
                // ignore frames we cannot reach
            }
        });
    },

    bindMetadata() {
        window.addEventListener('message', (e) => {
            if (e.data?.type?.startsWith('VS_')) {
                this.safeSend({ type: 'MANIFEST', subType: e.data.type, data: e.data.data });
            }
        });
    },

    activatePicker() {
        const move = (e) => {
            const el = PilotScanner.pierceShadowAtPoint(e.clientX, e.clientY);
            if (el) PilotScanner.highlight(el);
        };
        const down = (e) => {
            e.preventDefault(); e.stopPropagation();
            const el = PilotScanner.pierceShadowAtPoint(e.clientX, e.clientY);
            if (el) {
                window.customSelector = PilotScanner.generateOptimalSelector(el);
                this.safeSend({ type: 'STATUS', text: `Target Locked: ${window.customSelector}` });
                PilotScanner.highlight(el); 
                setTimeout(() => PilotScanner.clearHighlight(), 2000);
            }
            document.removeEventListener('mousemove', move, true);
            document.removeEventListener('mousedown', down, true);
        };
        document.addEventListener('mousemove', move, true);
        document.addEventListener('mousedown', down, true);
    },

    getCurrentPageId() {
        const i = PilotScanner.findDeep('input[class*="InputControl__input"]');
        return i ? i.value : (location.hash || location.pathname);
    },

    sendData(html, styles, meta) {
        this.safeSend({ type: 'DATA', html, styles, meta, sensorId: SENSOR_ID });
    },

    safeSend(msg) {
        try {
            if (!chrome.runtime?.id) { this.stopPulse(); return; }
            chrome.runtime.sendMessage(msg, () => { if (chrome.runtime.lastError) this.stopPulse(); });
        } catch (e) { this.stopPulse(); }
    },

    stopPulse() { if (this._pulseTimer) { clearInterval(this._pulseTimer); this._pulseTimer = null; } },
    startPulse() {
        this.stopPulse();
        this._pulseTimer = setInterval(() => this.safeSend({ 
            type: 'ALIVE', sensorId: SENSOR_ID, contextId: CONTEXT_ID, url: location.href
        }), 5000);
    }
};

window.PilotOrchestrator = PilotOrchestrator;
PilotOrchestrator.init();
