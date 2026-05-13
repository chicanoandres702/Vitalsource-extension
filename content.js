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
        
        // Log for debugging
        console.log(`[PilotPro] Cmd Received: ${action}`, { sensorId: SENSOR_ID, hasCustomSelector: !!window.customSelector });
        
        if (action === 'PING') {
            // Respond to ping to confirm frame is alive
            console.log('[PilotPro] PING received - frame responsive');
            this.safeSend({ type: 'PING_ACK', sensorId: SENSOR_ID, url: location.href });
            return;
        }
        
        if (action === 'SNAP') {
            console.log('[PilotPro] SNAP action triggered');
            PilotAutopilot.snapWithRetry(0, true);
            return;
        }
        
        if (action === 'NEXT_PAGE' || action === 'PAGE_ACK') {
            console.log('[PilotPro] Navigation action:', action);
            PilotDriver.triggerNext();
            if (window.isScraping) setTimeout(() => PilotAutopilot.snapWithRetry(), 1500);
            return;
        }
        
        if (action === 'PICK') {
            console.log('[PilotPro] PICK mode activated');
            this.activatePicker();
            return;
        }
        
        if (action === 'AUTOPICK') {
            console.log('[PilotPro] AUTOPICK toggled:', p.enabled);
            if (p.enabled) {
                const content = PilotScanner.autoDetectContent();
                if (content) window.customSelector = PilotScanner.generateOptimalSelector(content);
            } else {
                window.customSelector = null;
            }
            return;
        }
        
        if (action === 'ENGINE_CONFIG') {
            console.log('[PilotPro] Engine config:', p.state);
            window.isScraping = p.state;
            if (window.isScraping) PilotAutopilot.snapWithRetry();
            return;
        }
        
        if (action === 'CANCEL_PICK') {
            console.log('[PilotPro] PICK mode cancelled');
            // Just clear the picking state
            return;
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
        // Send ALIVE immediately on startup
        console.log('[PilotPro] Sending initial ALIVE pulse');
        this.safeSend({ 
            type: 'ALIVE', sensorId: SENSOR_ID, contextId: CONTEXT_ID, url: location.href
        });
        // Then send every 5 seconds
        this._pulseTimer = setInterval(() => this.safeSend({ 
            type: 'ALIVE', sensorId: SENSOR_ID, contextId: CONTEXT_ID, url: location.href
        }), 5000);
    }
};

window.PilotOrchestrator = PilotOrchestrator;
PilotOrchestrator.init();
