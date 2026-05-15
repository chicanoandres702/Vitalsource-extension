/**
 * UI service for picker and visual confirmations
 */
import { logger } from '../../services/logger.service.js';
import { pierceShadowAtPoint } from '../../services/utils.service.js';
import { stateManager } from '../state/state.manager.js';
import { messagingService } from '../../services/messaging.service.js';

class UiService {
    constructor() { this.deepScan = false; }

    /**
     * Helper to get the target element, potentially looking through transparent overlays.
     * @param {number} x - ClientX coordinate.
     * @param {number} y - ClientY coordinate.
     * @param {boolean} forceDeepScanMode - Whether to force deep scanning regardless of current deepScan state.
     * @returns {Element | null} The most relevant element at the given coordinates.
     */
    _getPickerTarget(x, y, forceDeepScanMode) {
        let el = pierceShadowAtPoint(x, y);
        if (forceDeepScanMode) {
            const hits = document.elementsFromPoint(x, y);
            el = hits.find(h => parseFloat(window.getComputedStyle(h).opacity) > 0.1 && h.id !== 'vst-picker-shield' && h.tagName !== 'IFRAME') || el;
        }
        return el;
    }

    activatePicker() {
        if (document.getElementById('vst-picker-shield')) return;
        
        // Design Intent: Use a pointer-transparent shield and global window 
        // capture listeners to allow events to reach the correct frame.
        const shield = document.createElement('div');
        shield.id = 'vst-picker-shield';
        Object.assign(shield.style, {
            position: 'fixed', inset: '0', zIndex: '2147483647',
            background: 'rgba(91,141,238,0.05)', pointerEvents: 'none'
        });

        // Design Intent: Create a context badge to show which frame is active.
        const badge = document.createElement('div');
        Object.assign(badge.style, {
            position: 'fixed', padding: '2px 8px', background: '#5b8dee',
            color: 'white', fontSize: '10px', fontWeight: 'bold',
            borderRadius: '4px', zIndex: '2147483647', display: 'none',
            pointerEvents: 'none', fontFamily: 'sans-serif'
        });

        // Design Intent: Add a Deep Scan toggle to allow users to bypass 
        // transparent "copy-protection" overlays.
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
            
            // Design Intent: If Deep Scan is on, iterate through elements at the 
            // current point to find the first one that isn't a transparent utility div.
            if (this.deepScan) {
                const hits = document.elementsFromPoint(e.clientX, e.clientY);
                el = hits.find(h => {
                    const s = window.getComputedStyle(h);
                    return s.opacity > 0.1 && h.id !== 'vst-picker-shield' && h.tagName !== 'IFRAME';
                }) || el;
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
                badge.style.background = isMosaic ? '#10b981' : '#5b8dee'; // Green for book, blue for UI
                badge.textContent = isMosaic ? '📖 BOOK CONTENT' : 
                                   (window.top === window.self ? 'TOP SHELL' : `FRAME: ${location.hostname}`);
            } else {
                badge.style.display = 'none';
            }
        };

        const onMouseDown = (e) => {
            const el = pierceShadowAtPoint(e.clientX, e.clientY);
            
            // Design Intent: Yield to sub-frames. If we hit an iframe, do NOT prevent default.
            if (el && el.ownerDocument === document && el.tagName !== 'IFRAME' && el !== document.body) {
                e.preventDefault();
                e.stopImmediatePropagation();
                
                let selector = el.tagName.toLowerCase();
                // Design Intent: If it's a mosaic custom element, the tag name 
                // is usually more stable than dynamic IDs.
                if (selector.startsWith('mosaic-')) { /* Keep as tag-only */ }
                else if (el.id) selector += '#' + CSS.escape(el.id);
                else if (el.className && typeof el.className === 'string') {
                    selector += '.' + el.className.trim().split(/\s+/).join('.');
                }
                stateManager.setCustomSelector(selector);
                
                // Design Intent: Provide immediate feedback in the frame console 
                // and notify the sidebar to update its UI state.
                logger.log('UI', `Target Locked: ${selector}`);
                messagingService.safeSend({ type: 'PICKER_COMPLETE', payload: { selector } });
                cleanup();
            }
        };

        const cleanup = () => {
            window.removeEventListener('mousemove', onMouseMove, true);
            window.removeEventListener('mousedown', onMouseDown, true);
            document.documentElement.style.cursor = originalCursor;
            shield.remove();
            badge.remove();
            toggle.remove();
            clear();
        };

        window.addEventListener('mousemove', onMouseMove, true);
        window.addEventListener('mousedown', onMouseDown, true);
        setTimeout(cleanup, 15000); // 15s Safety Timeout

        const root = document.documentElement || document.body;
        root.appendChild(shield);
        root.appendChild(badge);
        root.appendChild(toggle);
        logger.log('UI', 'Transparent picker active.');
    }

    showVisualConfirmation(label) {
        const toast = document.createElement('div');
        toast.id = 'pilot-confirmation';
        Object.assign(toast.style, {
            position: 'fixed', top: '20px', left: '20px', zIndex: '2147483647',
            background: '#059669', color: '#ffffff', padding: '12px 20px', // High-contrast Emerald 600
            borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.4)',
            fontFamily: 'Inter, sans-serif', fontWeight: 'bold', fontSize: '14px',
            display: 'flex', alignItems: 'center', gap: '10px',
            transition: 'all 0.4s ease', transform: 'translateY(-100px)', opacity: '0'
        });
        toast.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Captured: ${label}
        `;
        document.body.appendChild(toast);
        requestAnimationFrame(() => {
            toast.style.transform = 'translateY(0)';
            toast.style.opacity = '1';
        });
        setTimeout(() => {
            toast.style.transform = 'translateY(-20px)';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 2000);
    }
}

export const uiService = new UiService();