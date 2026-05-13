/**
 * Watchdog Service
 * Monitors the ripping process for stalls and attempts to nudge the automation
 */

class WatchdogService {
  constructor() {
    this.checkInterval = 15000; // 15 seconds
    this.lastCount = 0;
    this.lastUpdate = Date.now();
    this.timer = null;
    this.isRipping = false;
  }

  // Orchestrator calls 'arm' to start monitoring
  arm() {
    this.start();
  }

  // Orchestrator calls 'disarm' to stop monitoring
  disarm() {
    this.stop();
  }

  start() {
    if (this.timer) return;
    this.isRipping = true;
    this.lastUpdate = Date.now();
    this.lastCount = 0;
    console.log('[PilotWatchdog] Monitoring armed');
    
    // Initial sync of current count if storage exists
    if (window.PilotStorage && typeof window.PilotStorage.getCount === 'function') {
      window.PilotStorage.getCount().then(count => {
        this.lastCount = count;
      });
    }

    this.timer = setInterval(() => this.checkStall(), this.checkInterval);
  }

  stop() {
    console.log('[PilotWatchdog] Monitoring disarmed');
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRipping = false;
  }

  async checkStall() {
    if (!this.isRipping) return;

    // Safety check for dependencies
    if (!window.PilotStorage || typeof window.PilotStorage.getCount !== 'function') {
      console.warn('[PilotWatchdog] PilotStorage or getCount is not available');
      return;
    }

    try {
      const currentCount = await window.PilotStorage.getCount();
      const now = Date.now();

      if (currentCount > this.lastCount) {
        this.lastCount = currentCount;
        this.lastUpdate = now;
      } else {
        const idleTime = now - this.lastUpdate;
        if (idleTime > 30000) { // 30 seconds of no progress
          console.warn(`[PilotWatchdog] Stall detected (${Math.round(idleTime/1000)}s). Attempting nudge...`);
          this.nudge();
        }
      }
    } catch (error) {
      console.error('[PilotWatchdog] Error during stall check:', error);
    }
  }

  nudge() {
    // Reset timer to prevent rapid-fire nudging
    this.lastUpdate = Date.now();
    
    // Trigger a page turn if the turner is available
    if (window.PilotTurner && typeof window.PilotTurner.next === 'function') {
      window.PilotTurner.next();
    } else {
      console.error('[PilotWatchdog] Nudge failed: PilotTurner.next not available');
    }
  }
}

// Global instance
window.PilotWatchdog = new WatchdogService();