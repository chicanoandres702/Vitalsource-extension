import logger from '../../services/logger.service.js';
import captureService from '../capture/capture.service.js';
import stateManager from '../state/state.manager.js';
import { isExtensionAlive, delay } from '../../services/utils.service.js';
import { waitForReady } from './strategies/ready.waiter.js';
import { pollForStability } from './strategies/stability.poller.js';
import { advancePage } from './strategies/page.advancer.js';
import contentDetector from '../capture/content.detector.js';
import { coordinatorValidator } from './coordinator.validator.js';

/**
 * CoordinatorService (Thin Orchestrator)
 * Composes small reusable strategies for autonomous mode.
 */
class CoordinatorService {
  constructor() {
    this.isRunning = false;
    this.lastCaptureHash = '';
    this.sendCommand = null;
    this.flipDelay = 500;
  }

  init(sendCommand, flipDelay) {
    this.sendCommand = sendCommand;
    this.flipDelay = flipDelay;
  }

  async startAutomation() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.log('NAV', 'Automation started.');
    try {
      await this.runLoop();
    } finally {
      this.stopAutomation();
    }
  }

  stopAutomation() {
    if (!this.isRunning) return;
    this.isRunning = false;
    logger.log('NAV', 'Automation stopped.');
  }

  abort() {
    this.stopAutomation();
  }

  handleCaptureData(data) {
    // Design Intent: Allows the sidebar to notify the coordinator when new capture data arrives.
    logger.log('NAV', 'Coordinator handling capture data:', data?.meta?.pageText || 'unknown');
  }

  setDelay(ms) {
    this.flipDelay = ms || this.flipDelay;
  }

  handleSpinnerStatus(visible) {
    // Design Intent: Placeholder for UI spinner sync.
  }

  handleContentReady() {
    // Design Intent: Placeholder for content-ready signal.
  }

  async runLoop() {
    let firstPage = true;
    while (this.isRunning && isExtensionAlive()) {
      // Bypass 15s decrypt wait on first page — snap immediately like Legacy mode
      if (!firstPage) {
        const ready = await waitForReady(15000, () => this.isRunning);
        if (!ready) break;
      }
      firstPage = false;

      const text = await pollForStability(
        () => contentDetector.getRawPageText(),
        coordinatorValidator.isInvalid,
        () => delay(400),
        200,
        3,
        () => this.isRunning
      );
      if (!text) break;

      const hash = (text || '').length;
      if (hash !== this.lastCaptureHash) {
        this.lastCaptureHash = hash;
        await captureService.captureCurrentView();
      }

      if (stateManager.isAtEnd()) break;
      const moved = await advancePage();
      if (!moved) break;
    }
  }
}

export const coordinatorService = new CoordinatorService();
