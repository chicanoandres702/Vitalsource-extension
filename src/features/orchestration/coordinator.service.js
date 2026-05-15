import logger from '../../services/logger.service.js';
import navigationService from '../navigation/turner.service.js';
import captureService from '../capture/capture.service.js';
import stateManager from '../state/state.manager.js';
import { isExtensionAlive, quickHash, delay } from '../../services/utils.service.js';
import { captureMetadata } from '../capture/capture.metadata.js';
import { coordinatorValidator } from './coordinator.validator.js';
import contentDetector from '../capture/content.detector.js';

/**
 * CoordinatorService
 *
 * Flow per page:
 *   1. Turn the page (navigate).
 *   2. Wait a minimum of 3 seconds for VitalSource to finish decryption.
 *   3. Poll until content is valid and stable for STABLE_ROUNDS consecutive checks.
 *   4. Capture, then repeat.
 */
class CoordinatorService {
  constructor() {
    this.isRunning = false;

    // Hard minimum wait after navigation before polling starts (ms)
    this.MIN_DECRYPT_WAIT = 15000;
    // Interval between each poll attempt (ms)
    this.POLL_INTERVAL = 400;
    // How many consecutive identical reads counts as "stable"
    this.STABLE_ROUNDS = 3;
    // Give up after this many polls (~80 s total at 400 ms)
    this.MAX_POLLS = 200;

    this.lastCaptureHash = '';
  }

  init(sendCommand, flipDelay) {
    this.sendCommand = sendCommand;
    this.flipDelay = flipDelay;
  }

  setDelay(delay) {
    this.flipDelay = delay;
  }

  handleSpinnerStatus(visible) {
    // Update spinner visibility state if needed
    this.spinnerVisible = visible;
  }

  handleContentReady() {
    // Signal that content is ready, possibly trigger next action
  }

  handleCaptureData(data) {
    // Handle capture data - this might integrate with captureService
    logger.log('NAV', 'Coordinator handling capture data:', data.meta);
  }

  abort() {
    this.stopAutomation();
  }

  triggerTurn() {
    // Trigger the next turn in the process
    this.advance();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  async startAutomation() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastCaptureHash = '';
    logger.log('NAV', 'Automation started.');
    try {
      await this.runLoop();
    } catch (err) {
      logger.error('Automation crashed:', err);
    } finally {
      this.stopAutomation();
    }
  }

  stopAutomation() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (isExtensionAlive()) {
        chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', message: 'Standby' }).catch(() => {});
    }
    logger.log('NAV', 'Automation stopped.');
  }

  // ─── Main loop ───────────────────────────────────────────────────────────────

  async runLoop() {
    while (this.isRunning && isExtensionAlive()) {
        if (!(await this.waitForReady())) break;

        const page = stateManager.getCurrentPage();
        const text = await this.pollForStability(page);
        if (!text) break;

        const hash = quickHash(text);
        if (hash !== this.lastCaptureHash) {
            this.lastCaptureHash = hash;
            await captureService.captureCurrentView();
        }

        const stop = stateManager.getAutoPilotStopPage();
        if (stateManager.isAtEnd() || (stop && page === stop)) break;
        if (!(await this.advance())) break;
    }
  }

  async waitForReady() {
    const waitSec = Math.round(this.MIN_DECRYPT_WAIT / 1000);
    for (let i = waitSec; i > 0 && this.isRunning; i--) {
        this.broadcastStatus(`Wait: ${i}s (Decrypting)`, (i / waitSec) * 100);
        await delay(1000);
    }
    this.broadcastStatus('Polling...', 0);
    return this.isRunning;
  }

  // ─── Stability polling ────────────────────────────────────────────────────────

  /**
   * Polls until content is valid AND unchanged for STABLE_ROUNDS checks in a row.
   */
  async pollForStability(page) {
    let stableRounds = 0;
    let lastSeen = '';

    for (let attempt = 0; attempt < this.MAX_POLLS && this.isRunning; attempt++) {
      const text = contentDetector.getRawPageText();
      const isInvalid = coordinatorValidator.isInvalid(text);

      if (isInvalid) {
        stableRounds = 0;
        lastSeen = '';
        await this.delay(this.POLL_INTERVAL);
        continue;
      }

      if (text === lastSeen) {
        stableRounds++;
        if (stableRounds >= this.STABLE_ROUNDS) {
          logger.log('NAV', `Page ${page}: content stable after ${attempt + 1} polls.`);
          return text;
        }
      } else {
        // Content changed — restart streak with the new text.
        stableRounds = 1;
        lastSeen = text;
      }

      await this.delay(this.POLL_INTERVAL);
    }

    return null; // timed out
  }

  async advance() {
    const moved = await navigationService.nextPage();
    if (!moved) {
      logger.error('Turner failed to advance.');
      this.stopAutomation();
    }
    return moved;
  }

  broadcastStatus(message, progress) {
    chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', message }, () => {
      if (chrome.runtime.lastError) {}
    });
    chrome.runtime.sendMessage({ type: 'PROGRESS_UPDATE', progress }, () => {
      if (chrome.runtime.lastError) {}
    });
  }
}

export const coordinatorService = new CoordinatorService();
