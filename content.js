const DEBUG = false;
function log(category, message, data = "") {
    if (!DEBUG) return;
    const color = {
        'BRIDGE': '#3b82f6', 'SENSOR': '#8b5cf6', 'NAV': '#f59e0b',
        'DATA': '#10b981', 'UI': '#ec4899', 'ERROR': '#ef4444'
    }[category] || '#4e6580';
    console.log(`%c[PilotPro-${category}] %c${message}`, `color:${color};font-weight:bold;`, "color:inherit;", data);
}

function quickHash(str) {
    let h = 5381;
    const sample = str ? str.substring(0, 2500) : '';
    for (let i = 0; i < sample.length; i++) h = ((h << 5) + h) ^ sample.charCodeAt(i);
    return (h >>> 0).toString(36);
}

function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Global book outline storage
window.__pilotpro_outline = [];
let __current_book_id = null;

window.addEventListener('message', (ev) => {
    if (ev.data && ev.data.type === 'VS_OUTLINE_JSON') {
        window.__pilotpro_outline = ev.data.data;
        __current_book_id = ev.data.bookId || __current_book_id;
        
        if (DEBUG) log('DATA', `Captured TOC for Book: ${__current_book_id}. Items: ${window.__pilotpro_outline.length}`);
        
        // Cache it in storage with book-specific key
        try {
            if (__current_book_id) {
                const saveObj = { bookId: __current_book_id };
                saveObj[`outline_${__current_book_id}`] = window.__pilotpro_outline;
                chrome.storage.local.set(saveObj);
            }
        } catch (e) {}
    }
});

function getContextId() {
    let url = window.location.href;
    let isbnMatch = url.match(/(\d{10,13})/);
    if (!isbnMatch && document.referrer) {
        isbnMatch = document.referrer.match(/(\d{10,13})/);
    }
    if (!isbnMatch) {
        try { isbnMatch = window.top.location.href.match(/(\d{10,13})/); } catch(e) {}
    }
    const epubMatch = url.match(/epub\/(.*?)\//);
    const id = isbnMatch ? isbnMatch[1] : (epubMatch ? epubMatch[1] : 'vessel_global');
    const normalized = id.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalized;
}

const CONTEXT_ID = getContextId();
const IS_TOP = window.top === window.self;
const SENSOR_ID = 'vst-' + Math.random().toString(36).substring(2, 7);

function safeSend(msg) {
    try {
        if (!chrome?.runtime?.id) return;
        chrome.runtime.sendMessage(msg, () => {
            if (chrome.runtime.lastError) { /* ignore */ }
        });
    } catch (e) { /* ignore context invalidated */ }
}

function findDeep(selector, root = document) {
    if (!selector) return null;
    try { const el = root.querySelector(selector); if (el) return el; } catch (e) {}
    for (const node of root.querySelectorAll('*')) {
        if (node.shadowRoot) {
            const found = findDeep(selector, node.shadowRoot);
            if (found) return found;
        }
    }
    return null;
}

let _sliderCache = null, _sliderCacheTs = 0;
function getSlider() {
    if (_sliderCache && Date.now() - _sliderCacheTs < 3000) return _sliderCache;
    _sliderCache = findDeep('[role="slider"][aria-label="Book Progression"]');
    _sliderCacheTs = Date.now();
    return _sliderCache;
}
function invalidateSliderCache() { _sliderCache = null; }

function pierceShadowAtPoint(x, y) {
    let el = document.elementFromPoint(x, y);
    while (el && el.shadowRoot) {
        const inner = el.shadowRoot.elementFromPoint(x, y);
        if (!inner || inner === el) break;
        el = inner;
    }
    return el;
}

function containsValidMedia(el) {
    if (!el) return false;
    const canvases = el.tagName === 'CANVAS' ? [el] : Array.from(el.querySelectorAll('canvas'));
    for (let i = 0; i < canvases.length; i++) {
        if (canvases[i].width > 150 && canvases[i].height > 150) {
            try { 
                const dataURL = canvases[i].toDataURL();
                if (dataURL.length > 3500) return true; 
            } catch(e) { return true; } 
        }
    }
    const imgs = el.tagName === 'IMG' ? [el] : Array.from(el.querySelectorAll('img'));
    for (let i = 0; i < imgs.length; i++) {
        const src = imgs[i].src || '';
        const cls = (imgs[i].className || '').toLowerCase();
        if (!src.includes('spin') && !cls.includes('spin') && !src.includes('loader') && !src.includes('skeleton')) {
            if (imgs[i].naturalWidth > 100 || imgs[i].width > 100 || (src.startsWith('data:image') && src.length > 5000)) {
                return true;
            }
        }
    }
    const svgs = el.tagName === 'SVG' ? [el] : Array.from(el.querySelectorAll('svg'));
    for (let i = 0; i < svgs.length; i++) {
        if (svgs[i].innerHTML.length > 2000 && !svgs[i].classList.contains('spinner')) return true;
    }
    return false;
}

function getPureContentText(el) {
    if (!el) return '';
    const clone = el.cloneNode(true);
    const uiSelectors = [
        'nav', 'header', 'footer', 'button', 
        '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', 
        '.vst-icon', '.toolbar', '.app-header', '.menu', '.controls',
        '#pilot-root', 'script', 'style', 'noscript', 'template'
    ];
    uiSelectors.forEach(sel => {
        clone.querySelectorAll(sel).forEach(node => node.remove());
    });
    return (clone.innerText || clone.textContent || '').replace(/[^a-zA-Z0-9]/g, '');
}

function isContentValid(el) {
    if (!el) return false;
    const slider = getSlider();
    if (slider) {
        const val = (slider.getAttribute('aria-valuetext') || '').toLowerCase();
        if (val.includes('sync') || val.includes('load')) {
            return false;
        }
    }
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (style.opacity !== '' && parseFloat(style.opacity) < 0.5) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return false;
    const lowerText = (el.innerText || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (lowerText.includes('loading') || lowerText.includes('pleasewait') || lowerText.includes('spinner') || lowerText.includes('syncing')) {
        return false;
    }
    const pureText = getPureContentText(el);
    if (pureText.length >= 100) return true; 
    if (containsValidMedia(el)) return true;
    const iframes = el.tagName === 'IFRAME' ? [el] : Array.from(el.querySelectorAll('iframe'));
    for (let i = 0; i < iframes.length; i++) {
        if (iframes[i].src && iframes[i].src !== 'about:blank' && !iframes[i].src.includes('empty')) {
            try {
                const doc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                if (doc && doc.body) {
                    const iframePureText = getPureContentText(doc.body);
                    if (iframePureText.length >= 100 || containsValidMedia(doc.body)) return true;
                }
            } catch(e) {
                if (iframes[i].offsetWidth > 50 && iframes[i].offsetHeight > 50) return true; 
            }
        }
    }
    return false;
}

function getFingerprintSource(el) {
    if (!el) return '';
    let text = getPureContentText(el);
    const iframes = el.querySelectorAll('iframe');
    for (let i = 0; i < iframes.length; i++) {
        try {
            const doc = iframes[i].contentDocument || iframes[i].contentWindow.document;
            if (doc && doc.body) text += getPureContentText(doc.body);
        } catch(e) {}
    }
    const media = Array.from(el.querySelectorAll('img, canvas, iframe, video, svg'))
        .map(m => {
            if (m.tagName === 'CANVAS') {
                try {
                    const d = m.toDataURL();
                    return `CANVAS_${m.width}x${m.height}_${d.substring(d.length/2, d.length/2 + 50)}`;
                } catch(e) {
                    return `CANVAS_${m.width}x${m.height}`;
                }
            }
            if (m.tagName === 'SVG') return `SVG_${m.innerHTML.length}`;
            if (m.tagName === 'IMG') {
                if (m.width < 10 || m.height < 10 || m.src.includes('spin')) return ''; 
                return m.src.length > 500 ? `IMG_B64_${m.src.length}` : (m.src || m.tagName);
            }
            return m.src || m.tagName;
        }).join('|');
    return text + '|' + media;
}

const CONTENT_SELECTORS = [
    '#epub-content-container', 'section.chapter-rw', '.mosaic-page', '.epub-container'
];

function autoDetectContent(force = false) {
    for (const sel of CONTENT_SELECTORS) {
        const el = findDeep(sel);
        if (el && isContentValid(el)) return el;
    }
    const bigElements = Array.from(document.querySelectorAll('iframe, canvas, div')).filter(el => {
        if (el.tagName === 'DIV' && !el.className.includes('page') && el.getAttribute('role') !== 'main') return false;
        const r = el.getBoundingClientRect();
        return r.width > 300 && r.height > 300;
    });
    for (const el of bigElements) {
        if (isContentValid(el)) return el;
    }
    if (force) log('DATA', 'Force mode: extended search exhausted. Returning null — will retry.');
    return null;
}

function getAbsoluteStyles() {
    let out = '';
    document.querySelectorAll('link[rel="stylesheet"], style').forEach(el => {
        if (el.tagName === 'STYLE') {
            out += el.outerHTML;
        } else if (el.href) {
            try { out += `<link rel="stylesheet" href="${new URL(el.href, location.href).href}">`; } catch (e) {}
        }
    });
    return out;
}

function cleanAndResolveHTML(node) {
    const wrapper = document.createElement('div');
    wrapper.appendChild(node.cloneNode(true));
    wrapper.querySelectorAll('#pilot-root').forEach(el => el.remove());
    const resolve = url => {
        if (!url || url.startsWith('data:') || url.startsWith('http')) return url;
        try { return new URL(url, location.href).href; } catch (e) { return url; }
    };
    wrapper.querySelectorAll('img, source, image').forEach(el => {
        const src = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('xlink:href');
        if (src) el.setAttribute('src', resolve(src));
    });
    const originalIframes = node.tagName === 'IFRAME' ? [node] : Array.from(node.querySelectorAll('iframe'));
    const clonedIframes = wrapper.tagName === 'IFRAME' ? [wrapper] : Array.from(wrapper.querySelectorAll('iframe'));
    for (let i = 0; i < originalIframes.length; i++) {
        try {
            const doc = originalIframes[i].contentDocument || originalIframes[i].contentWindow.document;
            if (doc && doc.body) {
                const iframeBase = doc.location.href;
                const div = document.createElement('div');
                div.innerHTML = doc.body.innerHTML;
                div.querySelectorAll('img, source, image').forEach(el => {
                    const src = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('xlink:href');
                    if (src) {
                        try { el.setAttribute('src', new URL(src, iframeBase).href); } catch(e){}
                    }
                });
                clonedIframes[i].replaceWith(div);
            }
        } catch (e) {
            log('DATA', 'Iframe extraction blocked by CORS. Leaving native frame.');
        }
    }
    const originalCanvases = node.tagName === 'CANVAS' ? [node] : Array.from(node.querySelectorAll('canvas'));
    const clonedCanvases = wrapper.tagName === 'CANVAS' ? [wrapper] : Array.from(wrapper.querySelectorAll('canvas'));
    for (let i = 0; i < originalCanvases.length; i++) {
        if (originalCanvases[i].width < 50 || originalCanvases[i].height < 50) {
            clonedCanvases[i].remove();
            continue;
        }
        try {
            const dataUrl = originalCanvases[i].toDataURL('image/png');
            if (dataUrl.length < 3500) {
                clonedCanvases[i].remove(); 
                continue; 
            }
            const img = document.createElement('img');
            img.src = dataUrl;
            img.className = clonedCanvases[i].className;
            img.style.cssText = clonedCanvases[i].style.cssText;
            clonedCanvases[i].replaceWith(img);
        } catch (e) {
            log('ERROR', 'Canvas CORS taint - cannot export to image.', e);
        }
    }
    ['__hrp__', '.vstskip', '.vst-ignore', 'script', 'button', 'template', '.sc-czWrlN', '.Tooltip__tooltip'].forEach(sel => {
        wrapper.querySelectorAll(sel).forEach(el => el.remove());
    });
    wrapper.querySelectorAll('*').forEach(el => {
        Array.from(el.attributes).forEach(attr => {
            if (/^(rtrvr-|mosaic-|data-)/.test(attr.name)) el.removeAttribute(attr.name);
        });
    });
    return wrapper.innerHTML || '';
}

let capturedPageCount = 0;
let isScraping = false;
let autoPilot = false;
let customSelector = null;
let lastContentFP = '';   
let lastFlipTime = 0;
let isSnapping = false;
let flipDelay = 1200; 
let pageChangeObserver = null;
let autoSnapFired = false;
let isTransitioning = false;
let _lastStabilizeFP = '';
let _stabilizeReady = false;
let hasSnappedCurrentPage = false; 
let autoPilotStopPage = null; // New boundary tracking

const NEXT_SELECTORS = [
    'button[aria-label="Next"]',
    '[aria-label="Next page"]',
    '[aria-label*="Next"]',
    '[aria-label*="forward" i]',
    '.IconButton__button-bQttMI[aria-label="Next"]',
    '.next-button',
    '.vst-icon-next',
    '[data-testid="next-page"]'
].join(', ');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CMD') {
        const newVal = message;
        log('BRIDGE', `Command: ${newVal.action}`);
        
        switch (newVal.action) {
            case 'ENGINE_CONFIG':
                isScraping = newVal.state;
                autoPilot  = newVal.state;
                flipDelay  = newVal.speed || flipDelay;
                autoPilotStopPage = newVal.stopPage || null;
                if (isScraping) scheduleSnap(500);
                break;
            case 'SET_SPEED':
                flipDelay = newVal.speed || flipDelay;
                break;
            case 'PICK':
                activatePicker();
                break;
            case 'SNAP':
                snapWithRetry(0, true);
                break;
            case 'DISCOVER':
                sendPulse();
                break;
            case 'JUMP':
                navigateToPage(newVal);
                break;
            case 'PAGE_ACK':
                if (autoPilot && isScraping && IS_TOP) {
                    setTimeout(triggerNext, flipDelay);
                }
                break;
        }
    }
});

/* ─── Page-input navigation ────────────────────────────────────────────── */
// The VitalSource page input: <input id="text-field-XwRZxEghbSp" class="InputControl__input...">
function findPageInput() {
    // Search for it including inside shadow DOMs
    return findDeep('input.InputControl__input') ||
           findDeep('input[id^="text-field-"]')   ||
           document.querySelector('input.InputControl__input') ||
           document.querySelector('input[id^="text-field-"]');
}

// Simulate the full React synthetic + native event chain on an input
function setInputValue(input, value) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputValueSetter.call(input, value);
    input.dispatchEvent(new Event('input',  { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

function navigateToPage(cmd) {
    // cmd has: { page, cfi, url, title }
    const pageNum = cmd.page ? String(cmd.page).trim() : null;
    const currentPos = getCurrentPageValue();

    // Guard: Don't re-jump if we are already where we need to be.
    // This prevents the "reset to chapter start" stutter.
    if (pageNum && currentPos && String(pageNum) === String(currentPos)) {
        log('NAV', 'Already at target page: ' + pageNum + '. Skipping JUMP.');
        // If we were supposed to snap, fire it anyway
        if (isScraping) scheduleSnap(200);
        return;
    }

    if (pageNum) {
        const input = findPageInput();
        if (input) {
            log('NAV', `Navigating via page input to: ${pageNum}`);
            input.focus();
            setInputValue(input, pageNum);

            // Fire the full keyboard Enter chain that React/VS listeners expect
            const enterOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
            input.dispatchEvent(new KeyboardEvent('keydown',  enterOpts));
            input.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
            input.dispatchEvent(new KeyboardEvent('keyup',    enterOpts));

            // Also submit the parent form if present
            const form = input.closest('form');
            if (form) form.dispatchEvent(new Event('submit', { bubbles: true }));

            // Delayed repeat in case React processes asynchronously
            setTimeout(() => {
                input.dispatchEvent(new KeyboardEvent('keydown',  enterOpts));
                input.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
                input.dispatchEvent(new KeyboardEvent('keyup',    enterOpts));
            }, 50);

            return;
        }
    }

    // Fallback: CFI hash navigation
    if (cmd.cfi) {
        log('NAV', `Fallback CFI nav: ${cmd.cfi}`);
        window.location.hash = cmd.cfi;
    } else if (cmd.url) {
        const clean = cmd.url.split('#')[0];
        if (window.location.pathname.includes(clean)) {
            const h = cmd.url.split('#')[1];
            if (h) window.location.hash = h;
        } else {
            window.location.href = cmd.url;
        }
    }
}

function triggerNext() {
    const now = Date.now();
    if (now - lastFlipTime < flipDelay * 0.8) return; 
    lastFlipTime = now;
    
    // Check if we hit the limit for chapter ripping
    const currentPage = getCurrentPageValue();
    if (autoPilot && autoPilotStopPage && currentPage === autoPilotStopPage) {
        log('AUTO', 'Reached stop boundary: ' + currentPage + '. Ending chapter sweep.');
        autoPilot = false;
        isScraping = false;
        safeSend({ type: 'CHAPTER_COMPLETE', page: currentPage });
        return;
    }

    hasSnappedCurrentPage = false; 
    invalidateSliderCache(); 

    isTransitioning = true;
    setTimeout(() => { isTransitioning = false; }, Math.min(1500, flipDelay * 0.85));

    const nextBtn = findDeep(NEXT_SELECTORS);
    
    // Prioritize Keyboard ArrowRight as requested, then fallback to click
    const keyOptions = { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, which: 39, bubbles: true, cancelable: true };
    const targets = [document, window, document.body];
    try { if (window.top !== window.self) targets.push(window.top.document, window.top); } catch(e) {}
    
    log('NAV', 'Simulating ArrowRight trigger...');
    targets.forEach(t => {
        try {
            if (t.focus) t.focus();
            t.dispatchEvent(new KeyboardEvent('keydown', keyOptions));
            t.dispatchEvent(new KeyboardEvent('keyup',   keyOptions));
        } catch(err) {}
    });

    // Fallback to physical click if keyboard didn't seem to work (or as a double-tap)
    if (nextBtn && !nextBtn.disabled) {
        log('NAV', 'Sending fallback Click to Next button.');
        nextBtn.click();
    }
    
    // Explicitly schedule the next snap to ensure the loop continues even if mutations are missed
    const lastP = getCurrentPageValue();
    setTimeout(() => {
        if (autoPilot && isScraping) {
            const currentP = getCurrentPageValue();
            if (currentP === lastP && lastP !== null) {
                log('NAV', 'No page movement detected (stuck at ' + currentP + '). Stopping sweep.');
                autoPilot = false;
                isScraping = false;
                safeSend({ type: 'CHAPTER_COMPLETE', page: currentP, status: 'EOF' });
                return;
            }
            log('NAV', 'Explicitly triggering next snap cycle.');
            safeSend({ type: 'RELAY_SNAP' });
        }
    }, flipDelay + 500);
}

// Removed goToFirstPage - navigation is now manifest-driven.

const MAX_RETRIES = 15; 
let spinnerWaitAttempts = 0;

function snapWithRetry(attempt = 0, force = false) {
    // 0. Boundary Check: Ensure we don't snap "one more" than requested
    if (autoPilot && autoPilotStopPage) {
        const cur = getCurrentPageValue();
        if (cur === autoPilotStopPage) {
            log('AUTO', 'Boundary reached at snap time: ' + cur + '. Skipping snap and finishing chapter.');
            autoPilot = false;
            isScraping = false;
            safeSend({ type: 'CHAPTER_COMPLETE', page: cur });
            return;
        }
    }

    if (IS_TOP) {
        // If there's a large iframe, assume the iframe will handle the snapping.
        const hasLargeIframe = Array.from(document.querySelectorAll('iframe')).some(f => {
            const r = f.getBoundingClientRect();
            return r.width > 300 && r.height > 300 && !f.src.includes('about:blank');
        });
        if (hasLargeIframe) {
            log('SENSOR', 'Top frame deferring snap to child iframe.');
            return;
        }
    }

    if (isSnapping) {
        if (force && attempt < MAX_RETRIES) {
            setTimeout(() => snapWithRetry(attempt + 1, force), 300);
        }
        return;
    }

    if (isTransitioning && !force) {
        log('SENSOR', 'Page is currently turning (Blind Spot active). Deferring capture.');
        setTimeout(() => snapWithRetry(attempt, force), 300);
        return;
    }
    
    if (!force) {
        // ENHANCED SPINNER CHECK
        const spinners = document.querySelectorAll([
            '[aria-busy="true"]', '.vst-spinner', '.pbk-page-loading', 
            '.loading', '.spinner', '[data-testid*="loading"]', 
            'img[src*="spin"]', '.skeleton', '.shimmer', 
            '[role="progressbar"]', '.loader'
        ].join(', '));
        
        let isSpinning = false;
        for (let i = 0; i < spinners.length; i++) {
            const style = window.getComputedStyle(spinners[i]);
            if (spinners[i].offsetWidth > 0 && spinners[i].offsetHeight > 0 && style.visibility !== 'hidden' && style.display !== 'none') { 
                isSpinning = true; 
                break; 
            }
        }
        
        if (isSpinning && spinnerWaitAttempts < 15) { 
            spinnerWaitAttempts++;
            log('SENSOR', `Spinner active. Deferring snap to prevent blank page... (${spinnerWaitAttempts}/15)`);
            setTimeout(() => snapWithRetry(attempt, force), 400);
            return; 
        }
    }
    spinnerWaitAttempts = 0; 
    
    let target = customSelector ? findDeep(customSelector) : autoDetectContent(force);
    
    if (customSelector && !force && !isContentValid(target)) {
        target = null;
    }

    // ENHANCED ASSET LOADING CHECK
    if (target && !force) {
        let assetsPending = false;
        const imgs = target.querySelectorAll('img');
        for (let i = 0; i < imgs.length; i++) {
            if (!imgs[i].complete && imgs[i].src && !imgs[i].src.includes('data:image')) {
                assetsPending = true;
                break;
            }
        }
        
        if (assetsPending) {
            log('SENSOR', 'Images are still loading. Deferring capture.');
            setTimeout(() => snapWithRetry(attempt, force), 300);
            return;
        }
    }

    if (target && !force) {
        const currentFP = quickHash(getFingerprintSource(target));
        
        if (currentFP !== _lastStabilizeFP) {
            _lastStabilizeFP = currentFP;
            _stabilizeReady = false;
            log('SENSOR', 'DOM is mutating. Enforcing Cryptographic Stabilization Lock (wait 250ms)...');
            setTimeout(() => snapWithRetry(attempt, force), 250);
            return;
        } else if (!_stabilizeReady) {
            _stabilizeReady = true;
            log('SENSOR', 'DOM Signature matched. Verifying stability for final 150ms...');
            setTimeout(() => snapWithRetry(attempt, force), 150);
            return;
        }
    }

    let finalHtml = '';
    if (target && !force) {
        finalHtml = cleanAndResolveHTML(target);
        const temp = document.createElement('div');
        temp.innerHTML = finalHtml;
        
        const pureText = getPureContentText(temp);
        const lowerText = temp.textContent ? temp.textContent.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
        const hasValidMedia = containsValidMedia(target); 
        
        // ENHANCED CONTENT VALIDITY CHECK
        if ((pureText.length < 150 && !hasValidMedia) || lowerText.includes('loading') || lowerText.includes('pleasewait') || lowerText.includes('syncing')) {
            log('SENSOR', `Ghost Wrapper detected: Insufficient content (Text: ${pureText.length}, Media: ${hasValidMedia}). Rejecting.`);
            target = null;
        }
    } else if (target) {
        finalHtml = cleanAndResolveHTML(target);
        const temp = document.createElement('div');
        temp.innerHTML = finalHtml;
        const pureText = getPureContentText(temp);
        const lowerText = (temp.textContent || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if ((pureText.length < 150 && !containsValidMedia(target)) || lowerText.includes('loading') || lowerText.includes('syncing')) {
            log('SENSOR', 'Force snap rejected — content still blank/transitional. Retrying...');
            target = null;
        }
    }

    if (!target) {
        _lastStabilizeFP = '';
        _stabilizeReady = false;

        if (attempt < MAX_RETRIES) {
            const delay = 400 * (attempt + 1);
            log('SENSOR', `Content not ready, retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
            setTimeout(() => snapWithRetry(attempt + 1, force), delay);
        } else {
            log('ERROR', 'Snap exhausted retries — no valid content rendered. Forcing flip to prevent stall.');
            if (autoPilot) setTimeout(triggerNext, 1000);
        }
        return;
    }
    
    _lastStabilizeFP = '';
    _stabilizeReady = false;

    snap(target, finalHtml, force);
}

function scheduleSnap(delay = 800) { 
    setTimeout(() => snapWithRetry(), delay);
}

const snap = (target, finalHtml, force = false) => {
    if (autoPilot && hasSnappedCurrentPage && !force) {
        log('DATA', 'Flip Lock Active: Already snapped this page cycle. Ignoring late DOM mutation.');
        return;
    }

    if (isSnapping) return;
    isSnapping = true;
    log('DATA', `Capturing... (force=${force})`);
    
    try {
        if (!target) { log('ERROR', 'snap() called with null target.'); return; }
        
        let pageId, pageText;
        try {
            const slider = IS_TOP ? getSlider() : null; 
            
            if (slider && slider.getAttribute) {
                pageId   = slider.getAttribute('aria-valuenow');
                pageText = slider.getAttribute('aria-valuetext');
            } else {
                // FALLBACK: Search for elements that might contain a page number
                const pgEl = findDeep('.page-number, .vst-page-count, [data-page], .pbk-page-number');
                pageId   = pgEl ? (pgEl.getAttribute('data-page') || pgEl.innerText.trim()) : location.href;
                pageText = pgEl ? pgEl.innerText.trim() : (document.title || 'Page');
            }
        } catch(e) {
            pageId   = location.href;
            pageText = document.title || 'Page';
        }
        
        // Final safety check to avoid "undefined" strings in UI
        if (!pageId) pageId = 'unknown-pg';
        if (!pageText || pageText === 'undefined') pageText = 'Current Page';
        
        if (!pageText || pageText.toLowerCase().includes('sync') || pageText.toLowerCase().includes('load')) {
            log('SENSOR', 'Slider still syncing — deferring snap 500ms.');
            isSnapping = false;
            setTimeout(() => snapWithRetry(0, force), 500);
            return;
        }

        const chEl = findDeep('.chapter-title, h1, h2, h3, .vst-chapter, .pc img, .title-block');
        let chapter = chEl ? (chEl.tagName === 'IMG' ? chEl.alt : chEl.innerText.trim()) : 'Book Content';
        
        // Final safety check for chapter string
        if (!chapter || chapter === 'undefined') chapter = 'Active Chapter';

        const sourceText = getFingerprintSource(target);
        const signature  = quickHash(sourceText) + (force ? '-forced-' + Date.now() : '');

        if (!force && signature === lastContentFP) {
            log('DATA', 'Duplicate fingerprint — skipping (use Force Snap to override).');
            return;
        }

        lastContentFP = signature;
        hasSnappedCurrentPage = true; 
        log('DATA', `Page: ${pageText} | Ch: ${chapter} | FP: ${signature}`);

        const styles = capturedPageCount === 0 ? getAbsoluteStyles() : '';
        capturedPageCount++;

        safeSend({
            type: 'DATA',
            html: finalHtml,
            styles,
            meta: { pageId, pageText, chapter, fingerprint: signature, url: location.href, timestamp: Date.now() }
        });
    } catch (err) {
        log('ERROR', 'snap() threw:', err);
    } finally {
        isSnapping = false;
    }
};

let _autoSnapObserver = null;
let _autoSnapInterval = null;

function armAutoSnap() {
    autoSnapFired = false;

    if (_autoSnapObserver) { _autoSnapObserver.disconnect(); _autoSnapObserver = null; }
    if (_autoSnapInterval) { clearInterval(_autoSnapInterval); _autoSnapInterval = null; }

    if (!isScraping) {
        log('SENSOR', 'Engine not active — auto-snap suppressed. Arming page-change observer only.');
        armPageChangeObserver();
        return;
    }

    const existing = customSelector ? findDeep(customSelector) : autoDetectContent();
    if (isContentValid(existing)) {
        autoSnapFired = true;
        log('SENSOR', 'Content already present — firing snap immediately.');
        scheduleSnap(300);
        armPageChangeObserver();
        return;
    }

    try {
        _autoSnapObserver = new MutationObserver(debounce(() => {
            if (autoSnapFired) { _autoSnapObserver && _autoSnapObserver.disconnect(); return; }
            const found = customSelector ? findDeep(customSelector) : autoDetectContent();
            if (isContentValid(found)) {
                autoSnapFired = true;
                _autoSnapObserver && _autoSnapObserver.disconnect();
                if (_autoSnapInterval) { clearInterval(_autoSnapInterval); _autoSnapInterval = null; }
                log('SENSOR', 'Observer: content appeared — firing snap.');
                scheduleSnap(300);
                armPageChangeObserver();
            }
        }, 150));
        const root = document.body || document.documentElement;
        _autoSnapObserver.observe(root, { childList: true, subtree: true });
    } catch (e) {
        log('ERROR', 'MutationObserver failed to arm:', e);
    }

    _autoSnapInterval = setInterval(() => {
        if (autoSnapFired) { clearInterval(_autoSnapInterval); _autoSnapInterval = null; return; }
        const found = customSelector ? findDeep(customSelector) : autoDetectContent();
        if (isContentValid(found)) {
            autoSnapFired = true;
            clearInterval(_autoSnapInterval); _autoSnapInterval = null;
            _autoSnapObserver && _autoSnapObserver.disconnect();
            log('SENSOR', 'Interval fallback: content found in shadow DOM — firing snap.');
            scheduleSnap(300);
            armPageChangeObserver();
        }
    }, 1000);

    log('SENSOR', 'Auto-snap armed (observer + interval fallback).');
}

function armPageChangeObserver() {
    if (pageChangeObserver) pageChangeObserver.disconnect();

    const checkForChange = debounce(() => {
        if (document.hidden || isTransitioning) return; 

        const content = customSelector ? findDeep(customSelector) : autoDetectContent();
        if (!content) return;

        const currentFP = quickHash(getFingerprintSource(content));

        if (currentFP !== lastContentFP) {
            log('SENSOR', `Change detected (FP: ${currentFP}). Queuing snap.`);
            scheduleSnap(500); 
        }
    }, 1200); 

    pageChangeObserver = new MutationObserver(checkForChange);
    pageChangeObserver.observe(document.body || document.documentElement, {
        childList: true, subtree: true, characterData: false 
    });
    log('SENSOR', 'Page-change observer armed.');
}

function onSpaNavigation() {
    log('NAV', 'SPA navigation detected — re-arming sensors.');
    hasSnappedCurrentPage = false; 
    invalidateSliderCache();
    armAutoSnap();
}

// Removed inline script injection due to CSP restrictions.
// Relying on hashchange, popstate, and the interval watchdog for SPA navigation detection.

window.addEventListener('pilotpro_spa_nav', onSpaNavigation);
window.addEventListener('popstate', onSpaNavigation);
window.addEventListener('hashchange', onSpaNavigation);

// Listen for arrow key navigation (often used in top window readers)
window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        log('NAV', 'Arrow key navigation detected.');
        setTimeout(onSpaNavigation, 300);
    }
});

let _lastUrl = location.href;
let _lastHash = location.hash;
setInterval(() => {
    if (location.href !== _lastUrl || location.hash !== _lastHash) {
        _lastUrl = location.href;
        _lastHash = location.hash;
        onSpaNavigation();
    }
}, 1000);

document.addEventListener('visibilitychange', () => {
    const hidden = document.hidden;
    log('SENSOR', hidden ? 'Tab hidden — engine paused.' : 'Tab visible — engine resumed.');
    safeSend({ type: hidden ? 'TAB_HIDDEN' : 'TAB_VISIBLE', timestamp: Date.now() });
});

setInterval(() => {
    if (!autoPilot || !isScraping || document.hidden) return;
    if (Date.now() - lastFlipTime > 8000) { 
        log('NAV', 'WATCHDOG: Stall detected (8s). Nudge recovery.');
        snapWithRetry(0, false); 
        setTimeout(triggerNext, 3000);
        lastFlipTime = Date.now(); 
    }
}, 3000);

function activatePicker() {
    log('UI', 'Picker activated.');
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
            customSelector = el.tagName.toLowerCase() + (el.id ? '#' + CSS.escape(el.id) : '');
            log('UI', `Target locked: ${customSelector}`);
            // In extension, we just set the custom selector directly instead of sending a message
            // Wait, this runs in content script, so it sets the local customSelector
            // We don't need to broadcast it unless we want other frames to know, but usually picker is used in the frame with content.
        }
        setTimeout(() => shield.remove(), 300);
    }, { capture: true, once: true });

    document.body.appendChild(shield);
}

const isSignificantFrame = () => {
    if (window.top === window.self) return true;
    const body = document.body;
    if (!body) return false;
    // Lower threshold for "content" detection to avoid missing short pages
    return (body.innerText && body.innerText.length > 50) || !!autoDetectContent();
};

const sendPulse = () => {
    if (!isSignificantFrame()) return;
    safeSend({ 
        type: 'ALIVE', 
        sensorId: SENSOR_ID, 
        contextId: CONTEXT_ID, 
        url: location.href, 
        timestamp: Date.now() 
    });
};

window.addEventListener('beforeunload', () => {
    safeSend({ type: 'DEAD', sensorId: SENSOR_ID });
});

sendPulse();
setInterval(sendPulse, 5000);

function getCurrentPageValue() {
    const input = document.querySelector('input[class*="InputControl__input"]');
    if (!input) {
        // Fallback to searching all inputs for a numeric or roman value
        const inputs = Array.from(document.querySelectorAll('input'));
        for (const i of inputs) {
            if (i.value && /^[ivx0-9]+$/i.test(i.value)) return i.value;
        }
    }
    return input ? input.value : null;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', armPageChangeObserver);
} else {
    armPageChangeObserver();
}
