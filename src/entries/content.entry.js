/**
 * Refactored VitalSource Extension Content Script
 * Modular architecture for better maintainability and reusability
 */

// Import all services
import logger from '../services/logger.service.js';
import messagingService from '../services/messaging.service.js';
import stateManager from '../features/state/state.manager.js';
import contentDetector from '../features/capture/content.detector.js';
import captureService from '../features/capture/capture.service.js';
import navigationService from '../features/navigation/turner.service.js';
import observerService from '../features/observers/observer.service.js';
import uiService from '../features/ui/ui.service.js';
import { coordinatorService } from '../features/orchestration/coordinator.service.js';

// Suppress uncaught promise rejections
window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault();
});

// Initialize DEBUG mode
const DEBUG = false;
logger.setDebug(DEBUG);

// Global references for backward compatibility
window.__pilotpro_outline = [];
window.__pilotpro_pagebreaks = [];

// Message event listeners for outline and pagebreaks
window.addEventListener('message', (ev) => {
    if (ev.data && ev.data.type === 'VS_OUTLINE_JSON') {
        stateManager.setOutline(ev.data.data, ev.data.bookId);
    } else if (ev.data && ev.data.type === 'VS_PAGEBREAKS_JSON') {
        stateManager.setPagebreaks(ev.data.data, ev.data.bookId);
    }
});

// Command message handler
function handleCommand(message, sendResponse) {
    switch (message.action) {
        case 'ENGINE_CONFIG':
            stateManager.configureEngine(message);
            // Only start autonomous mode if explicitly requested by initiate button
            if (message.state && message.initiate === true) {
                stateManager.clearSessionHashes();
                coordinatorService.startAutomation();
                captureService.scheduleSnap(800);
            } else if (!message.state) {
                coordinatorService.stopAutomation();
            }
            break;
        case 'SET_SPEED':
            stateManager.setSpeed(message.speed);
            break;
        case 'PICK':
            uiService.activatePicker();
            break;
        case 'AUTOPICK':
            const target = contentDetector.autoDetectContent();
            if (target) {
                let selector = target.tagName.toLowerCase();
                if (target.id) {
                    selector = '#' + target.id;
                } else if (target.tagName.toLowerCase() === 'mosaic-book') {
                    selector = 'body > mosaic-book, mosaic-book';
                } else if (target.className) {
                    selector += '.' + target.className.trim().split(/\s+/).join('.');
                }
                stateManager.setCustomSelector(selector);
                logger.log('DATA', 'Auto-picked selector:', selector);
                uiService.showVisualConfirmation('Content auto-picked');
            } else {
                uiService.showVisualConfirmation('No content found to auto-pick');
            }
            break;
        case 'SNAP':
            captureService.snapWithRetry(0, true);
            break;
        case 'DISCOVER':
            sendPulse();
            break;
        case 'JUMP':
            navigationService.navigateToPage(message);
            break;
        case 'GET_BOOK_METADATA':
            const metadata = getBookMetadata();
            sendResponse(metadata);
            break;
        case 'PAGE_ACK':
            stateManager.setHasSnappedCurrentPage(false);
            if (stateManager.getAutoPilot() && stateManager.isScraping() && messagingService.isTop) {
                setTimeout(async () => {
                    try {
                        await navigationService.triggerNext();
                    } catch (e) {
                        // Message port may have closed, ignore
                    }
                }, stateManager.getFlipDelay());
            }
            break;
    }
}

// Setup message listener
messagingService.setupMessageListener(handleCommand);

// Book metadata extraction
function getBookMetadata() {
    const metadata = {
        title: document.title || 'Untitled Book',
        url: window.location.href,
        cover: null,
        author: null
    };

    // Try to find a better title in the DOM
    const titleSelectors = ['.book-title', '#book-title', '.title', 'h1[class*="title" i]'];
    for (const s of titleSelectors) {
        const el = contentDetector.findDeep(s);
        if (el && el.innerText) {
            metadata.title = el.innerText.trim();
            break;
        }
    }

    // Try to find an author
    const authorSelectors = ['.author', '.book-author', '[aria-label*="author" i]', '.creator'];
    for (const s of authorSelectors) {
        const el = contentDetector.findDeep(s);
        if (el && el.innerText) {
            metadata.author = el.innerText.trim();
            break;
        }
    }

    // Try to find a cover image
    const coverSelectors = ['img[src*="cover" i]', 'img[alt*="cover" i]', 'img.cover', '.cover-image img'];
    for (const s of coverSelectors) {
        const el = contentDetector.findDeep(s);
        if (el && el.src) {
            metadata.cover = el.src;
            break;
        }
    }

    return metadata;
}

// Pulse function for frame detection
function sendPulse() {
    const isSignificantFrame = () => {
        if (window.top === window.self) return true;
        const body = document.body;
        if (!body) return false;
        return (body.innerText && body.innerText.length > 50) || !!contentDetector.autoDetectContent();
    };

    if (isSignificantFrame()) {
        messagingService.sendPulse();
    }
}

// Mobile UI bridge
window.addEventListener('vst-command', (e) => {
    const { action } = e.detail;
    logger.log('MOBILE', 'Received command: ' + action);

    if (action === 'START_FULL_RIP') {
        stateManager.configureEngine({ state: true });
        captureService.scheduleSnap(500);
    }

    if (action === 'PICK') {
        uiService.activatePicker();
    }

    if (action === 'STOP_RIP') {
        stateManager.configureEngine({ state: false });
        logger.log('MOBILE', 'Automation halted.');
    }
});

// Cleanup on unload
window.addEventListener('beforeunload', () => {
    messagingService.sendDead();
});

// Initialize
sendPulse();
setInterval(sendPulse, 5000);

// Setup observers when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        observerService.armPageChangeObserver();
    });
} else {
    observerService.armPageChangeObserver();
}

// Setup additional event listeners
observerService.setupEventListeners();
observerService.startNavigationWatchdog();
