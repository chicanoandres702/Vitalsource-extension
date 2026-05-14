/**
 * print.js - PDF Reconstruction Engine
 */

document.getElementById('print-btn')?.addEventListener('click', () => {
    window.print(); // Simple trigger for system print dialog (configured for PDF)
});

// Utility for professional logging
const log = (step, msg) => console.log(`[PilotPro] ${step}: ${msg}`);

chrome.storage.local.get(['printDataCache'], (result) => {
    const data = result.printDataCache;
    const progress = document.getElementById('progress');
    const container = document.getElementById('page-container');
    const styleEl = document.getElementById('global-styles');

    if (!data || !data.validPages || data.validPages.length === 0) {
        if (progress) progress.textContent = 'Error: No pages in buffer.';
        return;
    }

    const { validPages, globalStyles, bookMetadata, bookOutline, pagebreaks } = data;
    if (globalStyles && styleEl) styleEl.textContent = globalStyles;

    // Set Metadata
    if (bookMetadata?.title) {
        document.title = bookMetadata.title;
        const toolbarTitle = document.getElementById('toolbar-title');
        if (toolbarTitle) toolbarTitle.textContent = bookMetadata.title;
    }

    log('Assembly', `Processing ${validPages.length} pages...`);

    if (bookOutline && bookOutline.length > 0) {
        const tocPage = document.createElement('div');
        tocPage.className = 'pilot-page';
        tocPage.innerHTML = `
            <div style="font-family:'Outfit',sans-serif;font-size:28px;font-weight:700;margin-bottom:18px;">
                Table of Contents
            </div>
            <ol style="padding-left:20px;color:#334155;font-size:14px;line-height:1.7;">
                ${bookOutline.map(item => `<li style="margin-bottom:10px;">${item.title || item.page || ''}</li>`).join('')}
            </ol>
        `;
        container.appendChild(tocPage);
    }

    validPages.forEach((p, idx) => {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'pilot-page';
        const label = p.meta?.pageLabel || `Page ${idx + 1}`;
        const pageNumber = p.meta?.pageNumber || idx + 1;
        pageDiv.innerHTML = `
            <div style="font-size:12px;color:#64748b;margin-bottom:14px;">${label}</div>
        `;

        const segment = document.createElement('div');
        segment.className = 'pg-segment';
        segment.innerHTML = p.html;
        segment.querySelectorAll('script, style, iframe, button, nav, header, footer, .spinner, [aria-busy="true"]').forEach(el => el.remove());
        pageDiv.appendChild(segment);
        container.appendChild(pageDiv);
    });

    if (progress) progress.textContent = `Pages assembled: ${validPages.length}`;
    const printBtn = document.getElementById('print-btn');
    if (printBtn) {
        printBtn.textContent = 'SAVE PDF';
        printBtn.disabled = false;
    }
});
