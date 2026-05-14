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

    /**
     * Sends a SNAP message to the content script and awaits its response.
     * @returns {Promise<Object>} The response from the content script, indicating success or failure.
     */
    async triggerSnap() {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]) {
            return chrome.tabs.sendMessage(tabs[0].id, {
                type: 'SNAP',
                metadata: { pageIndex: Date.now() }
            });
        }
        return { success: false, error: 'No active tab found.' };
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

        pages.sort((a, b) => {
            const aOrder = a.metadata?.pageInfo?.order ?? a.index;
            const bOrder = b.metadata?.pageInfo?.order ?? b.index;
            return aOrder - bOrder;
        });

        const firstMeta = pages[0].metadata || {};
        const title = firstMeta.title || 'PilotPro Export';
        const bookOutline = firstMeta.toc?.data || [];
        const pagebreaks = firstMeta.pagebreaks?.data || [];
        const globalStyles = firstMeta.styles || '';
        const bookMetadata = { title };

        const validPages = pages.map((p, i) => {
            const pageInfo = p.metadata?.pageInfo || {};
            const pageLabel = pageInfo.page || pageInfo.title || `Page ${i + 1}`;
            const pageNumber = pageInfo.pageNumber || i + 1;
            return {
                html: `<div class="page-wrapper" data-page="${pageNumber}">${p.html}</div>`,
                meta: {
                    pageLabel,
                    pageNumber,
                    chapter: pageInfo.chapter || pageInfo.title || ''
                }
            };
        });

        chrome.storage.local.set({
            printDataCache: {
                validPages,
                globalStyles,
                bookMetadata,
                bookOutline,
                pagebreaks,
                strippedCount: 0
            }
        }, () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('print.html') });
        });
    },

    toggleAutoRip() {
        if (this.statusDisplay.textContent === 'RUNNING') {
            this.statusDisplay.textContent = 'STANDBY';
            this.statusDisplay.style.color = 'var(--text)';
            this.stopAutoRip();
        } else {
            this.statusDisplay.textContent = 'RUNNING';
            this.statusDisplay.style.color = 'var(--cyan)';
            this.startAutoRip();
        }
    },

    /**
     * Initiates the automatic ripping process.
     * It attempts to snap content, and only if successful, proceeds to turn the page.
     * If a loading state is detected, it will retry snapping the same page on the next interval.
     */
    async startAutoRip() {
        // Ensure only one interval is active
        this.stopAutoRip();

        this.autoRipInterval = setInterval(async () => {
            if (this.statusDisplay.textContent === 'RUNNING') {
                console.log('[PilotPro] AutoRip: Attempting snap...');
                const snapResult = await this.triggerSnap();

                if (!snapResult.success) {
                    console.log(`[PilotPro] AutoRip: Snap failed ('${snapResult.error}'). Retrying on current page.`);
                    return; // Do not turn page, retry on next interval
                }

                // After snap, turn page with longer delay for page load
                setTimeout(() => this.turnPage('right'), 3000);
            }
        }, 8000); // Snap every 8 seconds
    },

    stopAutoRip() {
        if (this.autoRipInterval) {
            clearInterval(this.autoRipInterval);
            this.autoRipInterval = null;
        }
    },

    turnPage(direction) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'TURN_PAGE', direction });
            }
        });
    }
};

document.addEventListener('DOMContentLoaded', () => Sidebar.init());