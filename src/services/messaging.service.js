/**
 * Messaging service for communication with background script
 */
import logger from './logger.service.js';
import { getContextId } from './utils.service.js';
import { findDeep } from './dom.service.js'; // This is a named export, keep as is
import mimeoBridge from '../features/capture/mimeo-bridge.service.js';
import captureMetadata from '../features/capture/capture.metadata.js';

const CONTEXT_ID = getContextId();
const IS_TOP = window.top === window.self;
const SENSOR_ID = 'vst-' + Math.random().toString(36).substring(2, 7);

class MessagingService {
    constructor() {
        this.contextId = CONTEXT_ID;
        this.isTop = IS_TOP;
        this.sensorId = SENSOR_ID;
    }

    safeSend(msg) {
        try {
            if (!chrome?.runtime?.id) return;
            // Design Intent: Provide a callback to catch and suppress 
            // "Receiving end does not exist" errors. Checking lastError 
            // inside the callback prevents the "Unchecked runtime.lastError" 
            // warning from appearing in the console.
            chrome.runtime.sendMessage(msg, () => {
                const err = chrome.runtime.lastError;
                if (err) { /* Connection failure expected during frame navigation */ }
            });
        } catch (e) { /* ignore context invalidated */ }
    }

    sendPulse() {
        // Design Intent: Mult-layered detection for the book frame. 
        // Check light DOM, Shadow DOM, and internal Mosaic component flags.
        const hasBook = !!(
            findDeep('mosaic-book, .mosaic-page, #epub-content-container', document, true) || 
            document.querySelector('script[src*="mosaic"]') ||
            mimeoBridge.checkMimeoAvailability() // Use the bridge to check main world Mimeo
        );

        const msg = {
            type: 'ALIVE',
            sensorId: this.sensorId,
            contextId: this.contextId,
            url: location.href,
            timestamp: Date.now(),
            isBookFrame: hasBook
        };
        if (this.isTop) msg.pageValue = captureMetadata.getCurrentPageValue();
        this.safeSend(msg);
    }

    sendData(html, styles, meta) {
        this.safeSend({
            type: 'DATA',
            html,
            styles,
            meta
        });
    }

    sendPageAck() {
        this.safeSend({ type: 'PAGE_ACK' });
    }

    sendChapterComplete(page) {
        this.safeSend({ type: 'CHAPTER_COMPLETE', page });
    }

    sendTabVisibility(hidden) {
        this.safeSend({
            type: hidden ? 'TAB_HIDDEN' : 'TAB_VISIBLE',
            timestamp: Date.now()
        });
    }

    sendDead() {
        this.safeSend({ type: 'DEAD', sensorId: this.sensorId });
    }

    // Message listener setup
    setupMessageListener(handler) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            // Design Intent: Standardize on 'type' for all message identification
            logger.log('BRIDGE', `Incoming: ${message.type || message.action}`);
            const isAsync = handler(message, sendResponse);
            if (isAsync === true) return true;
        });
    }
}

export default new MessagingService();