/**
 * filepath: sidebar.js
 * PilotPro HUD Controller - Orchestrates UI and Exports
 */
import { PilotStorage } from './src/features/ripping/storage.service.js';

const Sidebar = {
    async init() {
        console.log('[PilotPro] HUD Controller Online');
        this.cacheElements();
        this.bindEvents();
        this.setupListeners();
        await this.refreshUI();
    },

    cacheElements() {
        this.btnRun = document.getElementById('btn-run');
        this.btnSnap = document.getElementById('btn-snap');
        this.btnPick = document.getElementById('btn-pick');
        this.btnExport = document.getElementById('btn-export');
        this.btnClear = document.getElementById('btn-clear');
        
        this.statusDisplay = document.getElementById('status-display');
        this.sensorCount = document.getElementById('sensor-count');
        this.cfiDisplay = document.getElementById('cfi-display');
        
        this.progressText = document.getElementById('progress-text');
        this.progressFill = document.getElementById('progress-fill');
        this.tocList = document.getElementById('toc-list');
    },

    bindEvents() {
        this.btnRun?.addEventListener('click', () => this.toggleAutoRip());
        this.btnSnap?.addEventListener('click', () => this.triggerSnap());
        this.btnPick?.addEventListener('click', () => this.triggerPick());
        this.btnExport?.addEventListener('click', () => this.handleExport());
        this.btnClear?.addEventListener('click', () => this.handleClear());
    },

    setupListeners() {
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.type === 'PILOT_PAGE_CAPTURED') {
                this.refreshUI();
            }
            if (msg.type === 'SENSOR_LOCKED') {
                if (this.sensorCount) this.sensorCount.textContent = '1';
                if (this.statusDisplay) {
                    this.statusDisplay.textContent = 'LOCKED';
                    this.statusDisplay.style.color = 'var(--green)';
                }
            }
        });
    },

    async refreshUI() {
        const count = await PilotStorage.getCount();
        if (this.progressText) this.progressText.textContent = `${count} Pages`;
        
        // Progress HUD update (Simulation of progress)
        const percent = Math.min((count / 300) * 100, 100); 
        if (this.progressFill) this.progressFill.style.width = `${percent}%`;
    },

    triggerPick() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'PICK' });
        });
    },

    triggerSnap() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { 
                    type: 'SNAP', 
                    metadata: { pageIndex: Date.now() } 
                });
            }
        });
    },

    async handleClear() {
        if (confirm('Permanently wipe all captured data?')) {
            await PilotStorage.clear();
            await this.refreshUI();
        }
    },

    async handleExport() {
        const pages = await PilotStorage.getAllPages();
        if (!pages.length) return alert('No pages captured. SNAP some content first.');

        pages.sort((a, b) => a.index - b.index);
        const title = pages[0].metadata?.title || 'PilotPro_Export';

        const contentHtml = pages.map(p => `
            <div class="captured-page" style="page-break-after: always; padding: 20px; border-bottom: 1px solid #ddd; margin-bottom: 2em;">
                ${p.html}
            </div>
        `).join('\n');

        const blob = new Blob([`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>${title}</title>
                <style>
                    body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1a1a1a; line-height: 1.6; }
                    img { max-width: 100%; height: auto; display: block; margin: 1em auto; }
                    h1 { text-align: center; border-bottom: 2px solid #eee; padding-bottom: 0.5em; }
                </style>
            </head>
            <body>
                <h1>${title}</h1>
                ${contentHtml}
            </body>
            </html>
        `], { type: 'text/html' });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/\s+/g, '_')}.html`;
        a.click();
        URL.revokeObjectURL(url);
    },

    toggleAutoRip() {
        if (this.statusDisplay.textContent === 'RUNNING') {
            this.statusDisplay.textContent = 'STANDBY';
            this.statusDisplay.style.color = 'var(--text)';
        } else {
            this.statusDisplay.textContent = 'RUNNING';
            this.statusDisplay.style.color = 'var(--cyan)';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => Sidebar.init());