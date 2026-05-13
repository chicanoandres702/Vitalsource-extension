/**
 * filepath: content.js
 */

// Local storage helper (no imports to avoid SyntaxError)
const PilotStorageLocal = {
    _storageKey: 'pilot_pro_captured_pages',
    async savePage(pageData) {
        const result = await chrome.storage.local.get([this._storageKey]);
        const pages = result[this._storageKey] || [];
        pages.push({ ...pageData, timestamp: Date.now() });
        await chrome.storage.local.set({ [this._storageKey]: pages });
        return pages.length;
    }
};

/**
 * fixImagePaths - Converts relative URLs to absolute URLs
 * This ensures images show up in the PDF/HTML export.
 */
function fixImagePaths(container) {
    const images = container.querySelectorAll('img');
    images.forEach(img => {
        const src = img.getAttribute('src');
        if (src && !src.startsWith('data:') && !src.startsWith('http')) {
            // Convert relative to absolute based on current page URL
            img.src = new URL(src, window.location.href).href;
        }
    });
    return container.innerHTML;
}

async function performSnap(target, metadata) {
    if (!target) return;

    // Flash effect
    const originalBorder = target.style.border;
    target.style.border = '4px solid #00f2ff';
    setTimeout(() => target.style.border = originalBorder, 500);

    // Clean and fix content
    const cleanHtml = fixImagePaths(target.cloneNode(true));

    const payload = {
        html: cleanHtml,
        index: metadata?.pageIndex || Date.now(),
        metadata: {
            title: document.title,
            url: window.location.href
        }
    };

    await PilotStorageLocal.savePage(payload);
    chrome.runtime.sendMessage({ type: 'PILOT_PAGE_CAPTURED' });
    console.log(`[PilotPro] Snap sequence complete: Page ${payload.index}`);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'PICK') {
        window.isPickMode = true;
        console.log('[PilotPro] PICK mode active. Click container.');
    } else if (request.type === 'SNAP') {
        const sensor = document.querySelector('.pilot-pro-sensor');
        if (sensor) {
            performSnap(sensor, request.metadata);
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: 'No sensor' });
        }
    }
    return true;
});

document.addEventListener('click', (e) => {
    if (!window.isPickMode) return;
    e.preventDefault(); e.stopPropagation();
    document.querySelectorAll('.pilot-pro-sensor').forEach(el => el.classList.remove('pilot-pro-sensor'));
    e.target.classList.add('pilot-pro-sensor');
    window.isPickMode = false;
    chrome.runtime.sendMessage({ type: 'SENSOR_LOCKED', tag: e.target.tagName });
}, true);

console.log('[PilotPro] Content Agent Online - All features loaded by manifest');