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

let isPickMode = false;

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

    const payload = {
        html: target.innerHTML,
        index: metadata?.pageIndex || Date.now(),
        metadata: {
            title: document.title,
            url: window.location.href,
            timestamp: Date.now()
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