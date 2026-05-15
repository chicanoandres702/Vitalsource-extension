/**
 * Capture Engine Service
 * Design Intent: Pure execution of content extraction, deduplication, and transmission.
 */
import { stateManager } from '../state/state.manager.js';
import { messagingService } from '../../services/messaging.service.js';
import { contentDetector } from './content.detector.js';
import { htmlCleaner } from './html.cleaner.js';
import { uiService } from '../ui/ui.service.js';
import { captureMetadata } from './capture.metadata.js';
import { duplicateFilterService } from './duplicate-filter.service.js';
import { isExtensionAlive } from '../../services/utils.service.js';

export const captureEngine = {
    /**
     * Performs the technical capture of a detected content target.
     * @param {Element} target 
     * @param {string} finalHtml 
     * @param {boolean} force 
     * @returns {string|boolean} 'retry' if data is sync-locked, true if captured, false if skipped.
     */
    executeCapture(target, finalHtml, force = false) {
        if (!isExtensionAlive()) return false;

        const { pageId, pageText } = captureMetadata.getPageInfo();
        
        // Gate: Prevent capturing during internal VS sync/load states
        if (!force && /unknown|sync|load|fetching/i.test(pageId + pageText)) {
            return 'retry';
        }

        const sourceText = contentDetector.getFingerprintSource(target);
        const pureText = contentDetector.getPureContentText(target);
        const { textHash, signature } = duplicateFilterService.computeSignatures(pageId, pageText, pureText, sourceText);

        // Gate: Level 1 & 2 Duplicate Filtering
        if (!force && duplicateFilterService.isDuplicate(signature, textHash)) {
            return false;
        }

        duplicateFilterService.commitSignatures(signature, textHash);
        stateManager.setHasSnappedCurrentPage(true);
        
        // UI Feedback & Transmission
        requestAnimationFrame(() => uiService.showVisualConfirmation(pageText));
        
        const styles = stateManager.getCapturedPageCount() === 0 ? htmlCleaner.getAbsoluteStyles() : '';
        stateManager.incrementCapturedPageCount();
        messagingService.sendData(finalHtml, styles, { pageId, pageText, chapter: captureMetadata.getChapterInfo(), fingerprint: signature, url: location.href, timestamp: Date.now() });
        return true;
    }
};