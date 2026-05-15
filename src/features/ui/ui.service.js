/**
 * UI service for picker and visual confirmations
 */
import logger from '../../services/logger.service.js';
import { pierceShadowAtPoint } from '../../services/utils.service.js';
import stateManager from '../state/state.manager.js'; // This is a default import, keep as is
import messagingService from '../../services/messaging.service.js';
import { toastService } from './toast.service.js';
import elementPicker from './element-picker.service.js';

class UiService {
    constructor() { this.deepScan = false; }

    /**
     * Design Intent: Standardized entry point for the sidebar orchestrator.
     * Prevents "init is not a function" TypeErrors.
     */
    init() {
        logger.log('UI', 'UI Service Active');
    }

    /**
     * Design Intent: Proxy to extracted picker logic to maintain 
     * clean module boundaries and comply with 100-line law.
     */
    activatePicker() {
        elementPicker.activate();
    }

    showVisualConfirmation(label) {
        toastService.showVisualConfirmation(label);
    }
}

export default new UiService();