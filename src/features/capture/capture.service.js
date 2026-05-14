/**
 * Content capture service
 */
import { logger } from '../../services/logger.service.js';
import { quickHash } from '../../services/utils.service.js';
import { stateManager } from '../state/state.manager.js';
import { messagingService } from '../../services/messaging.service.js';
import { contentDetector } from './content.detector.js';
import { htmlCleaner } from './html.cleaner.js';
import { navigationService } from '../navigation/turner.service.js';
import { uiService } from '../ui/ui.service.js';

const IS_TOP = window.top === window.self;

class CaptureService {
    constructor() {
        this.isSnapping = false;
        this.maxRetries = 15;
        this.spinnerWaitAttempts = 0;
    }

    getCurrentPageValue() {
        const input = document.querySelector('input[class*="InputControl__input"]');
        if (!input) {
            // Fallback to searching all inputs for a numeric or roman value
            const inputs = Array.from(document.querySelectorAll('input'));
            for (const i of inputs) {
                if (i.value && /^[ivx0-9]+$/i.test(i.value)) return i.value;
            }
        }
        return input ? input.value : null;
    }

    getAccuratePageLabel() {
        const pagebreaks = stateManager.getPagebreaks();
        if (!pagebreaks || pagebreaks.length === 0) return null;

        // First, try to find pagebreaks with element IDs that are currently visible
        for (const pb of pagebreaks) {
            if (!pb.cfi) continue;
            const idMatch = pb.cfi.match(/\[([^\];=]+)\]$/);
            if (idMatch) {
                const el = document.getElementById(idMatch[1]);
                if (el) {
                    const rect = el.getBoundingClientRect();
                    // Check if this page break marker is visible in the viewport
                    // More lenient bounds checking
                    if (rect.top >= -100 && rect.left >= -100 &&
                        rect.top < window.innerHeight + 100 &&
                        rect.left < window.innerWidth + 100) {
                        return pb.label;
                    }
                }
            }
        }

        // Fallback: Exact URL matching for fixed-layout EPUBs
        const path = new URL(location.href).pathname;
        const urlMatches = pagebreaks.filter(p => p.url && (path.includes(p.url) || path.endsWith(p.url)));
        if (urlMatches.length > 0) {
            return urlMatches[0].label;
        }

        // Additional fallback: Try to match by page number from URL hash
        const hash = location.hash;
        if (hash) {
            const pageMatch = hash.match(/page[=\/](\d+)/i);
            if (pageMatch) {
                const pageNum = pageMatch[1];
                const pageMatchPb = pagebreaks.find(p => p.label == pageNum || p.label == `Page ${pageNum}`);
                if (pageMatchPb) return pageMatchPb.label;
            }
        }

        return null;
    }

    getPageInfo() {
        let pageId, pageText;
        try {
            const slider = IS_TOP ? contentDetector.getSlider() : null;

            if (slider && slider.getAttribute) {
                pageId   = slider.getAttribute('aria-valuenow');
                pageText = slider.getAttribute('aria-valuetext');
            } else {
                // Use intercepted pagebreaks array to determine highly accurate page numbers natively
                const accurateLabel = this.getAccuratePageLabel();

                if (accurateLabel) {
                    pageId = accurateLabel;
                    pageText = 'Page ' + accurateLabel;
                } else {
                    // LEGACY FALLBACK
                    const pgEl = contentDetector.findDeep('.page-number, .vst-page-count, [data-page], .pbk-page-number');
                    pageId   = pgEl ? (pgEl.getAttribute('data-page') || pgEl.innerText.trim()) : location.href;
                    pageText = pgEl ? pgEl.innerText.trim() : (document.title || 'Page');
                }
            }
        } catch(e) {
            pageId   = location.href;
            pageText = document.title || 'Page';
        }

        // Final safety check to avoid "undefined" strings in UI
        if (!pageId) pageId = 'unknown-pg';
        if (!pageText || pageText === 'undefined') pageText = 'Current Page';

        return { pageId, pageText };
    }

    getChapterInfo() {
        const chEl = contentDetector.findDeep('.chapter-title, h1, h2, h3, .vst-chapter, .pc img, .title-block');
        let chapter = chEl ? (chEl.tagName === 'IMG' ? chEl.alt : chEl.innerText.trim()) : 'Book Content';

        // Final safety check for chapter string
        if (!chapter || chapter === 'undefined') chapter = 'Active Chapter';

        return chapter;
    }

    snap(target, finalHtml, force = false) {
        if (stateManager.getAutoPilot() && stateManager.getHasSnappedCurrentPage() && !force) {
            logger.log('DATA', 'Flip Lock Active: Already snapped this page cycle. Ignoring late DOM mutation.');
            return;
        }

        if (this.isSnapping) return;
        this.isSnapping = true;
        logger.log('DATA', `Capturing... (force=${force})`);

        try {
            if (!target) { logger.log('ERROR', 'snap() called with null target.'); return; }

            const { pageId, pageText } = this.getPageInfo();
            const chapter = this.getChapterInfo();

            if (!pageText || pageText.toLowerCase().includes('sync') || pageText.toLowerCase().includes('load')) {
                logger.log('SENSOR', 'Slider still syncing — deferring snap 500ms.');
                this.isSnapping = false;
                setTimeout(() => this.snapWithRetry(0, force), 500);
                return;
            }

            const sourceText  = contentDetector.getFingerprintSource(target);
            const pureTextStr = contentDetector.getPureContentText(target);
            const salt        = pageId + '|' + pageText;
            // Use full signature for small text pages to prevent false exact-duplicate detections on image pages
            const textHash    = pureTextStr.length > 50 ? quickHash(pureTextStr) : quickHash(salt + '|' + sourceText);
            const signature   = quickHash(salt + '|' + sourceText);

            if (!force) {
                // Level 1: Same exact DOM structure as 500ms ago? (Prevents stutter)
                if (signature === stateManager.getLastContentFP()) {
                    logger.log('DATA', 'Duplicate DOM fingerprint — skipping.');
                    this.isSnapping = false;
                    return;
                }

                // Level 2: Have we seen this exact text content ANYWHERE in this session?
                // This is the "Hard" deduplication fix.
                if (stateManager.hasSessionHash(textHash)) {
                    logger.log('DATA', `Duplicate filtered by Session History. Hash: ${textHash}`);
                    this.isSnapping = false;
                    stateManager.setHasSnappedCurrentPage(true); // Mark as done so we flip
                    return;
                }
            }

            stateManager.setLastContentFP(signature);
            stateManager.addSessionHash(textHash);

            stateManager.setLastContentFP(signature);
            stateManager.setLastTextHash(textHash);
            stateManager.setHasSnappedCurrentPage(true);
            logger.log('DATA', `Page: ${pageText} | Ch: ${chapter} | FP: ${signature}`);

            uiService.showVisualConfirmation(pageText);

            const styles = stateManager.getCapturedPageCount() === 0 ? htmlCleaner.getAbsoluteStyles() : '';
            stateManager.incrementCapturedPageCount();

            messagingService.sendData(finalHtml, styles, {
                pageId,
                pageText,
                chapter,
                fingerprint: signature,
                url: location.href,
                timestamp: Date.now()
            });
        } catch (err) {
            logger.log('ERROR', 'snap() threw:', err);
        } finally {
            this.isSnapping = false;
        }
    }

    snapWithRetry(attempt = 0, force = false) {
        // Boundary Check: Ensure we don't snap "one more" than requested
        if (stateManager.getAutoPilot() && stateManager.getAutoPilotStopPage()) {
            const cur = this.getCurrentPageValue();
            if (cur === stateManager.getAutoPilotStopPage()) {
                logger.log('AUTO', 'Boundary reached at snap time: ' + cur + '. Skipping snap and finishing chapter.');
                stateManager.configureEngine({ state: false });
                messagingService.sendChapterComplete(cur);
                return;
            }
        }

        if (IS_TOP) {
            // If there's a large iframe, assume the iframe will handle the snapping.
            const hasLargeIframe = Array.from(document.querySelectorAll('iframe')).some(f => {
                const r = f.getBoundingClientRect();
                return r.width > 300 && r.height > 300 && !f.src.includes('about:blank');
            });
            if (hasLargeIframe) {
                logger.log('SENSOR', 'Top frame deferring snap to child iframe.');
                return;
            }
        }

        if (this.isSnapping) {
            if (force && attempt < this.maxRetries) {
                setTimeout(() => this.snapWithRetry(attempt + 1, force), 300);
            }
            return;
        }

        if (stateManager.getIsTransitioning() && !force) {
            logger.log('SENSOR', 'Page is currently turning (Blind Spot active). Deferring capture.');
            setTimeout(() => this.snapWithRetry(attempt, force), 300);
            return;
        }

        if (!force) {
            // ENHANCED SPINNER CHECK
            const spinners = document.querySelectorAll([
                '[aria-busy="true"]', '.vst-spinner', '.pbk-page-loading',
                '.loading', '.spinner', '[data-testid*="loading"]',
                'img[src*="spin"]', '.skeleton', '.shimmer',
                '[role="progressbar"]', '.loader'
            ].join(', '));

            let isSpinning = false;
            for (let i = 0; i < spinners.length; i++) {
                const style = window.getComputedStyle(spinners[i]);
                if (spinners[i].offsetWidth > 0 && spinners[i].offsetHeight > 0 && style.visibility !== 'hidden' && style.display !== 'none') {
                    isSpinning = true;
                    break;
                }
            }

            if (isSpinning && this.spinnerWaitAttempts < 15) {
                this.spinnerWaitAttempts++;
                logger.log('SENSOR', `Spinner active. Deferring snap to prevent blank page... (${this.spinnerWaitAttempts}/15)`);
                setTimeout(() => this.snapWithRetry(attempt, force), 400);
                return;
            }
        }
        this.spinnerWaitAttempts = 0;

        let target = stateManager.getCustomSelector() ? contentDetector.findDeep(stateManager.getCustomSelector()) : contentDetector.autoDetectContent(force);

        if (stateManager.getCustomSelector() && !force && !contentDetector.isContentValid(target)) {
            target = null;
        }

        // ENHANCED ASSET LOADING CHECK
        if (target && !force) {
            let assetsPending = false;
            const imgs = target.querySelectorAll('img');
            for (let i = 0; i < imgs.length; i++) {
                if (!imgs[i].complete && imgs[i].src && !imgs[i].src.includes('data:image')) {
                    assetsPending = true;
                    break;
                }
            }

            if (assetsPending) {
                logger.log('SENSOR', 'Images are still loading. Deferring capture.');
                setTimeout(() => this.snapWithRetry(attempt, force), 300);
                return;
            }
        }

        if (target && !force) {
            const currentFP = quickHash(contentDetector.getFingerprintSource(target));

            // CHECK: Is the content still in "token" or "placeholder" state?
            // We only wait for a few cycles before giving up (might be false positive)
            if (!contentDetector.isContentValid(target) && attempt < 4) {
                stateManager.setStabilizeReady(false);
                logger.log('SENSOR', `Content looks like placeholders/tokens (Attempt ${attempt}/4). Waiting...`);
                setTimeout(() => this.snapWithRetry(attempt + 1, force), 600);
                return;
            }

            if (currentFP !== stateManager.getStabilizeFP()) {
                stateManager.setStabilizeFP(currentFP);
                stateManager.setStabilizeReady(false);
                logger.log('SENSOR', 'DOM is mutating. Waiting for stabilization...');
                setTimeout(() => this.snapWithRetry(attempt, force), 200); // Reduced stabilization time
                return;
            } else if (!stateManager.getStabilizeReady()) {
                stateManager.setStabilizeReady(true);
                logger.log('SENSOR', 'DOM stabilized. Proceeding with capture.');
                setTimeout(() => this.snapWithRetry(attempt, force), 100); // Reduced final wait
                return;
            }
        }

        let finalHtml = '';
        if (target && !force) {
            finalHtml = htmlCleaner.cleanAndResolveHTML(target);
            const temp = document.createElement('div');
            temp.innerHTML = finalHtml;

            const pureText = contentDetector.getPureContentText(temp);
            const lowerText = temp.textContent ? temp.textContent.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
            const hasValidMedia = contentDetector.containsValidMedia(target);

            // ENHANCED CONTENT VALIDITY CHECK
            if ((pureText.length < 150 && !hasValidMedia) || lowerText.includes('loading') || lowerText.includes('pleasewait') || lowerText.includes('syncing')) {
                logger.log('SENSOR', `Ghost Wrapper detected: Insufficient content (Text: ${pureText.length}, Media: ${hasValidMedia}). Rejecting.`);
                target = null;
            }
        } else if (target) {
            finalHtml = htmlCleaner.cleanAndResolveHTML(target);
            const temp = document.createElement('div');
            temp.innerHTML = finalHtml;
            const pureText = contentDetector.getPureContentText(temp);
            const lowerText = (temp.textContent || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if ((pureText.length < 150 && !contentDetector.containsValidMedia(target)) || lowerText.includes('loading') || lowerText.includes('syncing')) {
                logger.log('SENSOR', 'Force snap rejected — content still blank/transitional. Retrying...');
                target = null;
            }
        }

        if (!target) {
            stateManager.setStabilizeFP('');
            stateManager.setStabilizeReady(false);

            if (attempt < this.maxRetries) {
                const delay = 400 * (attempt + 1);
                logger.log('SENSOR', `Content not ready, retry ${attempt + 1}/${this.maxRetries} in ${delay}ms`);
                setTimeout(() => this.snapWithRetry(attempt + 1, force), delay);
            } else {
                logger.log('ERROR', 'Snap exhausted retries — no valid content rendered. Forcing flip to prevent stall.');
                if (stateManager.getAutoPilot()) setTimeout(() => navigationService.triggerNext(), 1000);
            }
            return;
        }

        stateManager.setStabilizeFP('');
        stateManager.setStabilizeReady(false);

        this.snap(target, finalHtml, force);
    }

    scheduleSnap(delay = 800) {
        setTimeout(() => this.snapWithRetry(), delay);
    }
}

export const captureService = new CaptureService();