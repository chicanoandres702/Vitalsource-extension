/**
 * Messaging service for communication with background script
 */
import { logger } from './logger.service.js';
import { getContextId } from './utils.service.js';

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
            chrome.runtime.sendMessage(msg, () => {
                if (chrome.runtime.lastError) { /* ignore */ }
            });
        } catch (e) { /* ignore context invalidated */ }
    }

    sendPulse() {
        this.safeSend({
            type: 'ALIVE',
            sensorId: this.sensorId,
            contextId: this.contextId,
            url: location.href,
            timestamp: Date.now()
        });
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
            logger.log('BRIDGE', `Command: ${message.action}`);
            const isAsync = handler(message, sendResponse);
            if (isAsync === true) return true;
        });
    }
}

export const messagingService = new MessagingService();