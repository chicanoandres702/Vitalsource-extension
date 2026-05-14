/**
 * UI service for picker and visual confirmations
 */
import { logger } from '../../services/logger.service.js';
import { pierceShadowAtPoint } from '../../services/utils.service.js';
import { stateManager } from '../state/state.manager.js';

class UiService {
    activatePicker() {
        logger.log('UI', 'Picker activated.');
        const shield = document.createElement('div');
        Object.assign(shield.style, {
            position: 'fixed', inset: '0', zIndex: '2147483647',
            background: 'rgba(91,141,238,0.08)', border: '3px dashed #5b8dee',
            cursor: 'crosshair', pointerEvents: 'auto',
            backdropFilter: 'blur(1px)'
        });

        let lastHighlight = null;
        const clearHighlight = () => { if (lastHighlight) { lastHighlight.style.outline = ''; lastHighlight = null; } };
        shield.addEventListener('mousemove', (e) => {
            shield.style.pointerEvents = 'none';
            const el = pierceShadowAtPoint(e.clientX, e.clientY);
            shield.style.pointerEvents = 'auto';
            clearHighlight();
            if (el && el !== document.body) {
                el.style.outline = '2px solid #5b8dee';
                lastHighlight = el;
            }
        });

        shield.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            clearHighlight();
            shield.style.pointerEvents = 'none';
            const el = pierceShadowAtPoint(e.clientX, e.clientY);
            shield.style.pointerEvents = 'auto';
            if (el) {
                let selector = el.tagName.toLowerCase();
                if (el.id) {
                    selector += '#' + CSS.escape(el.id);
                } else if (typeof el.className === 'string' && el.className.trim()) {
                    selector += el.className.split(' ').filter(c => c.trim()).map(c => '.' + CSS.escape(c)).join('');
                }
                stateManager.setCustomSelector(selector);
                logger.log('UI', `Target locked: ${selector}`);
            }
            setTimeout(() => shield.remove(), 300);
        }, { capture: true, once: true });

        document.body.appendChild(shield);
    }

    showVisualConfirmation(label) {
        const toast = document.createElement('div');
        toast.id = 'pilot-confirmation';
        Object.assign(toast.style, {
            position: 'fixed', top: '20px', left: '20px', zIndex: '2147483647',
            background: '#10b981', color: 'white', padding: '12px 20px',
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