/**
 * Main entry point for the refactored VitalSource extension
 * This file orchestrates all the modular services
 */

// Services
import './services/logger.service.js';
import { messagingService } from './services/messaging.service.js';
import './services/utils.service.js';
import { healthService } from './services/health.service.js';

// Features
import { stateManager } from './features/state/state.manager.js';
import { contentDetector } from './features/capture/content.detector.js';
import './features/capture/html.cleaner.js';
import { captureService } from './features/capture/capture.service.js';
import { navigationService } from './features/navigation/turner.service.js';
import { observerService } from './features/observers/observer.service.js';
import { mimeoBridge } from './features/capture/mimeo-bridge.service.js';
import { uiService } from './features/ui/ui.service.js';

// Design Intent: Perform a runtime dependency check before initializing logic.
// This prevents ReferenceErrors if a module fails to load in a specific frame.
console.log(`[PilotPro] Initializing frame: ${location.hostname || 'top-shell'}`);

// Design Intent: Soft-check for core messaging. If state or detector is 
// slightly delayed, we still want the event listeners to arm for the picker.
const isReady = !!(messagingService && uiService);

if (!isReady) {
    console.warn('[PilotPro] Frame skipped: Core services not ready yet.');
    // Design Intent: Don't throw, just exit gracefully to allow retries or 
    // partial functionality in secondary frames.
}

// Main content script
import './content.js';

// Design Intent: Initialize the world bridge early so it's ready for any mimeo API calls.
mimeoBridge.init();

// Design Intent: Bridge background messages and mobile events to UI services.
messagingService.setupMessageListener((message) => {
    if (message.type === 'START_PICKER') {
        uiService.activatePicker();
    }

    if (message.type === 'SYNC_SELECTOR') {
        // Design Intent: Keep frame-local state in sync with global picks.
        // If the selector is null, it triggers the default Auto-Detect logic.
        stateManager.setCustomSelector(message.payload.selector);
        if (!message.payload.selector) {
            stateManager.discoverInternalData();
        }
    }
});

window.addEventListener('vst-command', (e) => {
    if (e.detail?.action === 'PICK') uiService.activatePicker();
});

// Design Intent: Listen for broadcast events from the background script.
// This enables the picker inside cross-origin book content iframes.
window.addEventListener('vst-start-picker', () => uiService.activatePicker());