/**
 * filepath: content.js
 * PilotPro Content Agent - Handles extraction and designates sensor targets.
 */

// Localized storage helper to avoid 'import' SyntaxError in content script
const PilotStorageLocal = {
    _storageKey: 'pilot_pro_captured_pages',
    async savePage(pageData) {
        try {
            const result = await chrome.storage.local.get([this._storageKey]);
            const pages = result[this._storageKey] || [];
            
            // Check for duplicates
            const isDuplicate = pages.some(p => 
                p.index === pageData.index && 
                p.metadata?.title === pageData.metadata?.title
            );
            
            if (!isDuplicate) {
                pages.push({
                    ...pageData,
                    timestamp: Date.now()
                });
                await chrome.storage.local.set({ [this._storageKey]: pages });
                return pages.length;
            }
            return pages.length;
        } catch (err) {
            console.error('[PilotPro] Storage Save Error:', err);
            return 0;
        }
    }
};

const LOADING_SPINNER_SELECTOR = 'div[aria-label="Loading"]';

// Cleaner utility to scrub HTML and resolve URLs
const PilotCleaner = {
    cleanAndResolveHTML(node) {
        const clone = node.cloneNode(true);
        const baseUrl = location.href.split(/[?#]/)[0];

        // Resolve URLs
        const resolve = (attr) => {
            // Escape colons in namespaced attributes for querySelectorAll
            const escapedAttr = attr.replace(/:/g, '\\:');
            clone.querySelectorAll(`[${escapedAttr}]`).forEach(el => {
                const val = el.getAttribute(attr);
                if (val && !val.startsWith('data:') && !val.startsWith('http') && !val.startsWith('//')) {
                    try { el.setAttribute(attr, new URL(val, baseUrl).href); } catch(e){}
                }
            });
        };
        ['src', 'href', 'data-src', 'xlink:href'].forEach(resolve);

        // Remove noise elements that cause issues, but keep content elements
        const noise = `script, style, iframe, .vst-controls, .vst-nav, [aria-hidden="true"], svg, .arrow, .navigation-arrow, [class*="arrow"], nav, aside, footer, header:not(h1):not(h2):not(h3):not(h4):not(h5):not(h6), ${LOADING_SPINNER_SELECTOR}`;
        clone.querySelectorAll(noise).forEach(el => el.remove());

        // Remove inline styles that might cause giant elements
        clone.querySelectorAll('[style*="font-size"]').forEach(el => {
            const style = el.getAttribute('style');
            if (style && style.includes('font-size') && style.match(/font-size:\s*\d+px/) && parseInt(style.match(/font-size:\s*(\d+)px/)[1]) > 50) {
                el.removeAttribute('style');
            }
        });

        // Add line breaks for text nodes with newlines
        function addLineBreaks(element) {
            Array.from(element.childNodes).forEach(child => {
                if (child.nodeType === Node.TEXT_NODE) {
                    const text = child.textContent;
                    if (text.includes('\n')) {
                        const parts = text.split('\n');
                        const fragment = document.createDocumentFragment();
                        parts.forEach((part, index) => {
                            if (part) fragment.appendChild(document.createTextNode(part));
                            if (index < parts.length - 1) fragment.appendChild(document.createElement('br'));
                        });
                        child.replaceWith(fragment);
                    }
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    addLineBreaks(child);
                }
            });
        }
        addLineBreaks(clone);

        return clone.innerHTML;
    },

    getAbsoluteStyles() {
        let css = '';
        const sheets = Array.from(document.styleSheets);
        for (const sheet of sheets) {
            try {
                const rules = Array.from(sheet.cssRules || []);
                for (const rule of rules) {
                    if (rule.cssText.includes('@font-face')) continue;
                    css += rule.cssText + '\n';
                }
            } catch (e) {}
        }
        return `<style>${css}</style>`;
    }
};

let isPickMode = false;
let lastElementInfo = null;

// Utility to generate selector for element
function generateOptimalSelector(el) {
    if (el.id) return `#${el.id}`;
    if (el === document.body) return 'body';
    
    let path = [];
    let curr = el;
    while (curr && curr.nodeType === Node.ELEMENT_NODE && path.length < 5) {
        let s = curr.nodeName.toLowerCase();
        if (curr.className && typeof curr.className === 'string') {
            const c = curr.className.split(/\s+/).filter(x => x && !x.includes(':'))[0];
            if (c) s += `.${c}`;
        }
        path.unshift(s);
        curr = curr.parentNode;
    }
    return path.join(' > ');
}

// Store element info for auto-finding
function storeElementInfo(el) {
    lastElementInfo = {
        tagName: el.tagName.toLowerCase(),
        className: el.className,
        id: el.id
    };
}

// Find element based on stored info
function findElementByInfo() {
    if (!lastElementInfo) return null;
    
    console.log('[PilotPro] Finding element by info:', lastElementInfo);
    
    // Function to search in root
    function searchInRoot(root) {
        // First try exact match
        if (lastElementInfo.id) {
            const el = root.getElementById ? root.getElementById(lastElementInfo.id) : root.querySelector(`#${lastElementInfo.id}`);
            if (el) {
                console.log('[PilotPro] Found by ID:', el);
                return el;
            }
        }
        
        // Then try tag + class
        if (lastElementInfo.className) {
            const className = lastElementInfo.className.split(/\s+/)[0];
            const selector = `${lastElementInfo.tagName}.${className}`;
            const el = root.querySelector(selector);
            if (el) {
                console.log('[PilotPro] Found by tag.class:', selector, el);
                return el;
            }
        }
        
        // Fallback to first element with matching tag
        const el = root.querySelector(lastElementInfo.tagName);
        if (el) {
            console.log('[PilotPro] Found by tag:', lastElementInfo.tagName, el);
            return el;
        }
        
        return null;
    }
    
    // Search in main document
    let el = searchInRoot(document);
    if (el) return el;
    
    // Search in iframes
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
        try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            el = searchInRoot(doc);
            if (el) return el;
        } catch (e) {
            // Cross-origin
        }
    }
    
    console.log('[PilotPro] No element found');
    return null;
}

function getCurrentCfi() {
    const match = window.location.href.match(/\/epubcfi\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
}

function findPageRecord(records, currentCfi) {
    if (!records || !records.data) return null;
    const list = records.data;
    let match = list.find(item => item.cfi === currentCfi || item.url === window.location.href);
    if (!match && currentCfi) {
        match = list.find(item => item.cfi && currentCfi.includes(item.cfi));
    }
    return match;
}

function getPageInfo() {
    const cfi = getCurrentCfi();
    const pagebreak = findPageRecord(pagebreaksData, cfi);
    const pageMeta = findPageRecord(pagesData, cfi) || pagebreak;
    const tocMeta = findPageRecord(tocData, cfi) || pageMeta;
    const pageString = pageMeta?.page || pageMeta?.label || tocMeta?.title || pageMeta?.title || '';
    const pageNumber = parseInt(pageString, 10);
    let order = 0;
    if (!Number.isNaN(pageNumber)) {
        order = pageNumber;
    } else if (pagebreak && pagebreaksData?.data) {
        order = pagebreaksData.data.indexOf(pagebreak) + 1;
    } else if (pageMeta && pagesData?.data) {
        order = pagesData.data.indexOf(pageMeta) + 1;
    }

    return {
        cfi,
        page: pageString,
        pageNumber: Number.isNaN(pageNumber) ? null : pageNumber,
        title: pageMeta?.title || tocMeta?.title || document.title,
        chapter: tocMeta?.title || pageMeta?.chapter || pageMeta?.title || document.title,
        order,
        bookId: pagebreaksData?.bookId || tocData?.bookId || pagesData?.bookId || null,
        sourceUrl: pageMeta?.absolute_url || pageMeta?.url || window.location.href
    };
}

let tocData = null;
let pagebreaksData = null;
let pagesData = null;

// Common selectors for VitalSource content
window.CONTENT_SELECTORS = [
    '.reader-content',
    '.page-content', 
    '.epub-view',
    '[role="main"]',
    'main',
    '.content',
    '.page',
    '.chapter-content',
    '.epub-content'
];

// Auto-detect content area
function autoDetectContent() {
    for (const selector of window.CONTENT_SELECTORS) {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim().length > 100) { // Ensure it has substantial content
            console.log('[PilotPro] Auto-detected content:', selector, el);
            return el;
        }
    }
    // Fallback to largest text-containing element
    const candidates = Array.from(document.querySelectorAll('div, section, article'))
        .filter(el => el.textContent.trim().length > 200)
        .sort((a, b) => b.textContent.length - a.textContent.length);
    if (candidates.length > 0) {
        console.log('[PilotPro] Auto-detected by size:', candidates[0]);
        return candidates[0];
    }
    return null;
}

// Listen for TOC data from intercept.js
window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data.type === 'VS_OUTLINE_JSON' || event.data.type === 'VS_PAGEBREAKS_JSON' || event.data.type === 'VS_PAGES_JSON') {
        if (event.data.type === 'VS_OUTLINE_JSON') {
            tocData = event.data;
        } else if (event.data.type === 'VS_PAGEBREAKS_JSON') {
            pagebreaksData = event.data;
        } else if (event.data.type === 'VS_PAGES_JSON') {
            pagesData = event.data;
        }
        console.log('[PilotPro] Data Received:', event.data.type, event.data);
    }
});

/**
 * performSnap - Extracts content from the sensor and saves it
 */
async function performSnap(target, metadata) {
    // Crucial check: If the loading spinner is visible, abort the snap.
    if (document.querySelector(LOADING_SPINNER_SELECTOR)) {
        console.log('[PilotPro] SNAP aborted: Loading spinner detected. Will re-attempt on next cycle.');
        return { success: false, error: 'Page is loading' };
    }

    if (!target) return;

    // Visual feedback for HUD confirmation
    const originalOutline = target.style.outline;
    target.style.outline = '4px solid #00f2ff'; // Cyan HUD color
    target.style.outlineOffset = '-4px';
    setTimeout(() => target.style.outline = originalOutline, 500);

    // Clean and resolve the HTML to remove noise and fix URLs
    const cleanedHtml = PilotCleaner.cleanAndResolveHTML(target);

    const pageInfo = getPageInfo();
    const payload = {
        html: cleanedHtml,
        index: pageInfo.order || metadata?.pageIndex || Date.now(),
        metadata: {
            title: document.title,
            url: window.location.href,
            timestamp: Date.now(),
            toc: tocData,
            pagebreaks: pagebreaksData,
            pages: pagesData,
            pageInfo,
            styles: PilotCleaner.getAbsoluteStyles()
        }
    };

    // Save directly to persistent local storage
    await PilotStorageLocal.savePage(payload);
    
    // Notify Sidebar UI to increment counter
    chrome.runtime.sendMessage({ type: 'PILOT_PAGE_CAPTURED' });
    
    // Signal to the Watchdog that we are active
    window.dispatchEvent(new CustomEvent('pilot-activity-reset'));
    console.log(`[PilotPro] Snap sequence complete: Page ${payload.index}`);
    return { success: true };
}

/**
 * Message Dispatcher
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => { // Keep channel open for async response
    if (request.type === 'PICK') {
        isPickMode = true;
        console.log('[PilotPro] PICK mode active. Click container.');
        sendResponse({ status: 'picking' });
    } else if (request.type === 'SNAP') {
        let sensor = document.querySelector('.pilot-pro-sensor');
        if (!sensor && lastElementInfo) {
            sensor = findElementByInfo();
        }
        if (!sensor) {
            sensor = autoDetectContent();
        }
        if (sensor) { 
            // Await the snap operation and send its result back to the caller (sidebar.js)
            performSnap(sensor, request.metadata).then(sendResponse);
        } else {
            console.warn('[PilotPro] SNAP failed: No sensor target found.');
            sendResponse({ success: false, error: 'No sensor' });
        }
    } else if (request.type === 'PING') {
        sendResponse({ status: 'ready' });
    } else if (request.type === 'TURN_PAGE') {
        turnPage(request.direction);
        sendResponse({ success: true });
    }
    return true;
});

/**
 * Global click listener for the 'PICK' HUD feature
 */
document.addEventListener('click', (e) => {
    if (!isPickMode) return;
    
    e.preventDefault();
    e.stopPropagation();

    // Mark element as the sensor
    document.querySelectorAll('.pilot-pro-sensor').forEach(el => el.classList.remove('pilot-pro-sensor'));
    e.target.classList.add('pilot-pro-sensor');
    
    // Generate and store selector for auto mode
    lastSelector = generateOptimalSelector(e.target);
    storeElementInfo(e.target);
    
    isPickMode = false;
    console.log('[PilotPro] Target Acquired:', e.target.tagName, 'Selector:', lastSelector);
    
    // Notify the HUD sidebar
    chrome.runtime.sendMessage({ 
        type: 'SENSOR_LOCKED', 
        tag: e.target.tagName 
    });
}, true);

console.log('[PilotPro] Content Agent Online');

// Function to turn page by navigating to next CFI
function turnPage(direction) {
    if (!pagebreaksData || !pagebreaksData.data) {
        console.log('[PilotPro] No pagebreaks data, using key press');
        // Fallback to key press on document.body
        const keyCode = direction === 'right' ? 39 : 37;
        const keyEvent = new KeyboardEvent('keydown', {
            key: direction === 'right' ? 'ArrowRight' : 'ArrowLeft',
            code: direction === 'right' ? 'ArrowRight' : 'ArrowLeft',
            keyCode: keyCode,
            which: keyCode,
            bubbles: true,
            cancelable: true
        });
        (document.body || document.documentElement).dispatchEvent(keyEvent);
        
        // Also dispatch keyup
        const keyUpEvent = new KeyboardEvent('keyup', {
            key: direction === 'right' ? 'ArrowRight' : 'ArrowLeft',
            code: direction === 'right' ? 'ArrowRight' : 'ArrowLeft',
            keyCode: keyCode,
            which: keyCode,
            bubbles: true,
            cancelable: true
        });
        (document.body || document.documentElement).dispatchEvent(keyUpEvent);
        return;
    }

    // Get current CFI from URL - capture everything after /epubcfi/
    const urlMatch = window.location.href.match(/\/epubcfi\/(.+)$/);
    if (!urlMatch) {
        console.log('[PilotPro] No CFI in URL, using key press');
        // Fallback
        const keyCode = direction === 'right' ? 39 : 37;
        const keyEvent = new KeyboardEvent('keydown', {
            key: direction === 'right' ? 'ArrowRight' : 'ArrowLeft',
            code: direction === 'right' ? 'ArrowRight' : 'ArrowLeft',
            keyCode: keyCode,
            which: keyCode,
            bubbles: true,
            cancelable: true
        });
        (document.body || document.documentElement).dispatchEvent(keyEvent);
        return;
    }
    const currentCfi = decodeURIComponent(urlMatch[1]);

    // Find current index in pagebreaks
    const pages = pagebreaksData.data;
    let currentIndex = -1;
    for (let i = 0; i < pages.length; i++) {
        if (pages[i].cfi === currentCfi) {
            currentIndex = i;
            break;
        }
    }

    if (currentIndex === -1) {
        console.log('[PilotPro] Current CFI not found in pagebreaks, using key press');
        // Fallback
        const keyCode = direction === 'right' ? 39 : 37;
        const keyEvent = new KeyboardEvent('keydown', {
            key: direction === 'right' ? 'ArrowRight' : 'ArrowLeft',
            code: direction === 'right' ? 'ArrowRight' : 'ArrowLeft',
            keyCode: keyCode,
            which: keyCode,
            bubbles: true,
            cancelable: true
        });
        (document.body || document.documentElement).dispatchEvent(keyEvent);
        
        // Also dispatch keyup
        const keyUpEvent = new KeyboardEvent('keyup', {
            key: direction === 'right' ? 'ArrowRight' : 'ArrowLeft',
            code: direction === 'right' ? 'ArrowRight' : 'ArrowLeft',
            keyCode: keyCode,
            which: keyCode,
            bubbles: true,
            cancelable: true
        });
        (document.body || document.documentElement).dispatchEvent(keyUpEvent);
        return;
    }

    // Get next/prev index
    const nextIndex = direction === 'right' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0 || nextIndex >= pages.length) {
        console.log('[PilotPro] No more pages in that direction');
        return;
    }

    const nextCfi = pages[nextIndex].cfi;
    const newUrl = window.location.href.replace(/\/epubcfi\/(.+)$/, '/epubcfi/' + encodeURIComponent(nextCfi));
    console.log('[PilotPro] Navigating to:', newUrl);
    window.location.href = newUrl;
}