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

// Utility for professional logging
const log = (step, msg) => console.log(`[PilotPro] ${step}: ${msg}`);

// Fetch the print data from local storage
let loaded = false;
setTimeout(() => {
    if (!loaded) {
        console.log('[Print] Storage timeout');
        const progress = document.getElementById('progress');
        if (progress) progress.textContent = 'Error: Extension context lost. Please reload the extension.';
    }
}, 3000);

chrome.storage.local.get(['printDataCache'], (result) => {
    loaded = true;
    console.log('[Print] Storage result:', result);
    const data = result.printDataCache;
    const progress = document.getElementById('progress');
    const container = document.getElementById('page-container');
    const printBtn = document.getElementById('print-btn');
    const aiBtn = document.getElementById('ai-btn');
    const eraseNotice = document.getElementById('erase-notice');

    if (!data || !data.validPages || data.validPages.length === 0) {
        console.log('[Print] No data or empty pages:', data);
        if (progress) progress.textContent = 'Error: No valid pages found.';
        if (container) {
            container.innerHTML = `<div style="text-align:center; padding: 100px 20px;">
                <h2>No Pages Captured</h2>
                <p>Please capture sections before assembling.</p>
            </div>`;
        }
        return;
    }

    const { validPages, globalStyles, strippedCount, bookMetadata } = data;
    let totalStrippedCount = strippedCount || 0;

    const styleEl = document.getElementById('global-styles');
    if (globalStyles && styleEl) styleEl.textContent = globalStyles;

    // Set document title for PDF generation
    if (bookMetadata?.title) {
        document.title = bookMetadata.title;
    }

    function updateEraseNotice() {
        if (eraseNotice && totalStrippedCount > 0) {
            eraseNotice.textContent = `(${totalStrippedCount} blank sections filtered)`;
        }
    }
    updateEraseNotice();

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

    // 1. Create Cover Page if metadata exists
    if (bookMetadata && container) {
        const coverPage = document.createElement('div');
        coverPage.className = 'pilot-page';
        coverPage.style.textAlign = 'center';
        coverPage.style.display = 'flex';
        coverPage.style.flexDirection = 'column';
        coverPage.style.justifyContent = 'center';
        coverPage.style.alignItems = 'center';
        coverPage.style.minHeight = '1000px'; // Ensure it fills the page
        coverPage.style.padding = '80px 40px';
        
        let coverHtml = '';
        if (bookMetadata.cover) {
            coverHtml = `<img src="${bookMetadata.cover}" style="max-width: 80%; max-height: 700px; border-radius: 8px; box-shadow: 0 20px 50px rgba(0,0,0,0.3); margin-bottom: 60px;" alt="Book Cover">`;
        } else {
            coverHtml = `<div style="width: 300px; height: 450px; background: linear-gradient(135deg, #1e293b, #0f172a); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 60px; box-shadow: 0 20px 50px rgba(0,0,0,0.3);">
                <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" opacity="0.2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
            </div>`;
        }

        const title = bookMetadata.title || 'Untitled Book';
        const author = bookMetadata.author ? `<div style="font-family: 'Inter', sans-serif; font-size: 24px; color: #64748b; margin-top: 10px;">${bookMetadata.author}</div>` : '';

        coverPage.innerHTML = `
            ${coverHtml}
            <h1 style="font-family: 'Outfit', sans-serif; font-size: 48px; font-weight: 800; color: #0f172a; margin: 0; line-height: 1.2; max-width: 90%;">${title}</h1>
            ${author}
            <div style="margin-top: 100px; font-family: 'Inter', sans-serif; font-size: 14px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em;">
                Archived with PilotPro &bull; ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
        `;
        container.appendChild(coverPage);
    }

    // 2. Create AI result container
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
        console.log('[Print] Rendering batch:', index, 'to', Math.min(index + BATCH_SIZE, total));

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
                            const finalSrc = bestSrc.startsWith('data:') ? bestSrc : new URL(bestSrc, baseUrl).href;
                            el.src = finalSrc;
                            // Add a robust retry mechanism
                            el.onerror = function() {
                                if (this.src.startsWith('http') && !this.dataset.retried) {
                                    this.dataset.retried = 'true';
                                    const alt = this.src.includes('vitalsource') ? this.src.replace(/vitalsource.*?\//, '') : this.src;
                                    log('Image', `Retrying failed image: ${this.src}`);
                                    setTimeout(() => { this.src = finalSrc + '?retry=' + Date.now(); }, 1000);
                                }
                            };
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
                    // Only add a very subtle separator for internal page breaks
                    const hr = document.createElement('hr');
                    hr.style.cssText = 'border:none; border-top:1px dashed #f1f5f9; margin:24px 0; opacity:0.5;';
                    targetDiv.querySelector('.pg-content').appendChild(hr);
                } else {
                    targetDiv = document.createElement('div');
                    targetDiv.className = 'pilot-page';
                    if (chapterChanged) targetDiv.classList.add('chapter-start');
                    targetDiv.setAttribute('data-chapter', currentChapter);
                    targetDiv.innerHTML = `<div class="pg-content"></div>`;
                    container.appendChild(targetDiv);
                }

                // 4. Append clean content
                const contentArea = targetDiv.querySelector('.pg-content');
                const segment = document.createElement('div');
                segment.className = 'pg-segment';
                segment.innerHTML = temp.innerHTML;
                contentArea.appendChild(segment);
            } catch (err) {
                console.error(`Error rendering page:`, err);
            }
        }

        index = end;

        if (progress) progress.textContent = `${index} / ${total} pages`;

        if (index < total) {
            // Yield to the browser between batches so it can paint
            setTimeout(renderBatch, 50);
        } else {
            console.log('[Print] Rendering complete');
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
