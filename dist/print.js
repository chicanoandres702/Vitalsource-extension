document.getElementById('print-btn').addEventListener('click', () => {
    window.print();
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
                
                // Create a temporary container to clean the HTML
                currentStep = 'Parsing HTML content';
                const temp = document.createElement('div');
                temp.innerHTML = p.html;
                
                // 0. Extract images from noscript tags (often used for lazy-loading fallbacks)
                currentStep = 'Extracting images from noscript tags';
                temp.querySelectorAll('noscript').forEach(noscript => {
                    const content = noscript.textContent || noscript.innerHTML;
                    if (content.includes('<img')) {
                        const tempDoc = new DOMParser().parseFromString(content, 'text/html');
                        const imgs = tempDoc.querySelectorAll('img');
                        if (imgs.length > 0) {
                            const wrapper = document.createElement('div');
                            imgs.forEach(img => wrapper.appendChild(img));
                            noscript.parentNode.insertBefore(wrapper, noscript);
                        }
                    }
                });

                // 1. Fix image URLs and lazy loading
                currentStep = 'Resolving image URLs and fixing lazy loading';
                const baseUrl = p.meta.url || 'https://example.com';
                const baseOrigin = new URL(baseUrl).origin;
                const lazyAttributes = ['data-original', 'data-src', 'data-lazy-src', 'data-url', 'lazy-src', 'src'];
                
                temp.querySelectorAll('img, source, picture').forEach(el => {
                    if (el.tagName === 'IMG' || el.tagName === 'SOURCE') {
                        let bestSrc = null;
                        const originalSrc = el.getAttribute('src');
                        
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
                                try {
                                    el.src = new URL(bestSrc, baseUrl).href;
                                    
                                    // Set up fallbacks for retry mechanism
                                    const fallbacks = [];
                                    
                                    // Fallback 1: Try the original src if it was different
                                    if (originalSrc && originalSrc !== bestSrc && !originalSrc.startsWith('data:')) {
                                        try {
                                            const origUrl = new URL(originalSrc, baseUrl).href;
                                            if (origUrl !== el.src) fallbacks.push(origUrl);
                                        } catch(e) {}
                                    }
                                    
                                    // Fallback 2: Try resolving against the root origin
                                    try {
                                        const originUrl = new URL(bestSrc, baseOrigin).href;
                                        if (originUrl !== el.src && !fallbacks.includes(originUrl)) {
                                            fallbacks.push(originUrl);
                                        }
                                    } catch(e) {}
                                    
                                    if (fallbacks.length > 0) {
                                        el.setAttribute('data-fallback-urls', JSON.stringify(fallbacks));
                                    }
                                } catch(e) {
                                    imageErrors++;
                                    console.warn(`Could not resolve image URL: ${bestSrc}`);
                                }
                            }
                        }
                        el.removeAttribute('srcset'); // Remove srcset to force fallback to src
                        el.removeAttribute('sizes');
                        el.removeAttribute('loading'); // Disable native lazy loading
                        
                        // Clean up lazy attributes so they don't interfere
                        lazyAttributes.forEach(attr => {
                            if (attr !== 'src') el.removeAttribute(attr);
                        });
                    }
                });

                // 2. Strip non-essential elements
                currentStep = 'Stripping non-essential elements';
                const stripSelectors = [
                    'script', 'style', 'noscript', 'iframe', 'video', 'audio', 'object', 'embed',
                    'form', 'button', 'input', 'textarea', 'select', 'dialog', 'nav', 'footer',
                    '[role="dialog"]', '[role="alert"]', '[role="banner"]', '[role="navigation"]',
                    '.cookie-banner', '.popup', '.modal', '.advertisement', '.ads', '.social-share',
                    '#cookie-notice', '#gdpr', '.spinner', '[aria-busy="true"]'
                ];
                temp.querySelectorAll(stripSelectors.join(', ')).forEach(el => el.remove());

                // 3. Clean up inline styles that break PDF layouts and fix background images
                currentStep = 'Cleaning up inline styles and background images';
                temp.querySelectorAll('*').forEach(el => {
                    const style = el.getAttribute('style');
                    if (style) {
                        let cleanedStyle = style
                            .replace(/position\s*:\s*(fixed|absolute|sticky)\s*;?/gi, 'position: relative;')
                            .replace(/overflow\s*:\s*(hidden|scroll|auto)\s*;?/gi, 'overflow: visible;')
                            .replace(/max-height\s*:\s*[^;]+;?/gi, 'max-height: none;')
                            .replace(/transform\s*:\s*[^;]+;?/gi, 'transform: none;')
                            .replace(/transition\s*:\s*[^;]+;?/gi, 'transition: none;');
                        
                        // Fix relative background image URLs
                        cleanedStyle = cleanedStyle.replace(/url\(['"]?(.*?)['"]?\)/gi, (match, url) => {
                            if (url && !url.startsWith('data:')) {
                                try {
                                    return `url('${new URL(url, baseUrl).href}')`;
                                } catch(e) {
                                    imageErrors++;
                                    console.warn(`Could not resolve background image URL: ${url}`);
                                }
                            }
                            return match;
                        });
                        
                        el.setAttribute('style', cleanedStyle);
                    }
                });

                // 4. Check if page is significantly blank
                currentStep = 'Checking for blank content';
                
                // Remove invisible text (like screen reader text) before checking length
                const textClone = temp.cloneNode(true);
                textClone.querySelectorAll('.sr-only, [style*="display: none"], [style*="visibility: hidden"], [hidden]').forEach(el => el.remove());
                const visibleTextContent = textClone.textContent.replace(/\s+/g, '').trim();
                
                // Check for significant media that indicates the page isn't blank
                // We exclude tiny tracking pixels or decorative SVGs
                let hasSignificantMedia = false;
                
                // Check images
                const imgs = temp.querySelectorAll('img');
                for (const img of imgs) {
                    // If it has a real source and isn't explicitly tiny, count it
                    if (img.src && !img.src.includes('tracker') && !img.src.includes('pixel')) {
                        hasSignificantMedia = true;
                        break;
                    }
                }
                
                // Check other media types
                if (!hasSignificantMedia) {
                    const otherMedia = temp.querySelector('canvas, picture, video, audio, iframe, object, embed');
                    if (otherMedia) hasSignificantMedia = true;
                }
                
                // Check for significant SVGs (not just tiny icons)
                if (!hasSignificantMedia) {
                    const svgs = temp.querySelectorAll('svg');
                    for (const svg of svgs) {
                        const width = svg.getAttribute('width') || svg.style.width;
                        const height = svg.getAttribute('height') || svg.style.height;
                        // If it has explicit dimensions that aren't tiny, or no explicit dimensions (might be responsive)
                        if ((!width || parseInt(width) > 24) && (!height || parseInt(height) > 24)) {
                            hasSignificantMedia = true;
                            break;
                        }
                    }
                }
                
                // Check for significant background images (excluding gradients or tiny patterns)
                if (!hasSignificantMedia) {
                    const bgElements = temp.querySelectorAll('[style*="background-image"]');
                    for (const el of bgElements) {
                        const bgImage = el.style.backgroundImage;
                        if (bgImage && bgImage.includes('url(') && !bgImage.includes('data:image/svg+xml')) {
                            hasSignificantMedia = true;
                            break;
                        }
                    }
                }
                
                // A page is considered blank if it has very little visible text AND no significant media
                if (visibleTextContent.length < 30 && !hasSignificantMedia) {
                    totalStrippedCount++;
                    updateEraseNotice();
                    continue; // Skip rendering this page
                }

                currentStep = 'Building final page DOM';
                const div = document.createElement('div');
                div.className = 'pilot-page';
                
                let warningHtml = '';
                if (imageErrors > 0) {
                    warningHtml = `<span style="color: #f59e0b; font-size: 10px; margin-left: 8px; font-weight: normal;" title="${imageErrors} image(s) failed to resolve">⚠️ ${imageErrors} image issue(s)</span>`;
                }

                div.innerHTML = `
                    <div class="pg-header">
                        <span>${p.meta.chapter}</span>
                        <span>${p.meta.pageText} &nbsp;|&nbsp; SEQ ${i + 1} ${warningHtml}</span>
                    </div>
                    <div class="pg-content">${temp.innerHTML}</div>`;
                container.appendChild(div);
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
            // All pages rendered — enable print
            if (printBtn) {
                printBtn.textContent = 'Save as PDF';
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
