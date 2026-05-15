/**
 * Logger service for consistent logging across the extension
 */
class Logger {
    constructor(debug = false) {
        this.debug = debug;
        this.colors = {
            'BRIDGE': '#3b82f6',
            'SENSOR': '#8b5cf6',
            'NAV': '#f59e0b',
            'DATA': '#10b981',
            'UI': '#ec4899',
            'ERROR': '#ef4444'
        };
    }

    log(category, message, data = "") {
        // Persistent background logging for session tracking
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
                this.dispatchBackgroundLog({
                    type: 'LOG_EVENT',
                    category,
                    message,
                    data: (data && typeof data === 'object') ? JSON.parse(JSON.stringify(data)) : String(data),
                    timestamp: new Date().toISOString()
                });
            }
        } catch (e) {}

        if (!this.debug) return;
        const color = this.colors[category] || '#4e6580';
        console.log(`%c[PilotPro-${category}] %c${message}`, `color:${color};font-weight:bold;`, "color:inherit;", data);
    }

    dispatchBackgroundLog(payload) {
        // Design Intent: Centralize the dispatch to ensure lastError is always checked.
        chrome.runtime.sendMessage(payload, () => {
            if (chrome.runtime.lastError) { /* Background temporarily unavailable */ }
        });
    }

    setDebug(enabled) {
        this.debug = enabled;
    }
}

export const logger = new Logger(false);