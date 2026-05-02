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
let bookOutline = [];
let groupedChapters = [];
let expandedChapters = new Set();
let selectedChapters = new Set();
let captureMode = 'full'; 
let ripQueue = [];
let currentRipIndex = -1;
let isRippingManifest = false;

const squadron     = document.getElementById('squadron');
const visBadge     = document.getElementById('vis-badge');
const vp           = document.getElementById('preview-vp');
const pageCount    = document.getElementById('page-count');
const metaInfo     = document.getElementById('meta-info');
const btnRun       = document.getElementById('btn-run');
const btnStop      = document.getElementById('btn-stop');
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
const manifestIndicator = document.getElementById('manifest-indicator');

// Chapter UI
const chapterPanel   = document.getElementById('chapter-nav-panel');
const chapterWrap    = document.getElementById('chapter-list-wrap');
const chapterList    = document.getElementById('chapter-list');
const modeFull       = document.getElementById('mode-full');
const modeChapter    = document.getElementById('mode-chapter');
const modeManual     = document.getElementById('mode-manual');
const btnSelAll      = document.getElementById('btn-select-all');
const btnDeselAll    = document.getElementById('btn-deselect-all');
const chapterSearch  = document.getElementById('chapter-search');
const selectionCount = document.getElementById('selection-count');

let lastSelectedIdx = -1;
let chapterSearchTerm = '';

/* ─── Tab connection & Discovery ─────────────────────────────────────────── */
function discoverTargetTab() {
    safeChrome(() => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0 && tabs[0].url) {
                const url = tabs[0].url;
                if (url.includes('vitalsource.com') || url.includes('capella.edu')) {
                    currentTabId = tabs[0].id;
                    console.log('[PilotPro] Discovered target tab:', currentTabId);
                    broadcastDiscovery();
                }
            }
        });
    });
}

function broadcastDiscovery() {
    if (!currentTabId) return;
    safeChrome(() => {
        // Ping the tab to wake up the content script's pulse if it was stale
        chrome.tabs.sendMessage(currentTabId, { type: 'CMD', action: 'DISCOVER' }, () => {
            if (chrome.runtime.lastError) { /* ignore */ }
        });
    });
}

// Initial discovery and periodic re-calibration
discoverTargetTab();
setInterval(() => { if (!currentTabId) discoverTargetTab(); }, 2000);

safeChrome(() => {
    chrome.tabs.onActivated.addListener((activeInfo) => {
        currentTabId = activeInfo.tabId;
        sensors.clear();
        discoverTargetTab();
    });
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (tabId === currentTabId && changeInfo.status === 'complete') {
            broadcastDiscovery();
        }
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
    statusBadge.textContent = active ? 'Autonomous' : 'Standby';
    // sidebar-init.js MutationObserver handles statusBadge re-styling.
};

btnRun.onclick = () => {
    if (bookOutline.length > 0) {
        startManifestRip();
    } else {
        setEngineState(true);
        sendCommand({ action: 'ENGINE_CONFIG', state: true, speed: flipDelay });
    }
};

btnStop.onclick = () => {
    setEngineState(false);
    isRippingManifest = false;
    sendCommand({ action: 'ENGINE_CONFIG', state: false, speed: flipDelay });
};

function startManifestRip() {
    if (bookOutline.length === 0) return;
    setEngineState(true);
    isRippingManifest = true;
    
    // Support chapter selection or full book
    if (captureMode === 'chapter' && selectedChapters.size > 0) {
        const blocks = [];
        let currentBlock = null;

        for (let i = 0; i < bookOutline.length; i++) {
            const ch = bookOutline[i];
            const isSelected = selectedChapters.has(ch.cfi);

            if (isSelected) {
                if (!currentBlock) {
                    currentBlock = { startItem: ch, stopPage: null };
                }
            } else {
                if (currentBlock) {
                    // This is the first chapter NOT selected after a selection block.
                    // This is our stop boundary.
                    currentBlock.stopPage = ch.page;
                    blocks.push(currentBlock);
                    currentBlock = null;
                }
            }
        }
        if (currentBlock) {
            currentBlock.stopPage = 'EOF'; 
            blocks.push(currentBlock);
        }

        ripQueue = blocks.map(b => ({
            ...b.startItem,
            stopPage: b.stopPage
        }));
        console.log('[PilotPro] Grouped selection into', ripQueue.length, 'rip blocks');
    } else if (captureMode === 'chapter') {
        // Fallback for no selection
        ripQueue = [...bookOutline];
    } else {
        // AUTO RIP now utilizes Exact Pagebreaks Navigation for exact pagination
        if (window.bookPagebreaks && window.bookPagebreaks.length > 0) {
            ripQueue = window.bookPagebreaks.map(p => ({
                cfi: p.cfi,
                url: p.url,
                page: String(p.label || p.page || ''),
                title: 'Page ' + (p.label || p.page || ''),
                stopPage: String(p.label || p.page || '') // Forces exactly 1 snap per jump
            }));
            console.log('[PilotPro] Overriding Auto Rip with Exact Pagebreak Sequence', ripQueue.length);
        } else {
            ripQueue = [...bookOutline];
        }
    }
    
    currentRipIndex = 0;
    
    // Config but we handle stepping manually internally here
    sendCommand({ action: 'ENGINE_CONFIG', state: true, speed: flipDelay, forceManualStep: (captureMode === 'full') });
    
    processRipQueue();
}

function processRipQueue() {
    if (!isRippingManifest || currentRipIndex >= ripQueue.length) {
        if (currentRipIndex >= ripQueue.length) {
            setEngineState(false);
            isRippingManifest = false;
            alert('Manifest Rip Complete!');
        }
        return;
    }

    const item = ripQueue[currentRipIndex];
    console.log('[PilotPro] Ripping manifest item:', item.title, 'page:', item.page, 'StopAt:', item.stopPage);

    // 1. Navigate to the chapter page via the page input
    sendCommand({ 
        action: 'JUMP', 
        cfi: item.cfi, 
        url: item.url, 
        page: item.page, 
        title: item.title 
    });

    // 2. Start engine/sweep with stop boundary
    sendCommand({ 
        action: 'ENGINE_CONFIG', 
        state: true, 
        speed: flipDelay, 
        stopPage: item.stopPage 
    });

    // 3. Initial snap trigger (the rest is driven by autoPilot in content.js)
    setTimeout(() => {
        if (!isRippingManifest) return; 
        sendCommand({ action: 'SNAP' });
    }, flipDelay + 400);
}

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
            
            if (d.contextId) {
                const isNewBook = vesselIdEl.textContent !== d.contextId.toUpperCase();
                vesselIdEl.textContent = d.contextId.toUpperCase();
                metaInfo.textContent = `Uplink Stable - ${new URL(d.url).hostname}`;
                if (isNewBook) checkForOutline(d.contextId);
            }
            
            if (engineActive && !isRippingManifest) {
                sendCommand({ action: 'ENGINE_CONFIG', state: engineActive, speed: flipDelay });
            }
        }

        if (d.type === 'OUTLINE') {
            handleOutlineUpdate(d.data);
        }

        if (d.type === 'DEAD') {
            sensors.delete(d.sensorId);
            squadron.textContent = sensors.size + ' Frame' + (sensors.size !== 1 ? 's' : '') + ' Linked';
        }

        if (d.type === 'DATA') {
            const fp = d.meta.fingerprint;
            if (!fingerprints.has(fp)) {
                fingerprints.add(fp);

                // Use manifest data for titles if available
                if (isRippingManifest && ripQueue[currentRipIndex]) {
                    d.meta.chapter = ripQueue[currentRipIndex].title;
                    d.meta.pageText = ripQueue[currentRipIndex].page || d.meta.pageText;
                } else if (bookOutline.length > 0) {
                    // Try to find current page in manifest
                    const matched = bookOutline.find(item => d.meta.url.includes(item.url) || (d.meta.cfi && item.cfi.includes(d.meta.cfi)));
                    if (matched) {
                        d.meta.chapter = matched.title;
                        d.meta.pageText = matched.page || d.meta.pageText;
                    }
                }

                if (pageBuffer.length === 0 && d.styles) globalStyles = d.styles;
                pageBuffer.push({ html: d.html, meta: d.meta });

                noVisual.classList.add('hidden');
                vp.srcdoc = (globalStyles || '') + d.html;

                const pgLabel = d.meta?.pageText || '---';
                const chLabel = d.meta?.chapter || 'Book Content';

                pageCount.textContent = pageBuffer.length + ' Page' + (pageBuffer.length !== 1 ? 's' : '');
                metaInfo.innerHTML = `PG: ${pgLabel} &nbsp;|&nbsp; ${chLabel}`;

                pageLogWrap.classList.remove('hidden');
                const row = document.createElement('div');
                row.className = 'page-log-item flex justify-between px-3 py-2 hover:bg-white/5 transition-colors';
                row.innerHTML = `<span class="text-[10px] font-medium mono text-slate-300 truncate max-w-[60%]">${chLabel}</span><span class="text-[10px] font-bold mono text-blue-400">${pgLabel}</span>`;
                pageLog.appendChild(row);
                pageLog.scrollTop = pageLog.scrollHeight;

                btnRecon.classList.remove('hidden');
                document.body.classList.add('ping');
                setTimeout(() => document.body.classList.remove('ping'), 400);

                // Advance queue after confirmed capture ONLY if we are NOT in a sweep.
                // In manifest rips, we let content.js turn pages naturally.
                // We only increment currentRipIndex here if the item was a single-page target (no stopPage).
                if (isRippingManifest) {
                    const currentItem = ripQueue[currentRipIndex];
                    if (currentItem) {
                        // Check if we reached the boundary of this rip item
                        let stopStr = String(currentItem.stopPage).trim().toLowerCase();
                        let currStr = pgLabel.toLowerCase();
                        let currClean = currStr.replace(/page/g, '').trim();

                        if (stopStr === currStr || stopStr === currClean || stopStr === 'eof') {
                            while (currentRipIndex < ripQueue.length - 1 && 
                                  String(ripQueue[currentRipIndex + 1].page).toLowerCase().replace(/page/g,'').trim() === currClean) {
                                currentRipIndex++;
                                console.log('[PilotPro] Skipping duplicate pagebreak cluster.');
                            }

                            console.log('[PilotPro] Boundary Reached, moving queue');
                            setTimeout(() => {
                                currentRipIndex++;
                                processRipQueue();
                            }, 300);
                            return; 
                        }
                        
                        // If this was a single page capture (no sweep), move to next
                        if (!currentItem.stopPage) {
                            // Find the next unique page in the queue to avoid stuttering on multiple TOC entries for same page
                            const currentP = currentItem.page;
                            while (currentRipIndex < ripQueue.length - 1 && ripQueue[currentRipIndex + 1].page === currentP) {
                                currentRipIndex++;
                            }
                            currentRipIndex++;
                            processRipQueue();
                        }
                    }
                } else {
                    sendCommand({ action: 'PAGE_ACK', url: d.meta.url });
                }
            } else {
                console.log('[PilotPro UI] Deflected duplicate page via UI fingerprint layer.');
                if (isRippingManifest) {
                    // Duplicate likely means page didn't change — advance and retry
                    console.log('[PilotPro] Duplicate during rip — re-snapping in 1s.');
                    setTimeout(() => sendCommand({ action: 'SNAP' }), 1000);
                } else {
                    sendCommand({ action: 'PAGE_ACK', url: d.meta.url });
                }
            }
        }

        if (d.type === 'CHAPTER_COMPLETE') {
            console.log('[PilotPro] Chapter sweep finished at page:', d.page);
            if (isRippingManifest) {
                currentRipIndex++;
                processRipQueue();
            }
        }

        if (d.type === 'TAB_HIDDEN') visBadge.textContent = 'TAB HIDDEN — PAUSED';
        if (d.type === 'TAB_VISIBLE') visBadge.textContent = 'TAB ACTIVE';
        if (d.type === 'RELAY_SNAP')  sendCommand({ action: 'SNAP' });
    });
});

/* ─── Assemble / reconstruct ──────────────────────────────────────────── */
btnRecon.onclick = () => {
    let sourcePages = pageBuffer;

    // 1. If in chapter mode, filter by selected chapters
    if (captureMode === 'chapter') {
        const selectedTitles = new Set();
        bookOutline.forEach(ch => {
            if (selectedChapters.has(ch.cfi)) selectedTitles.add(ch.title);
        });
        sourcePages = pageBuffer.filter(p => selectedTitles.has(p.meta.chapter));
    }

    if (sourcePages.length === 0) {
        alert('No pages found for the selected mode/chapters.');
        return;
    }

    const validPages = [];
    let strippedCount = 0;
    let currentChapter = null;

    // 2. Sort pages by index if available, otherwise assume buffer order is correct
    // (Vitalsource pages are usually snapped in order)

    sourcePages.forEach(p => {
        const temp = document.createElement('div');
        temp.innerHTML = p.html;

        // Cleanup
        ['nav','header','footer','button','script','style','noscript','template',
         '.spinner','[aria-busy="true"]','img[src*="spin"]'].forEach(s => {
            temp.querySelectorAll(s).forEach(n => n.remove());
        });

        const pureText     = (temp.textContent || '').trim();
        let   hasValidMedia = false;

        temp.querySelectorAll('img, canvas, svg, iframe').forEach(m => {
            if (m.tagName === 'IMG' && !m.src.includes('data:image/gif;base64')) {
                if (m.width > 20 || m.height > 20 || !m.width) hasValidMedia = true;
            }
            if (m.tagName === 'CANVAS' && m.width > 50 && m.height > 50) hasValidMedia = true;
            if (m.tagName === 'SVG' && m.innerHTML.length > 500)          hasValidMedia = true;
            if (m.tagName === 'IFRAME')                                    hasValidMedia = true;
        });

        if (pureText.length < 25 && !hasValidMedia) {
            strippedCount++;
            return;
        }

        // 3. Inject Chapter Heading if changed
        if (p.meta.chapter !== currentChapter) {
            currentChapter = p.meta.chapter;
            const h = document.createElement('h1');
            h.textContent = currentChapter;
            h.style.cssText = 'page-break-before: always; margin-top: 40px; font-size: 24px; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px;';
            validPages.push({ html: h.outerHTML, meta: { type: 'heading', title: currentChapter } });
        }

        validPages.push(p);
    });

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

/* ─── Chapter Management ──────────────────────────────────────────────── */
function checkForOutline(bookId) {
// 1. Check storage first
    chrome.storage.local.get([`outline_${bookId}`, `pagebreaks_${bookId}`], (res) => {
        if (res[`pagebreaks_${bookId}`]) {
            window.bookPagebreaks = res[`pagebreaks_${bookId}`];
            console.log('[PilotPro] Loaded native pagebreaks:', window.bookPagebreaks.length);
        } else {
            window.bookPagebreaks = [];
        }
        if (res[`outline_${bookId}`]) {
            handleOutlineUpdate(res[`outline_${bookId}`]);
        }
    });

    // 2. Fetch fresh from jigsaw if on vitalsource
    if (bookId && bookId.length > 5) {
        const tocUrl = `https://jigsaw.vitalsource.com/books/${bookId}/toc`;
        console.log('[PilotPro] Fetching TOC:', tocUrl);
        fetch(tocUrl)
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data)) {
                    // Filter noise early
                    const noise = ['cover', 'copyright', 'title page', 'dedication', 'front matter', 'table of contents', 'toc', 'about the author'];
                    const filtered = data.filter(item => {
                        const title = (item.title || '').toLowerCase();
                        return !noise.some(n => title.includes(n));
                    });
                    
                    handleOutlineUpdate(filtered);
                    const store = {};
                    store[`outline_${bookId}`] = filtered;
                    chrome.storage.local.set(store);
                }
            }).catch(e => console.warn('[PilotPro] TOC fetch failed:', e));
    }
}

function handleOutlineUpdate(data) {
    if (!data || data.length === 0) return;
    bookOutline = data;
    
    // Build hierarchy from levels
    const root = [];
    const stack = [{ level: 0, children: root }];

    data.forEach(item => {
        const node = { 
            ...item, 
            children: [],
            id: 'node_' + Math.random().toString(36).substr(2, 9)
        };
        
        while (stack.length > 1 && stack[stack.length - 1].level >= item.level) {
            stack.pop();
        }
        
        stack[stack.length - 1].children.push(node);
        stack.push(node);
    });

    groupedChapters = root;
    chapterPanel.style.display = 'block';
    if (manifestIndicator) manifestIndicator.classList.remove('hidden');
    renderChapterList();
}

/* Collect all CFIs in a subtree (self + all descendants) */
function collectCfis(node) {
    const cfis = [node.cfi];
    node.children.forEach(c => cfis.push(...collectCfis(c)));
    return cfis;
}

/* Are all CFIs in subtree selected? */
function subtreeAllSelected(node) {
    return collectCfis(node).every(cfi => selectedChapters.has(cfi));
}

/* Are some (but not all) CFIs in subtree selected? */
function subtreeSomeSelected(node) {
    const cfis = collectCfis(node);
    const count = cfis.filter(cfi => selectedChapters.has(cfi)).length;
    return count > 0 && count < cfis.length;
}

function renderChapterList() {
    chapterList.innerHTML = '';
    
    function renderNode(node, depth) {
        const hasChildren = node.children.length > 0;
        const isExpanded  = expandedChapters.has(node.id);
        const allSel      = subtreeAllSelected(node);
        const someSel     = !allSel && subtreeSomeSelected(node);

        const wrap = document.createElement('div');

        /* ── Row ── */
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;gap:6px;padding:5px 6px 5px ${depth * 14 + 6}px;border-radius:5px;cursor:pointer;transition:background 0.15s;`;
        row.onmouseenter = () => row.style.background = 'rgba(0,212,232,0.07)';
        row.onmouseleave = () => row.style.background = '';

        /* Arrow (expand/collapse) */
        const arrow = document.createElement('span');
        arrow.textContent = hasChildren ? (isExpanded ? '▾' : '▸') : '·';
        arrow.style.cssText = `font-size:10px;width:10px;text-align:center;color:var(--cyan-dim);flex-shrink:0;opacity:${hasChildren ? 1 : 0.3};`;
        if (hasChildren) {
            arrow.style.cursor = 'pointer';
            arrow.title = isExpanded ? 'Collapse' : 'Expand';
            arrow.onclick = (e) => {
                e.stopPropagation();
                if (isExpanded) expandedChapters.delete(node.id);
                else expandedChapters.add(node.id);
                renderChapterList();
            };
        }

        /* Checkbox square */
        const box = document.createElement('div');
        box.style.cssText = `width:13px;height:13px;border-radius:3px;border:1px solid;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:all 0.15s;`;
        if (allSel) {
            box.style.background = 'var(--cyan)';
            box.style.borderColor = 'var(--cyan)';
            box.innerHTML = '<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="4"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        } else if (someSel) {
            box.style.background = 'rgba(0,212,232,0.35)';
            box.style.borderColor = 'var(--cyan)';
            box.innerHTML = '<div style="width:6px;height:2px;background:black;border-radius:1px"></div>';
        } else {
            box.style.background = 'rgba(0,0,0,0.4)';
            box.style.borderColor = '#334';
        }

        /* Label */
        const label = document.createElement('span');
        label.textContent = node.title;
        label.style.cssText = `flex:1;font-size:9.5px;letter-spacing:0.02em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${allSel ? 'var(--cyan-bright)' : 'var(--text-muted, #8899aa)'};font-weight:${allSel ? 700 : 400};`;

        /* Page badge */
        if (node.page) {
            const badge = document.createElement('span');
            badge.textContent = `p${node.page}`;
            badge.style.cssText = 'font-size:7px;color:#445566;flex-shrink:0;';
            row.appendChild(arrow);
            row.appendChild(box);
            row.appendChild(label);
            row.appendChild(badge);
        } else {
            row.appendChild(arrow);
            row.appendChild(box);
            row.appendChild(label);
        }

        /* Clicking anywhere on the row toggles selection (self + all nested children) */
        row.onclick = () => {
            const newState = !subtreeAllSelected(node);
            collectCfis(node).forEach(cfi => {
                if (newState) selectedChapters.add(cfi);
                else selectedChapters.delete(cfi);
            });
            updateSelectionState();
        };

        wrap.appendChild(row);

        /* Children */
        if (isExpanded && hasChildren) {
            const stripe = document.createElement('div');
            stripe.style.cssText = `border-left:1px solid rgba(0,212,232,0.12);margin-left:${depth * 14 + 11}px;`;
            node.children.forEach(child => {
                const childEl = renderNode(child, depth + 1);
                stripe.appendChild(childEl);
            });
            wrap.appendChild(stripe);
        }

        return wrap;
    }

    groupedChapters.forEach(rootNode => {
        const el = renderNode(rootNode, 0);
        if (el) chapterList.appendChild(el);
    });
    
    updateSelectionState(false);
}

function updateSelectionState(refreshList = true) {
    selectionCount.textContent = `${selectedChapters.size} SELECTED`;
    if (refreshList) renderChapterList();
}

chapterSearch.oninput = () => {
    chapterSearchTerm = chapterSearch.value;
    renderChapterList();
};

modeFull.onclick = () => {
    captureMode = 'full';
    setActiveMode(modeFull);
    chapterWrap.classList.add('hidden');
};

modeChapter.onclick = () => {
    captureMode = 'chapter';
    setActiveMode(modeChapter);
    chapterWrap.classList.remove('hidden');
    renderChapterList();
};

modeManual.onclick = () => {
    captureMode = 'manual';
    setActiveMode(modeManual);
    chapterWrap.classList.add('hidden');
};

function setActiveMode(el) {
    [modeFull, modeChapter, modeManual].forEach(m => {
        if (!m) return;
        m.classList.remove('chip-cyan');
        m.style.opacity = '0.4';
    });
    if (el) {
        el.classList.add('chip-cyan');
        el.style.opacity = '1';
    }
}

btnSelAll.onclick = () => {
    groupedChapters.forEach(node => collectCfis(node).forEach(cfi => selectedChapters.add(cfi)));
    updateSelectionState();
};

btnDeselAll.onclick = () => {
    selectedChapters.clear();
    lastSelectedIdx = -1;
    updateSelectionState();
};