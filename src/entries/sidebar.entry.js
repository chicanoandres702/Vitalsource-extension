import { chapterTreeService } from '../features/ui/chapter-tree.service.js';
import { manifestRipService } from '../features/ui/manifest-rip.service.js';
import { coordinatorService } from '../features/orchestration/coordinator.service.js';
import stateManager from '../features/state/state.manager.js';
import manifestState from '../features/state/manifest.state.js';

// Suppress uncaught promise rejections
window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault();
});

/* ─── Safe chrome API wrapper ─────────────────────────────────────────── */
function safeChrome(fn) {
    try {
        if (!chrome?.runtime?.id) return;
        fn();
    } catch (e) {
        if (!e.message?.includes('Extension context invalidated')) {
            console.error('[PilotPro] Chrome API error:', e);
        }
    }
}

// Global State
let currentTabId = null;
let pageBuffer = [];
let fingerprints = new Set();
let sensors = new Set();
let engineActive = false;
let flipDelay = 1200;
let globalStyles = '';

import { debounce } from '../services/utils.service.js';

// UI References
const ui = {
    squadron: document.getElementById('squadron'),
    visBadge: document.getElementById('vis-badge'),
    vp: document.getElementById('preview-vp'),
    pageCount: document.getElementById('page-count'),
    metaInfo: document.getElementById('meta-info'),
    statusBadge: document.getElementById('status-badge'),
    noVisual: document.getElementById('no-visual'),
    pageLog: document.getElementById('page-log'),
    pageLogWrap: document.getElementById('page-log-wrap'),
    vesselId: document.getElementById('vessel-id'),
    manifestIndicator: document.getElementById('manifest-indicator'),
    btnRun: document.getElementById('btn-run'),
    btnStop: document.getElementById('btn-stop'),
    btnSnap: document.getElementById('btn-snap'),
    btnPick: document.getElementById('btn-pick'),
    btnClear: document.getElementById('btn-clear'),
    btnRecon: document.getElementById('btn-reconstruct'),
    speedSlider: document.getElementById('speed-slider'),
    speedLabel: document.getElementById('speed-label'),
    chapterPanel: document.getElementById('chapter-nav-panel'),
    chapterWrap: document.getElementById('chapter-list-wrap'),
    chapterList: document.getElementById('chapter-list'),
    chapterSearch: document.getElementById('chapter-search'),
    selectionCount: document.getElementById('selection-count'),
    btnSelAll: document.getElementById('btn-select-all'),
    btnDeselAll: document.getElementById('btn-deselect-all'),
    modeFull: document.getElementById('mode-full'),
    modeChapter: document.getElementById('mode-chapter'),
    modeManual: document.getElementById('mode-manual'),
    modeAutopick: document.getElementById('mode-autopick')
};

function sendCommand(command) {
    if (!currentTabId) return;
    safeChrome(() => chrome.tabs.sendMessage(currentTabId, { type: 'CMD', ...command }, () => {
        if (chrome.runtime.lastError) {
            // Ignore port closed errors
        }
    }));
}

function discoverTargetTab() {
    safeChrome(() => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0 && tabs[0].url && (tabs[0].url.includes('vitalsource.com') || tabs[0].url.includes('capella.edu'))) {
                currentTabId = tabs[0].id;
                safeChrome(() => chrome.tabs.sendMessage(currentTabId, { type: 'CMD', action: 'DISCOVER' }, () => {

                if (chrome.runtime.lastError) {

                    // Ignore

                }

            }));
            }
        });
    });
}
discoverTargetTab();
setInterval(() => { if (!currentTabId) discoverTargetTab(); }, 2000);

const setEngineState = (active) => {
    engineActive = active;
    ui.statusBadge.textContent = active ? 'Autonomous' : 'Standby';
};

import { initializeSidebar } from '../features/ui/sidebar.initializer.js';

initializeSidebar(ui, sendCommand, setEngineState, flipDelay);

// Bind UI
ui.speedSlider.oninput = debounce(() => {
    flipDelay = parseInt(ui.speedSlider.value);
    ui.speedLabel.textContent = flipDelay + 'ms';
    coordinatorService.setDelay(flipDelay);
    sendCommand({ action: 'SET_SPEED', speed: flipDelay });
}, 200);

ui.modeFull.onclick = () => { chapterTreeService.setMode('full'); setActiveMode(ui.modeFull); };
ui.modeChapter.onclick = () => { chapterTreeService.setMode('chapter'); setActiveMode(ui.modeChapter); };
ui.modeManual.onclick = () => { chapterTreeService.setMode('manual'); setActiveMode(ui.modeManual); };
ui.modeAutopick.onclick = () => { sendCommand({ action: 'AUTOPICK' }); };

function setActiveMode(el) {
    [ui.modeFull, ui.modeChapter, ui.modeManual].forEach(m => m.classList.remove('chip-cyan'));
    el.classList.add('chip-cyan');
}

ui.btnRun.onclick = () => {
    if (chapterTreeService.getMode() === 'manual') {
        manifestRipService.stop();
        setEngineState(true);
        sendCommand({ action: 'ENGINE_CONFIG', state: true, speed: flipDelay });
    } else {
        manifestRipService.start();
    }
};

ui.btnStop.onclick = () => {
    manifestRipService.stop();
    setEngineState(false);
    coordinatorService.abort();
    sendCommand({ action: 'ENGINE_CONFIG', state: false, speed: flipDelay });
};

ui.btnPick.onclick = () => sendCommand({ action: 'PICK' });
ui.btnSnap.onclick = () => {
    ui.btnSnap.textContent = 'Snapping...';
    setTimeout(() => ui.btnSnap.textContent = 'SNAP', 800);
    sendCommand({ action: 'SNAP' });
};
ui.btnClear.onclick = () => {
    pageBuffer = [];
    fingerprints.clear();
    globalStyles = '';
    ui.pageCount.textContent = '0 Pages';
    ui.pageLog.innerHTML = '';
    ui.pageLogWrap.classList.add('hidden');
    ui.btnRecon.classList.add('hidden');
    ui.noVisual.classList.remove('hidden');
    ui.vp.srcdoc = '';
};

/* ─── Chapter Mgmt ─── */

safeChrome(() => {
    chrome.runtime.onMessage.addListener((d, sender) => {
        if (sender.tab && sender.tab.id !== currentTabId) return;

        if (d.type === 'ALIVE') {
            sensors.add(d.sensorId);
            ui.squadron.textContent = `${sensors.size} Frame${sensors.size !== 1 ? 's' : ''} Linked`;
            if (d.contextId) {
                ui.vesselId.textContent = d.contextId.toUpperCase();
                ui.metaInfo.textContent = `Uplink Stable`;
            }
            if (engineActive && !manifestRipService.isRipping()) {
                sendCommand({ action: 'ENGINE_CONFIG', state: true, speed: flipDelay });
            }
        } else if (d.type === 'OUTLINE') {
            chapterTreeService.handleOutlineUpdate(d.data);
        } else if (d.type === 'PAGEBREAKS') {
            manifestState.setPagebreaks(d.data);
        } else if (d.type === 'SPINNER_STATUS') {
            coordinatorService.handleSpinnerStatus(d.visible);
        } else if (d.type === 'CONTENT_READY') {
            coordinatorService.handleContentReady();
        } else if (d.type === 'DATA') {
            if (!fingerprints.has(d.meta.fingerprint)) {
                fingerprints.add(d.meta.fingerprint);
                
                const handledByManifest = manifestRipService.handlePageData(d, d.meta.pageText || '---');
                
                if (pageBuffer.length === 0 && d.styles) globalStyles = d.styles;
                pageBuffer.push({ html: d.html, meta: d.meta });
                // Limit buffer to prevent memory issues - keep last 50 pages
                if (pageBuffer.length > 50) {
                    pageBuffer.shift();
                    fingerprints.clear(); // Reset fingerprints when trimming
                }

                ui.noVisual.classList.add('hidden');
                ui.vp.srcdoc = (globalStyles || '') + d.html;
                ui.pageCount.textContent = `${pageBuffer.length} Page${pageBuffer.length !== 1 ? 's' : ''}`;
                ui.metaInfo.innerHTML = `PG: ${d.meta.pageText || '---'} &nbsp;|&nbsp; ${d.meta.chapter || 'Content'}`;

                ui.pageLogWrap.classList.remove('hidden');
                const row = document.createElement('div');
                row.className = 'page-log-item flex justify-between px-3 py-2 hover:bg-white/10 transition-colors';
                row.innerHTML = `<span class="truncate max-w-[60%]">${d.meta.chapter || 'Section'}</span><span class="text-blue-400">${d.meta.pageText || '---'}</span>`;
                ui.pageLog.appendChild(row);
                ui.pageLog.scrollTop = ui.pageLog.scrollHeight;
                ui.btnRecon.classList.remove('hidden');

                if (!handledByManifest) {
                    coordinatorService.handleCaptureData(d);
                    setTimeout(async () => {
                        try {
                            await coordinatorService.triggerTurn();
                        } catch (e) {
                            // Message port may have closed, ignore
                        }
                    }, 100);
                }
            } else {
                if (manifestRipService.isRipping()) {
                    sendCommand({ action: 'PAGE_ACK', url: d.meta.url });
                } else {
                    coordinatorService.triggerTurn();
                }
            }
        }
    });
});

/* ─── Export Logic ─── */
ui.btnRecon.onclick = () => {
    let sourcePages = pageBuffer;
    if (chapterTreeService.getMode() === 'chapter') {
        const selectedTitles = new Set(chapterTreeService.getOutline().filter(ch => chapterTreeService.getSelectedChapters().has(ch.cfi)).map(c => c.title));
        sourcePages = pageBuffer.filter(p => selectedTitles.has(p.meta.chapter));
    }
    safeChrome(() => chrome.storage.local.set({ printDataCache: { validPages: sourcePages, globalStyles, strippedCount: 0 } }, () => {
        if (chrome.runtime.lastError) {
            // Ignore
        }
        safeChrome(() => chrome.tabs.create({ url: chrome.runtime.getURL('print.html') }, () => {
            if (chrome.runtime.lastError) {
                // Ignore
            }
        }));
    }));
};

// TOC sync relay from content.js (restored from old commits)
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TOC_UPDATE' && Array.isArray(message.data)) {
        chapterTreeService.handleOutlineUpdate(message.data);
        console.log('[PilotPro sidebar] TOC synced via relay:', message.data.length);
    }
});