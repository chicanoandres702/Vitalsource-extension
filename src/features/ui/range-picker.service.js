/**
 * Range Picker UI Service
 * Design Intent: Provides a compact UI component for the sidebar to 
 * select page ranges for bulk capture.
 */
import { bulkCaptureService } from '../capture/bulk-capture.service.js';
import { messagingService } from '../../services/messaging.service.js';

export const rangePickerService = {
    _statusEl: null,

    /**
     * Design Intent: Compatibility shim for entry points that call .init() 
     * instead of .render(). Defaults to document.body if no container provided.
     */
    init(container) {
        this.render(container || document.body);
    },

    updateStatus(text, isError = false) {
        if (!this._statusEl) return;
        this._statusEl.textContent = text;
        this._statusEl.style.color = isError ? '#ff4444' : '#8899aa';
    },

    render(container) {
        const wrap = document.createElement('div');
        wrap.className = 'vst-range-picker';

        // Design Intent: Use an arrow function to preserve 'this' context 
        // so updateStatus remains reachable when messages arrive.
        messagingService.setupMessageListener((msg) => {
            if (msg.type === 'BULK_PROGRESS') {
                this.updateStatus(msg.payload.message);
            }
        });

        Object.assign(wrap.style, {
            padding: '12px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            marginTop: '10px'
        });

        wrap.innerHTML = `
            <div style="font-size: 10px; color: #8899aa; margin-bottom: 8px; font-weight: bold; letter-spacing: 0.05em;">BULK PRINT RANGE</div>
            <div style="display: flex; gap: 6px; align-items: center;">
                <input type="text" id="vst-range-input" placeholder="1-10" 
                    style="flex: 1; min-width: 0; background: #1a1a24; border: 1px solid #334; color: white; border-radius: 4px; padding: 4px 8px; font-size: 11px;">
                <button id="vst-bulk-btn" 
                    style="background: #00d4e8; border: none; color: black; font-weight: bold; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 10px;">
                    EXTRACT
                </button>
            </div>
            <div style="margin-top: 8px;">
                <label style="display: flex; align-items: center; gap: 6px; font-size: 10px; color: #8899aa; cursor: pointer;">
                    <input type="checkbox" id="vst-silent-dl" checked style="cursor: pointer;"> Silent Download
                </label>
            </div>
            <div id="vst-bulk-status" style="margin-top: 6px; font-size: 9px; color: #8899aa; font-style: italic; min-height: 12px;"></div>
        `;

        container.appendChild(wrap);

        this._statusEl = wrap.querySelector('#vst-bulk-status');
        const input = wrap.querySelector('#vst-range-input');
        const btn = wrap.querySelector('#vst-bulk-btn');
        const silentCheck = wrap.querySelector('#vst-silent-dl');

        btn.onclick = async () => {
            const range = input.value.trim();
            if (!range) return;

            btn.disabled = true;
            btn.textContent = '...';
            if (silentCheck.checked) await bulkCaptureService.downloadRangeSilently(range);
            else await bulkCaptureService.captureRange(range);
            btn.disabled = false;
            btn.textContent = 'EXTRACT';
        };
    }
};