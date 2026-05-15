/**
 * Automation Service
 * Design Intent: Orchestrates the stability loop and page-turning logic.
 * interface for the stability loop and page-turning logic.
 */

import logger from '../../services/logger.service.js';

class AutomationService {
    constructor() {
        this.isRunning = false;
        this.sendCommand = null;
        this.delayTime = 1200;
        this.lastCaptureHash = '';
    }

    /**
     * Design Intent: Interface required by the Sidebar Orchestrator.
     */
    init(sendCommand, delayTime) {
        this.sendCommand = sendCommand;
        this.delayTime = delayTime;
        logger.log('UI', 'Automation Engine Initialized');
    }

    setDelay(ms) {
        this.delayTime = ms;
    }

    abort() {
        this.isRunning = false;
        logger.log('UI', 'Automation Aborted');
    }

    /**
     * Design Intent: Internal utility to prevent 'is not a function' errors 
     * during stability polling.
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        logger.log('UI', 'Automation Loop Started');
        // Design Intent: Implementation of runLoop() will follow in the next iteration.
    }
}

export const automationService = new AutomationService();