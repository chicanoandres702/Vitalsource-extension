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

    // [MOD] Streamlined Assembler
    log('Assembly', `Processing ${validPages.length} segments...`);
    
    // Group segments by chapter for better TOC flow
    const chapters = bookOutline && bookOutline.length > 0 ? bookOutline : [{ title: 'Main Content', level: 0 }];
    
    chapters.forEach((chapter, cIdx) => {
        const chapterDiv = document.createElement('div');
        chapterDiv.className = 'pilot-page chapter-start';
        chapterDiv.innerHTML = `
            <div style="font-family:'Outfit';font-size:24px;font-weight:700;margin-bottom:20px;border-bottom:2px solid #eee;padding-bottom:10px;">
                ${chapter.title}
            </div>
            <div class="pg-content"></div>
        `;
        
        const contentArea = chapterDiv.querySelector('.pg-content');
        
        // Find pages belonging to this chapter (heuristic matching)
        const relevantPages = validPages.filter(p => p.meta?.chapter === chapter.title);
        
        if (relevantPages.length > 0) {
            relevantPages.forEach(p => {
                const segment = document.createElement('div');
                segment.className = 'pg-segment';
                segment.innerHTML = p.html;
                
                // Content Clean-up
                segment.querySelectorAll('script, style, iframe, button').forEach(el => el.remove());
                
                contentArea.appendChild(segment);
            });
            container.appendChild(chapterDiv);
        }
    });

    // Handle orphans (pages with no assigned chapter)
    const orphans = validPages.filter(p => !chapters.some(c => c.title === p.meta?.chapter));
    if (orphans.length > 0) {
        const orphanDiv = document.createElement('div');
        orphanDiv.className = 'pilot-page chapter-start';
        orphanDiv.innerHTML = `<div class="pg-content"></div>`;
        const contentArea = orphanDiv.querySelector('.pg-content');
        orphans.forEach(p => {
            const segment = document.createElement('div');
            segment.className = 'pg-segment';
            segment.innerHTML = p.html;
            contentArea.appendChild(segment);
        });
        container.appendChild(orphanDiv);
    }

    if (progress) progress.textContent = `Vessel Reconstructed: ${validPages.length} Pages`;
    const printBtn = document.getElementById('print-btn');
    if (printBtn) {
        printBtn.textContent = 'SAVE PDF';
        printBtn.disabled = false;
    }
});
