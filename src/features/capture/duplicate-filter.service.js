/**
 * Duplicate Filter Service
 * Handles Level 1 (Fingerprint sequence) and Level 2 (Session History) deduplication.
 */

import stateManager from '../state/state.manager.js';
import logger from '../../services/logger.service.js';
import { quickHash } from '../../services/utils.service.js';
import { DEDUPE_THRESHOLDS } from './capture.constants.js';

export const duplicateFilterService = {
    computeSignatures(pageId, pageText, pureTextStr, sourceText) {
        const salt = pageId + '|' + pageText;
        
        const isLongEnough = pureTextStr.length > DEDUPE_THRESHOLDS.MIN_TEXT_LENGTH_FOR_HASH;
        const textHash = isLongEnough ? quickHash(pureTextStr) : quickHash(salt + '|' + sourceText);
        
        const signature = quickHash(salt + '|' + sourceText);
        return { textHash, signature };
    },

    isDuplicate(signature, textHash) {
        // Level 1: Same exact DOM structure as 500ms ago? (Prevents stutter)
        if (signature === stateManager.getLastContentFP()) {
            logger.log('DATA', 'Duplicate DOM fingerprint — skipping.');
            return 'level1';
        }

        // Level 2: Have we seen this exact text content ANYWHERE in this session?
        if (stateManager.hasSessionHash(textHash)) {
            logger.log('DATA', `Duplicate filtered by Session History. Hash: ${textHash}`);
            return 'level2';
        }

        return false;
    },

    commitSignatures(signature, textHash) {
        stateManager.setLastContentFP(signature);
        stateManager.addSessionHash(textHash);
        stateManager.setLastTextHash(textHash);
    }
};
export default duplicateFilterService;
