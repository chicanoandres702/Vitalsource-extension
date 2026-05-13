/**
 * filepath: print.js
 * PilotPro Print Bridge Logic
 */

const STORAGE_KEY = 'pilot_pro_captured_pages';

async function loadAndRender() {
    const container = document.getElementById('page-container');
    const status = document.getElementById('load-status');

    // Safety guard for DOM ready state
    if (!container) {
        console.warn('[PilotPro] Print container not found, retrying...');
        setTimeout(loadAndRender, 100);
        return;
    }

    try {
        const result = await chrome.storage.local.get([STORAGE_KEY]);
        const pages = result[STORAGE_KEY] || [];

        if (pages.length === 0) {
            if (status) status.textContent = 'Storage is empty. Capture pages first.';
            return;
        }

        // Order the book chronologically
        pages.sort((a, b) => a.index - b.index);

        if (status) status.style.display = 'none';
        
        // Add book title page
        if (pages.length > 0 && pages[0].metadata) {
            const titlePage = document.createElement('section');
            titlePage.className = 'book-title-page';
            titlePage.style.cssText = `
                page-break-after: always;
                position: relative;
                margin: 0;
                padding: 100px 40px;
                min-height: 100vh;
                background: white;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                text-align: center;
            `;
            
            const title = document.createElement('h1');
            title.textContent = pages[0].metadata.title || 'Captured Book';
            title.style.cssText = `
                font-size: 36px;
                font-weight: bold;
                margin-bottom: 40px;
                color: #1a1a1a;
                font-family: 'Times New Roman', serif;
            `;
            
            const url = document.createElement('p');
            url.textContent = `Source: ${pages[0].metadata.url || 'Unknown'}`;
            url.style.cssText = `
                font-size: 14px;
                color: #666;
                margin-top: 40px;
                font-family: 'Times New Roman', serif;
            `;
            
            titlePage.appendChild(title);
            titlePage.appendChild(url);
            container.appendChild(titlePage);
        }
        
        pages.forEach((page, i) => {
            const section = document.createElement('section');
            section.className = 'book-page';
            
            // Critical CSS for forcing PDF page breaks and ebook layout
            section.style.cssText = `
                page-break-after: always; 
                position: relative; 
                margin: 0; 
                padding: 60px 40px 80px 40px; 
                min-height: 100vh; 
                background: white; 
                box-sizing: border-box;
                font-family: 'Times New Roman', serif;
                line-height: 1.6;
                font-size: 12pt;
                color: #1a1a1a;
            `;

            // Add page header with page number
            const header = document.createElement('div');
            header.className = 'page-header';
            header.style.cssText = `
                position: absolute;
                top: 20px;
                left: 40px;
                right: 40px;
                height: 30px;
                border-bottom: 1px solid #ddd;
                padding-bottom: 5px;
                font-size: 10pt;
                color: #666;
                display: flex;
                justify-content: space-between;
                align-items: flex-end;
            `;
            
            const pageNum = document.createElement('span');
            pageNum.textContent = `Page ${i + 1}`;
            pageNum.style.cssText = `font-weight: normal;`;
            
            const titleShort = document.createElement('span');
            titleShort.textContent = (pages[0]?.metadata?.title || 'Book').substring(0, 50);
            titleShort.style.cssText = `font-weight: normal; text-align: right;`;
            
            header.appendChild(pageNum);
            header.appendChild(titleShort);
            section.appendChild(header);

            // Invisible marker for the PDF engine outline
            const marker = document.createElement('a');
            marker.name = `page-${i+1}`;
            section.appendChild(marker);

            const content = document.createElement('div');
            content.className = 'vst-content-body';
            content.innerHTML = page.html;
            
            // Enhanced content styling for ebook appearance
            content.style.cssText = `
                margin-top: 20px;
                text-align: justify;
                hyphens: auto;
                word-wrap: break-word;
            `;
            
            // Ensure child images within content are responsive but high quality
            content.querySelectorAll('img').forEach(img => {
                img.style.maxWidth = '100%';
                img.style.height = 'auto';
                img.style.display = 'block';
                img.style.margin = '20px auto';
                img.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
            });
            
            // Style headings
            content.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
                h.style.marginTop = '1.5em';
                h.style.marginBottom = '0.5em';
                h.style.lineHeight = '1.2';
                h.style.pageBreakAfter = 'avoid';
            });
            
            // Style paragraphs
            content.querySelectorAll('p').forEach(p => {
                p.style.marginBottom = '1em';
                p.style.textIndent = '1.5em';
                p.style.pageBreakInside = 'avoid';
            });
            
            section.appendChild(content);
            container.appendChild(section);
        });

        // Add class to body to signal external watchers (like debugger)
        document.body.classList.add('ready-to-print');
        console.log(`[PilotPro] Successfully rendered ${pages.length} units for export.`);

    } catch (err) {
        console.error('[PilotPro] Print render failed:', err);
        if (status) status.textContent = 'Error loading book data from storage.';
    }
}

// Start rendering when DOM is ready
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', loadAndRender);
} else {
    loadAndRender();
}