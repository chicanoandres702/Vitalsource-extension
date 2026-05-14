/**
 * VitalSource Pilot Pro - Orchestrator
 * Manages the high-level workflow and state
 */

(function() {
  console.log('[Pilot] Orchestrator active.');

  const Orchestrator = {
    isInitialized: false,
    runtimeMode: 'unknown',

    init() {
      if (this.isInitialized) return;
      
      const hasRuntime = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage;
      const hasBridge = typeof window !== 'undefined' && typeof window.addEventListener === 'function';

      if (!hasRuntime && !hasBridge) {
        console.warn('[Pilot] Extension context invalidated. Please refresh the page.');
        return;
      }

      this.runtimeMode = hasRuntime ? 'runtime' : 'bridge';
      this.setupListeners();
      this.isInitialized = true;
      console.log('[Pilot] Orchestrator fully initialized.');
    },

    setupListeners() {
      if (this.runtimeMode === 'runtime') {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
          if (!chrome.runtime?.id) return;
          this.handleMessage(request, sendResponse);
          return true;
        });
      } else {
        window.addEventListener('message', (event) => {
          if (event.source !== window || !event.data?.pilotBridgeInbound || event.data.message == null) return;
          this.handleMessage(event.data.message, () => {});
        });
      }
    },

    handleMessage(request, sendResponse) {
      if (!request || typeof request !== 'object' || !('action' in request)) {
        return;
      }

      try {
        switch (request.action) {
          case 'START_RIP':
            this.startRipping(request.options);
            sendResponse?.({ status: 'started' });
            break;
          case 'STOP_RIP':
            this.stopRipping();
            sendResponse?.({ status: 'stopped' });
            break;
          case 'GET_STATUS':
            sendResponse?.({ 
              isRipping: window.PilotWatchdog ? window.PilotWatchdog.isRipping : false,
              count: window.PilotStorage ? window.PilotStorage.getCount() : 0
            });
            break;
        }
      } catch (e) {
        console.error('[Pilot] Message listener error:', e);
      }
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