/**
 * VitalSource Pilot Pro - Orchestrator
 * Manages the high-level workflow and state
 */

(function() {
  console.log('[Pilot] Orchestrator active.');

  const Orchestrator = {
    isInitialized: false,

    init() {
      if (this.isInitialized) return;
      
      // Safety check for chrome.runtime (handles orphaned scripts after extension reload)
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) {
        console.warn('[Pilot] Extension context invalidated. Please refresh the page.');
        return;
      }

      this.setupListeners();
      this.isInitialized = true;
      console.log('[Pilot] Orchestrator fully initialized.');
    },

    setupListeners() {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        // Guard against internal errors if context dies mid-execution
        try {
          switch (request.action) {
            case 'START_RIP':
              this.startRipping(request.options);
              sendResponse({ status: 'started' });
              break;
            case 'STOP_RIP':
              this.stopRipping();
              sendResponse({ status: 'stopped' });
              break;
            case 'GET_STATUS':
              sendResponse({ 
                isRipping: window.PilotWatchdog ? window.PilotWatchdog.isRipping : false,
                count: window.PilotStorage ? (window.PilotStorage.data?.length || 0) : 0
              });
              break;
          }
        } catch (e) {
          console.error('[Pilot] Message listener error:', e);
        }
        return true; 
      });
    },

    async startRipping(options) {
      console.log('[Pilot] Starting rip sequence...', options);
      if (window.PilotWatchdog) window.PilotWatchdog.arm();
      if (window.PilotTurner) window.PilotTurner.startAuto();
    },

    stopRipping() {
      console.log('[Pilot] Stopping rip sequence...');
      if (window.PilotWatchdog) window.PilotWatchdog.disarm();
      if (window.PilotTurner) window.PilotTurner.stopAuto();
    }
  };

  // Initialize immediately
  Orchestrator.init();
  window.PilotOrchestrator = Orchestrator;
})();