/**
 * Watchdog Service
 * Monitors the ripping process for stalls
 */

class WatchdogService {
  constructor() {
    this.checkInterval = 15000;
    this.lastCount = 0;
    this.lastUpdate = Date.now();
    this.timer = null;
    this.isRipping = false;
  }

  arm() {
    if (this.timer) return;
    this.isRipping = true;
    this.lastUpdate = Date.now();
    
    // Sync initial count safely
    this.lastCount = (window.PilotStorage && typeof window.PilotStorage.getCount === 'function') 
      ? window.PilotStorage.getCount() 
      : 0;

    console.log('[PilotWatchdog] Monitoring armed at count:', this.lastCount);
    this.timer = setInterval(() => this.checkStall(), this.checkInterval);
  }

  disarm() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRipping = false;
    console.log('[PilotWatchdog] Monitoring disarmed');
  }

  checkStall() {
    if (!this.isRipping) return;

    // Safety check for storage dependency
    const storage = window.PilotStorage;
    if (!storage || typeof storage.getCount !== 'function') {
      console.warn('[PilotWatchdog] Storage service missing. Retrying next tick.');
      return;
    }

    const currentCount = storage.getCount();
    const now = Date.now();

    if (currentCount > this.lastCount) {
      this.lastCount = currentCount;
      this.lastUpdate = now;
    } else {
      const idleTime = now - this.lastUpdate;
      if (idleTime > 30000) { // 30 seconds
        console.warn(`[PilotWatchdog] Stall detected (${Math.round(idleTime/1000)}s). Nudging...`);
        this.nudge();
      }
    }
  }

  nudge() {
    this.lastUpdate = Date.now(); // Prevent double-nudge
    if (window.PilotTurner && typeof window.PilotTurner.next === 'function') {
      window.PilotTurner.next();
    } else {
      console.error('[PilotWatchdog] Nudge failed: Turner missing');
    }
  }
}

window.PilotWatchdog = new WatchdogService();