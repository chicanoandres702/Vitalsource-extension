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
        const noise = 'script, style, iframe, .vst-controls, .vst-nav, [aria-hidden="true"], svg, .arrow, .navigation-arrow, [class*="arrow"], nav, aside, footer, header:not(h1):not(h2):not(h3):not(h4):not(h5):not(h6)';
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
    }
};

let isPickMode = false;
let tocData = null;

// Listen for TOC data from intercept.js
window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data.type === 'VS_OUTLINE_JSON' || event.data.type === 'VS_PAGEBREAKS_JSON') {
        tocData = event.data;
        console.log('[PilotPro] TOC Data Received:', tocData);
    }
});

/**
 * performSnap - Extracts content from the sensor and saves it
 */
async function performSnap(target, metadata) {
    if (!target) return;

    // Visual feedback for HUD confirmation
    const originalOutline = target.style.outline;
    target.style.outline = '4px solid #00f2ff'; // Cyan HUD color
    target.style.outlineOffset = '-4px';
    setTimeout(() => target.style.outline = originalOutline, 500);

    // Clean and resolve the HTML to remove noise and fix URLs
    const cleanedHtml = PilotCleaner.cleanAndResolveHTML(target);

    const payload = {
        html: cleanedHtml,
        index: metadata?.pageIndex || Date.now(),
        metadata: {
            title: document.title,
            url: window.location.href,
            timestamp: Date.now(),
            toc: tocData
        }
    };

    // Save directly to persistent local storage
    await PilotStorageLocal.savePage(payload);
    
    // Notify Sidebar UI to increment counter
    chrome.runtime.sendMessage({ type: 'PILOT_PAGE_CAPTURED' });
    
    // Signal to the Watchdog that we are active
    window.dispatchEvent(new CustomEvent('pilot-activity-reset'));
    console.log(`[PilotPro] Snap sequence complete: Page ${payload.index}`);
}

/**
 * Message Dispatcher
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'PICK') {
        isPickMode = true;
        console.log('[PilotPro] PICK mode active. Click container.');
        sendResponse({ status: 'picking' });
    } else if (request.type === 'SNAP') {
        const sensor = document.querySelector('.pilot-pro-sensor');
        if (sensor) {
            performSnap(sensor, request.metadata);
            sendResponse({ success: true });
        } else {
            console.warn('[PilotPro] SNAP failed: No sensor target picked.');
            sendResponse({ success: false, error: 'No sensor' });
        }
    } else if (request.type === 'PING') {
        sendResponse({ status: 'ready' });
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
    
    isPickMode = false;
    console.log('[PilotPro] Target Acquired:', e.target.tagName);
    
    // Notify the HUD sidebar
    chrome.runtime.sendMessage({ 
        type: 'SENSOR_LOCKED', 
        tag: e.target.tagName 
    });
}, true);

console.log('[PilotPro] Content Agent Online');