/**
 * Element Picker UI Service
 * Design Intent: Handles the transparent overlay and logic for 
 * selecting specific DOM elements in the book reader.
 */
import logger from '../../services/logger.service.js';
import { pierceShadowAtPoint } from '../../services/utils.service.js';
import stateManager from '../state/state.manager.js';
import messagingService from '../../services/messaging.service.js';

export const elementPicker = {
    deepScan: false,

    /**
     * Standardized entry point for the sidebar orchestrator.
     * Prevents crashes during minified production builds.
     */
    init() {
        logger.log('UI', 'Element Picker Service Initialized');
    },

    activate() {
        if (document.getElementById('vst-picker-shield')) return;
        
        const shield = document.createElement('div');
        shield.id = 'vst-picker-shield';
        Object.assign(shield.style, {
            position: 'fixed', inset: '0', zIndex: '2147483647',
            background: 'rgba(91,141,238,0.05)', pointerEvents: 'none'
        });

        const badge = document.createElement('div');
        Object.assign(badge.style, {
            position: 'fixed', padding: '2px 8px', background: '#5b8dee',
            color: 'white', fontSize: '10px', fontWeight: 'bold',
            borderRadius: '4px', zIndex: '2147483647', display: 'none',
            pointerEvents: 'none', fontFamily: 'sans-serif'
        });

        const toggle = document.createElement('div');
        toggle.innerHTML = 'DEEP SCAN: OFF';
        Object.assign(toggle.style, {
            position: 'fixed', bottom: '20px', right: '20px', padding: '8px 12px',
            background: '#1a1a24', color: 'white', borderRadius: '8px',
            fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
            zIndex: '2147483647', border: '1px solid #334', pointerEvents: 'auto'
        });
        toggle.onclick = (e) => {
            e.stopPropagation();
            this.deepScan = !this.deepScan;
            toggle.innerHTML = `DEEP SCAN: ${this.deepScan ? 'ON' : 'OFF'}`;
            toggle.style.borderColor = this.deepScan ? '#10b981' : '#334';
        };

        let lastHighlight = null;
        const clear = () => { if (lastHighlight) { lastHighlight.style.outline = ''; lastHighlight = null; } };
        const originalCursor = document.documentElement.style.cursor;
        document.documentElement.style.cursor = 'crosshair';

        const onMouseMove = (e) => {
            let el = pierceShadowAtPoint(e.clientX, e.clientY);
            if (this.deepScan) {
                const hits = document.elementsFromPoint(e.clientX, e.clientY);
                el = hits.find(h => parseFloat(window.getComputedStyle(h).opacity) > 0.1 && h.id !== 'vst-picker-shield' && h.tagName !== 'IFRAME') || el;
            }

            clear();
            if (el && el.ownerDocument === document && el.tagName !== 'IFRAME' && el !== document.body) {
                el.style.outline = '2px solid #5b8dee';
                lastHighlight = el;
                const rect = el.getBoundingClientRect();
                const isMosaic = el.tagName.toLowerCase().startsWith('mosaic-');
                badge.style.display = 'block';
                badge.style.left = `${rect.left}px`;
                badge.style.top = `${Math.max(0, rect.top - 22)}px`;
                badge.style.background = isMosaic ? '#10b981' : '#5b8dee';
                badge.textContent = isMosaic ? '📖 BOOK CONTENT' : (window.top === window.self ? 'TOP SHELL' : `FRAME: ${location.hostname}`);
            } else { badge.style.display = 'none'; }
        };

        const onMouseDown = (e) => {
            const el = pierceShadowAtPoint(e.clientX, e.clientY);
            if (el && el.ownerDocument === document && el.tagName !== 'IFRAME' && el !== document.body) {
                e.preventDefault(); e.stopImmediatePropagation();
                let selector = el.tagName.toLowerCase();
                if (el.id) selector += '#' + CSS.escape(el.id);
                else if (el.className && typeof el.className === 'string') selector += '.' + el.className.trim().split(/\s+/).join('.');
                stateManager.setCustomSelector(selector);
                messagingService.safeSend({ type: 'PICKER_COMPLETE', payload: { selector } });
                cleanup();
            }
        };

        const cleanup = () => {
            window.removeEventListener('mousemove', onMouseMove, true);
            window.removeEventListener('mousedown', onMouseDown, true);
            document.documentElement.style.cursor = originalCursor;
            [shield, badge, toggle].forEach(el => el.remove()); clear();
        };

        window.addEventListener('mousemove', onMouseMove, true);
        window.addEventListener('mousedown', onMouseDown, true);
        setTimeout(cleanup, 15000);
        [shield, badge, toggle].forEach(el => (document.documentElement || document.body).appendChild(el));
    }
};
export default elementPicker;