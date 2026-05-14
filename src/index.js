/**
 * Main entry point for the refactored VitalSource extension
 * This file orchestrates all the modular services
 */

// Services
import './services/logger.service.js';
import './services/messaging.service.js';
import './services/utils.service.js';

// Features
import './features/state/state.manager.js';
import './features/capture/content.detector.js';
import './features/capture/html.cleaner.js';
import './features/capture/capture.service.js';
import './features/navigation/turner.service.js';
import './features/observers/observer.service.js';
import './features/ui/ui.service.js';

// Main content script
import './content.js';