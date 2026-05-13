/**
 * queue.service.js
 * Manages Table of Contents and ripping sequence metadata.
 */

const PilotQueue = {
    RipQueue: [],
    CurrentIndex: 0,
    outline: [],
    pagebreaks: [],

    setOutline(data) {
        this.outline = Array.isArray(data) ? data : [];
        window.dispatchEvent(new CustomEvent('pilot-outline-updated', { detail: this.outline }));
    },

    setPagebreaks(data) {
        this.pagebreaks = Array.isArray(data) ? data : [];
        console.log(`[PilotPro] ${this.pagebreaks.length} Pagebreaks Synchronized`);
    },

    async fetchManifest(bookId) {
        if (!bookId) return null;
        const endpoints = [
            `https://jigsaw.vitalsource.com/api/v1/books/${bookId}/outline`,
            `https://jigsaw.vitalsource.com/books/${bookId}/toc`
        ];
        for (const url of endpoints) {
            try {
                const r = await fetch(url);
                if (r.ok) {
                    const data = await r.json();
                    const list = data.outline || data.table_of_contents || data;
                    if (Array.isArray(list)) return list;
                }
            } catch (e) {}
        }
        return null;
    },

    processNext() {
        if (this.CurrentIndex >= this.RipQueue.length) {
            this.onComplete(); return;
        }
        const item = this.RipQueue[this.CurrentIndex];
        chrome.tabs.sendMessage(window.targetTabId, {
            type: 'CMD', action: 'JUMP', cfi: item.cfi, url: item.url, page: item.page
        });
    },

    onComplete() {
        window.dispatchEvent(new Event('pilot-queue-finished'));
    }
};

window.PilotQueue = PilotQueue;
