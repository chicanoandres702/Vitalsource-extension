document.getElementById('print-btn').addEventListener('click', () => {
    const btn = document.getElementById('print-btn');
    btn.textContent = 'Generating PDF natively...';
    btn.disabled = true;

    chrome.runtime.sendMessage({ action: 'CREATE_NATIVE_PDF' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Runtime error:', chrome.runtime.lastError);
            alert('Failed to generate PDF: ' + chrome.runtime.lastError.message);
            btn.textContent = 'Download PDF';
            btn.disabled = false;
            return;
        }

        if (response && response.success && response.pdfData) {
            // Convert base64 to Blob
            const binary = atob(response.pdfData);
            const array = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                array[i] = binary.charCodeAt(i);
            }
            const blob = new Blob([array], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            
            // Open the PDF in a new tab natively using Chrome's built-in viewer
            window.open(url, '_blank');
            
            btn.textContent = 'View PDF';
            btn.disabled = false;
        } else {
            console.error('PDF error:', response?.error);
            alert('Failed to generate native PDF: ' + (response?.error || 'Unknown error'));
            btn.textContent = 'Download PDF';
            btn.disabled = false;
        }
    });
});

// Fetch the print data from local storage
chrome.storage.local.get(['printDataCache'], (result) => {
    const data = result.printDataCache;
    
    if (!data || !data.validPages || data.validPages.length === 0) {
        const progress = document.getElementById('progress');
        if (progress) progress.textContent = 'Error: No valid pages found. Please capture pages before assembling.';
        const container = document.getElementById('page-container');
        if (container) {
            container.innerHTML = `<div style="text-align:center; padding: 60px 20px; color: #64748b; font-family: sans-serif;">
                <h2 style="color: #334155; margin-bottom: 12px;">No Pages to Display</h2>
                <p>It looks like there are no captured pages available to assemble. Please go back to the extension and capture some pages first.</p>
            </div>`;
        }
        return;
    }

    const { validPages, globalStyles } = data;
    let totalStrippedCount = data.strippedCount || 0;

    if (globalStyles) {
        document.getElementById('global-styles').innerHTML = globalStyles;
    }

    const updateEraseNotice = () => {
        if (totalStrippedCount > 0) {
            const notice = document.getElementById('erase-notice');
            if (notice) {
                notice.textContent = `(${totalStrippedCount} blank pages automatically removed)`;
            }
        }
    };
    updateEraseNotice();

    const container = document.getElementById('page-container');
    const progress = document.getElementById('progress');
    const printBtn = document.getElementById('print-btn');
    const aiBtn = document.getElementById('ai-btn');

    // Add global error listener for images to implement retry mechanism
    if (container) {
        container.addEventListener('error', (e) => {
            if (e.target && (e.target.tagName === 'IMG' || e.target.tagName === 'SOURCE')) {
                const fallbackUrlsStr = e.target.getAttribute('data-fallback-urls');
                if (fallbackUrlsStr) {
                    try {
                        const fallbackUrls = JSON.parse(fallbackUrlsStr);
                        if (fallbackUrls.length > 0) {
                            const nextUrl = fallbackUrls.shift();
                            console.log(`Retrying image load with fallback: ${nextUrl}`);
                            e.target.src = nextUrl;
                            e.target.setAttribute('data-fallback-urls', JSON.stringify(fallbackUrls));
                        }
                    } catch (err) {
                        console.error('Error parsing fallback URLs', err);
                    }
                }
            }
        }, true); // Use capture phase to catch non-bubbling error events
    }

    // Create AI result container
    const aiResult = document.createElement('div');
    aiResult.className = 'pilot-page no-print';
    aiResult.style.cssText = "display: none; margin-bottom: 24px;";
    container.parentNode.insertBefore(aiResult, container);

    if (aiBtn) {
        aiBtn.addEventListener('click', async () => {
            aiBtn.textContent = 'Analyzing...';
            aiBtn.disabled = true;
            
            // Extract text from all pages
            const fullText = validPages.map(p => {
                const temp = document.createElement('div');
                temp.innerHTML = p.html;
                return temp.textContent || '';
            }).join('\n\n');

            try {
                // If text is extremely long, truncate it to avoid 413 Payload Too Large
                // Gemini models have large context windows, but Cloud Run / Express defaults to 100kb-1MB limits
                // We'll cap it at roughly 100,000 characters (approx 20,000 words) for safety
                const MAX_CHARS = 100000;
                let textToSend = fullText;
                let truncated = false;
                
                if (fullText.length > MAX_CHARS) {
                    textToSend = fullText.substring(0, MAX_CHARS) + '\n\n...[Content truncated for AI summary due to length limits]...';
                    truncated = true;
                }

                // Use the App URL provided in the runtime context
                const response = await fetch('https://ais-dev-ezjsglwu3wmsozbdvheqvh-229925245080.us-east1.run.app/api/ai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: textToSend })
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const data = await response.json();
                if (data.result) {
                    aiResult.style.display = 'block';
                    const truncateNotice = truncated ? `<div style="background:#fef3c7;color:#92400e;padding:8px 12px;border-radius:6px;font-size:12px;margin-bottom:16px;">Note: The book was too long to send entirely. This summary is based on the first ~20,000 words.</div>` : '';
                    aiResult.innerHTML = `<h2 style="margin-top:0;color:#0f172a;font-family:sans-serif;">AI Summary</h2>${truncateNotice}<div style="white-space:pre-wrap;color:#334155;line-height:1.6;font-family:sans-serif;font-size:14px;">${data.result}</div>`;
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    alert('AI Error: ' + (data.error || 'Unknown error'));
                }
            } catch (e) {
                console.error(e);
                alert('Failed to connect to AI backend. Make sure your Next.js server is running and the payload is not too large.');
            } finally {
                aiBtn.textContent = 'Summarize with AI';
                aiBtn.disabled = false;
            }
        });
    }

    const BATCH_SIZE = 3;
    const total = validPages.length;
    let index = 0;

    function renderBatch() {
        if (!container) return;

        const end = Math.min(index + BATCH_SIZE, total);
        for (let i = index; i < end; i++) {
            let currentStep = 'Initializing page rendering';
            let imageErrors = 0;
            try {
                const p = validPages[i];
                const currentPageText = p.meta.pageText || `Segment ${i+1}`;
                const currentChapter = p.meta.chapter || 'Unknown';

                // 1. Pre-process and check for blank content
                currentStep = 'Pre-parsing HTML content';
                const temp = document.createElement('div');
                temp.innerHTML = p.html;

                // Strip non-essential elements immediately
                const stripSelectors = [
                    'script', 'style', 'noscript', 'iframe', 'video', 'audio', 'object', 'embed',
                    'form', 'button', 'input', 'textarea', 'select', 'dialog', 'nav', 'footer',
                    '[role="dialog"]', '[role="alert"]', '[role="banner"]', '[role="navigation"]',
                    '.cookie-banner', '.popup', '.modal', '.advertisement', '.ads', '.social-share',
                    '#cookie-notice', '#gdpr', '.spinner', '[aria-busy="true"]', 'aside', '.vitalsource-ui'
                ];
                temp.querySelectorAll(stripSelectors.join(', ')).forEach(el => el.remove());

                // Visibility check (blank detection)
                const textClone = temp.cloneNode(true);
                textClone.querySelectorAll('.sr-only, [style*="display: none"], [style*="visibility: hidden"], [hidden]').forEach(el => el.remove());
                const visibleTextContent = textClone.textContent.replace(/\s+/g, '').trim();

                let hasSignificantMedia = false;
                const imgs = temp.querySelectorAll('img');
                for (const img of imgs) {
                    if (img.src && !img.src.includes('tracker') && !img.src.includes('pixel')) {
                        hasSignificantMedia = true;
                        break;
                    }
                }
                if (!hasSignificantMedia) {
                    const otherMedia = temp.querySelector('canvas, picture, video, audio, iframe, object, embed');
                    if (otherMedia) hasSignificantMedia = true;
                }
                if (!hasSignificantMedia) {
                    const svgs = temp.querySelectorAll('svg');
                    for (const svg of svgs) {
                        const width = svg.getAttribute('width') || svg.style.width;
                        const height = svg.getAttribute('height') || svg.style.height;
                        if ((!width || parseInt(width) > 24) && (!height || parseInt(height) > 24)) {
                            hasSignificantMedia = true;
                            break;
                        }
                    }
                }

                if (visibleTextContent.length < 30 && !hasSignificantMedia) {
                    totalStrippedCount++;
                    updateEraseNotice();
                    continue; // SKIP COMPLETELY
                }

                // 2. Resolve URLs and Styles
                const baseUrl = p.meta.url || 'https://example.com';
                const baseOrigin = new URL(baseUrl).origin;
                const lazyAttributes = ['data-original', 'data-src', 'data-lazy-src', 'data-url', 'lazy-src', 'src'];
                
                temp.querySelectorAll('img, source, picture').forEach(el => {
                    if (el.tagName === 'IMG' || el.tagName === 'SOURCE') {
                        let bestSrc = null;
                        for (const attr of lazyAttributes) {
                            const val = el.getAttribute(attr);
                            if (val && val !== 'null' && val !== 'undefined') {
                                bestSrc = val;
                                break;
                            }
                        }
                        if (bestSrc) {
                            if (bestSrc.startsWith('data:')) {
                                el.src = bestSrc;
                            } else {
                                try { el.src = new URL(bestSrc, baseUrl).href; } catch(e) {}
                            }
                        }
                        el.removeAttribute('srcset');
                        el.removeAttribute('loading');
                    }
                });

                // 3. Determine target container
                let targetDiv = null;
                const lastDiv = container.lastElementChild;
                const chapterChanged = lastDiv ? (lastDiv.getAttribute('data-chapter') !== currentChapter) : true;

                if (lastDiv && !chapterChanged) {
                    targetDiv = lastDiv;
                    const inlineHeader = document.createElement('div');
                    inlineHeader.style.cssText = 'text-align:right; font-size:10px; color:#94a3b8; border-top:1px dashed #e2e8f0; margin-top:24px; padding-top:8px; margin-bottom:16px; font-family:monospace; break-before:auto;';
                    inlineHeader.textContent = currentPageText;
                    targetDiv.querySelector('.pg-content').appendChild(inlineHeader);
                } else {
                    targetDiv = document.createElement('div');
                    targetDiv.className = 'pilot-page';
                    if (chapterChanged) targetDiv.classList.add('chapter-start');
                    targetDiv.setAttribute('data-page-id', currentPageText);
                    targetDiv.setAttribute('data-chapter', currentChapter);
                    targetDiv.innerHTML = `<div class="pg-content"></div>`;
                    container.appendChild(targetDiv);
                }

                // 4. Append clean content
                const contentArea = targetDiv.querySelector('.pg-content');
                const segment = document.createElement('div');
                segment.className = 'pg-segment';
                segment.style.marginBottom = '20px';
                segment.innerHTML = temp.innerHTML;
                contentArea.appendChild(segment);
                
                // Update header if there are warnings
                if (imageErrors > 0) {
                    const status = targetDiv.querySelector('.pg-header span:last-child');
                    if (status && !status.innerHTML.includes('⚠️')) {
                        status.innerHTML += ` <span style="color:#f59e0b;font-size:10px" title="${imageErrors} images failed">⚠️</span>`;
                    }
                }
            } catch (err) {
                console.error(`Error rendering page ${i + 1} during '${currentStep}':`, err);
                const errorDiv = document.createElement('div');
                errorDiv.className = 'pilot-page';
                errorDiv.innerHTML = `
                    <div class="pg-header">
                        <span>Error</span>
                        <span>SEQ ${i + 1}</span>
                    </div>
                    <div class="pg-content" style="color: #ef4444; text-align: center; padding: 40px; font-family: sans-serif;">
                        <h3 style="margin-top: 0;">Failed to render this page</h3>
                        <p style="color: #475569;">An error occurred while <strong>${currentStep.toLowerCase()}</strong>.</p>
                        <div style="font-size: 11px; color: #94a3b8; margin-top: 20px; font-family: monospace; background: #f8fafc; padding: 12px; border-radius: 6px; text-align: left; overflow-x: auto; border: 1px solid #e2e8f0;">
                            <strong style="color: #334155;">Error Details:</strong><br>
                            ${err.message}<br><br>
                            <strong style="color: #334155;">Source URL:</strong><br>
                            ${validPages[i]?.meta?.url || 'Unknown'}
                        </div>
                    </div>`;
                container.appendChild(errorDiv);
            }
        }

        index = end;

        if (progress) progress.textContent = `${index} / ${total} pages`;

        if (index < total) {
            // Yield to the browser between batches so it can paint
            setTimeout(renderBatch, 50);
        } else {
            if (printBtn) {
                printBtn.textContent = 'View PDF';
                printBtn.disabled = false;
            }
            if (aiBtn) {
                aiBtn.disabled = false;
            }
            if (progress) progress.textContent = `${total} pages ready`;
            
            // Clean up storage to free memory
            chrome.storage.local.remove('printDataCache');
        }
    }

    if (total > 0) {
        // Start rendering after a short delay
        setTimeout(renderBatch, 100);
    } else {
        progress.textContent = 'No pages to render.';
    }
});
