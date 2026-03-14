/*
 * sidebar.js — patched for robustness
 *
 * Changes vs original:
 *  1. safeChrome() helper wraps every chrome.* API call in try/catch so
 *     "Extension context invalidated" errors are swallowed instead of
 *     crashing the sidebar when the extension reloads mid-session.
 *  2. chrome.runtime.onMessage wrapped with context guard.
 *  3. All sendCommand / chrome.storage / chrome.management calls protected.
 */

/* ─── Safe chrome API wrapper ─────────────────────────────────────────── */
function safeChrome(fn) {
    try {
        if (!chrome?.runtime?.id) return; // context already invalidated
        fn();
    } catch (e) {
        if (e.message && e.message.includes('Extension context invalidated')) {
            console.warn('[PilotPro] Extension context invalidated — ignoring stale call.');
        } else {
            console.error('[PilotPro] Chrome API error:', e);
        }
    }
}

let currentTabId = null;
let pageBuffer = [];
let fingerprints = new Set();
let sensors = new Set();
let engineActive = false;
let flipDelay = 1200;
let globalStyles = '';

const squadron     = document.getElementById('squadron');
const visBadge     = document.getElementById('vis-badge');
const vp           = document.getElementById('preview-vp');
const pageCount    = document.getElementById('page-count');
const metaInfo     = document.getElementById('meta-info');
const btnRun       = document.getElementById('btn-run');
const btnSnap      = document.getElementById('btn-snap');
const btnPick      = document.getElementById('btn-pick');
const btnClear     = document.getElementById('btn-clear');
const btnRecon     = document.getElementById('btn-reconstruct');
const statusBadge  = document.getElementById('status-badge');
const noVisual     = document.getElementById('no-visual');
const speedSlider  = document.getElementById('speed-slider');
const speedLabel   = document.getElementById('speed-label');
const pageLog      = document.getElementById('page-log');
const pageLogWrap  = document.getElementById('page-log-wrap');
const vesselIdEl   = document.getElementById('vessel-id');

/* ─── Tab connection ──────────────────────────────────────────────────── */
safeChrome(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) currentTabId = tabs[0].id;
    });
});

safeChrome(() => {
    chrome.tabs.onActivated.addListener((activeInfo) => {
        currentTabId = activeInfo.tabId;
    });
});

function sendCommand(command) {
    if (!currentTabId) return;
    safeChrome(() => {
        chrome.tabs.sendMessage(currentTabId, { type: 'CMD', ...command });
    });
}

/* ─── Speed slider ────────────────────────────────────────────────────── */
speedSlider.oninput = () => {
    flipDelay = parseInt(speedSlider.value);
    speedLabel.textContent = flipDelay + 'ms';
    sendCommand({ action: 'SET_SPEED', speed: flipDelay });
};

/* ─── Engine state ────────────────────────────────────────────────────── */
const setEngineState = (active) => {
    engineActive = active;

    btnRun.innerHTML = active
        ? `<svg class="animate-spin h-4 w-4 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Engine Active — Click to Stop`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Start Autonomous Scrape`;

    // NOTE: className intentionally kept minimal — sidebar-init.js MutationObserver
    // will immediately re-apply the correct inline styles after this assignment.
    btnRun.className = active ? 'animate-pulse' : '';

    statusBadge.textContent = active ? 'Autonomous' : 'Standby';
    // sidebar-init.js MutationObserver handles statusBadge re-styling too.
};

btnRun.onclick = () => {
    setEngineState(!engineActive);
    sendCommand({ action: 'ENGINE_CONFIG', state: engineActive, speed: flipDelay });
};

btnPick.onclick  = () => sendCommand({ action: 'PICK' });

btnSnap.onclick  = () => {
    const origText = btnSnap.textContent;
    btnSnap.textContent = 'Snapping...';
    setTimeout(() => btnSnap.textContent = origText, 800);
    sendCommand({ action: 'SNAP' });
};

btnClear.onclick = () => {
    pageBuffer = [];
    fingerprints.clear();
    globalStyles = '';
    pageCount.textContent  = '0 Pages';
    pageLog.innerHTML      = '';
    pageLogWrap.classList.add('hidden');
    btnRecon.classList.add('hidden');
    noVisual.classList.remove('hidden');
    vp.srcdoc = '';
};

/* ─── Message listener ────────────────────────────────────────────────── */
safeChrome(() => {
    chrome.runtime.onMessage.addListener((message, sender) => {
        // Ignore messages from other tabs
        if (sender.tab && sender.tab.id !== currentTabId) return;

        const d = message;

        if (d.type === 'ALIVE') {
            sensors.add(d.sensorId);
            squadron.textContent = sensors.size + ' Frame' + (sensors.size !== 1 ? 's' : '') + ' Linked';
            if (d.contextId) vesselIdEl.textContent = d.contextId;
            if (engineActive) sendCommand({ action: 'ENGINE_CONFIG', state: engineActive, speed: flipDelay });
        }

        if (d.type === 'DATA') {
            const fp = d.meta.fingerprint;
            if (!fingerprints.has(fp)) {
                fingerprints.add(fp);

                if (pageBuffer.length === 0 && d.styles) globalStyles = d.styles;
                pageBuffer.push({ html: d.html, meta: d.meta });

                noVisual.classList.add('hidden');
                vp.srcdoc = (globalStyles || '') + d.html;

                pageCount.textContent = pageBuffer.length + ' Page' + (pageBuffer.length !== 1 ? 's' : '');
                metaInfo.innerHTML = `PG: ${d.meta.pageText} &nbsp;|&nbsp; ${d.meta.chapter}`;

                pageLogWrap.classList.remove('hidden');
                const row = document.createElement('div');
                row.className = 'page-log-item flex justify-between px-3 py-2 hover:bg-white/5 transition-colors';
                row.innerHTML = `<span class="text-[10px] font-medium mono text-slate-300 truncate max-w-[60%]">${d.meta.chapter}</span><span class="text-[10px] font-bold mono text-blue-400">${d.meta.pageText}</span>`;
                pageLog.appendChild(row);
                pageLog.scrollTop = pageLog.scrollHeight;

                btnRecon.classList.remove('hidden');
                document.body.classList.add('ping');
                setTimeout(() => document.body.classList.remove('ping'), 400);

                sendCommand({ action: 'PAGE_ACK', url: d.meta.url });
            } else {
                console.log('[PilotPro UI] Deflected duplicate page via UI fingerprint layer. Issuing ACK to prevent stall.');
                sendCommand({ action: 'PAGE_ACK', url: d.meta.url });
            }
        }

        if (d.type === 'TAB_HIDDEN') visBadge.textContent = 'TAB HIDDEN — PAUSED';
        if (d.type === 'TAB_VISIBLE') visBadge.textContent = 'TAB ACTIVE';
        if (d.type === 'RELAY_SNAP')  sendCommand({ action: 'SNAP' });
    });
});

/* ─── Assemble / reconstruct ──────────────────────────────────────────── */
btnRecon.onclick = () => {
    const validPages = [];
    let strippedCount = 0;

    pageBuffer.forEach(p => {
        const temp = document.createElement('div');
        temp.innerHTML = p.html;

        ['nav','header','footer','button','script','style','noscript','template',
         '.spinner','[aria-busy="true"]','img[src*="spin"]'].forEach(s => {
            temp.querySelectorAll(s).forEach(n => n.remove());
        });

        const pureText     = (temp.textContent || '').replace(/[^a-zA-Z0-9]/g, '');
        let   hasValidMedia = false;

        temp.querySelectorAll('img, canvas, svg, iframe').forEach(m => {
            if (m.tagName === 'IMG' && !m.src.includes('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')) {
                if (m.width > 20 || m.height > 20 || !m.width) hasValidMedia = true;
            }
            if (m.tagName === 'CANVAS' && m.width > 50 && m.height > 50) hasValidMedia = true;
            if (m.tagName === 'SVG' && m.innerHTML.length > 500)          hasValidMedia = true;
            if (m.tagName === 'IFRAME')                                    hasValidMedia = true;
        });

        if (pureText.length < 25 && !hasValidMedia) {
            strippedCount++;
            console.log('[PilotPro] Pre-Print Filter: erased blank page ->', p.meta.pageText);
        } else {
            validPages.push(p);
        }
    });

    if (validPages.length === 0 && pageBuffer.length > 0) {
        alert('Warning: The aggressive filter purged ALL pages. Check the console.');
        return;
    }

    safeChrome(() => {
        chrome.storage.local.set(
            { printDataCache: { validPages, globalStyles, strippedCount } },
            () => {
                safeChrome(() => {
                    chrome.tabs.create({ url: chrome.runtime.getURL('print.html') });
                });
            }
        );
    });
};

/* ─── Navigation tabs ─────────────────────────────────────────────────── */
const navScraper    = document.getElementById('nav-scraper');
const navExtensions = document.getElementById('nav-extensions');
const viewScraper   = document.getElementById('view-scraper');
const viewExtensions = document.getElementById('view-extensions');
const extList       = document.getElementById('ext-list');

navScraper.onclick = () => {
    viewScraper.classList.remove('hidden');
    viewExtensions.classList.add('hidden');
    navScraper.classList.replace('text-slate-500', 'text-blue-400');
    navExtensions.classList.replace('text-blue-400', 'text-slate-500');
};

navExtensions.onclick = () => {
    viewExtensions.classList.remove('hidden');
    viewScraper.classList.add('hidden');
    navExtensions.classList.replace('text-slate-500', 'text-blue-400');
    navScraper.classList.replace('text-blue-400', 'text-slate-500');
    loadExtensions();
};

/* ─── Extension manager ───────────────────────────────────────────────── */
function loadExtensions() {
    safeChrome(() => {
        if (!chrome.management) {
            extList.innerHTML = '<div class="text-xs text-red-400 p-4 text-center">Management permission required.</div>';
            return;
        }

        chrome.management.getAll((extensions) => {
            extList.innerHTML = '';

            extensions.sort((a, b) => {
                if (a.enabled !== b.enabled) return b.enabled - a.enabled;
                return a.name.localeCompare(b.name);
            });

            const FALLBACK_ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM5NGEzYjgiIHN0cm9rZS13aWR0aD0iMiI+PHBhdGggZD0iTTIxIDE2VjhhMiAyIDAgMCAwLTEtMS43M2wtNy00YTIgMiAwIDAgMC0yIDBsLTcgNEEyIDIgMCAwIDAgMyA4djhhMiAyIDAgMCAwIDEgMS43M2w3IDRhMiAyIDAgMCAwIDIgMGw3LTRBMiAyIDAgMCAwIDIxIDE2eiIvPjxwb2x5bGluZSBwb2ludHM9IjMuMjcgNi45NiAxMiAxMi4wMSAyMC43MyA2Ljk2Ii8+PGxpbmUgeDE9IjEyIiB5MT0iMjIuMDgiIHgyPSIxMiIgeTI9IjEyIi8+PC9zdmc+';

            extensions.forEach(ext => {
                if (ext.type === 'theme') return;

                const isSelf    = ext.id === chrome.runtime.id;
                const iconUrl   = ext.icons?.length ? ext.icons[ext.icons.length - 1].url : FALLBACK_ICON;
                const item      = document.createElement('div');

                item.className = `glass-panel p-3 rounded-xl flex items-center justify-between gap-3 transition-opacity ${!ext.enabled ? 'opacity-50' : ''}`;
                item.innerHTML = `
                    <div class="flex items-center gap-3 overflow-hidden">
                        <img src="${iconUrl}" class="w-8 h-8 rounded-lg bg-white/5 object-contain flex-shrink-0" alt="icon" onerror="this.src='${FALLBACK_ICON}'">
                        <div class="flex flex-col overflow-hidden">
                            <span class="text-[11px] font-bold text-white truncate">${ext.name}</span>
                            <span class="text-[9px] text-slate-400 truncate">${ext.description || 'No description'}</span>
                        </div>
                    </div>
                    <button class="toggle-btn relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${ext.enabled ? 'bg-blue-500' : 'bg-slate-700'} ${isSelf ? 'opacity-50 cursor-not-allowed' : ''}" ${isSelf ? 'disabled' : ''}>
                        <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${ext.enabled ? 'translate-x-4' : 'translate-x-0'}"></span>
                    </button>`;

                if (!isSelf) {
                    item.querySelector('.toggle-btn').onclick = () => {
                        safeChrome(() => {
                            chrome.management.setEnabled(ext.id, !ext.enabled, loadExtensions);
                        });
                    };
                }

                extList.appendChild(item);
            });
        });
    });
}