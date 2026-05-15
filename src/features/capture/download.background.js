/**
 * Download Background Service
 * Design Intent: Handles binary resource fetching with progress reporting.
 * Uses Streams API to track download state in a Service Worker context.
 */

export const downloadBackground = {
    async downloadWithProgress(url, token, filename) {
        try {
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const contentLength = +response.headers.get('Content-Length');
            const reader = response.body.getReader();
            let receivedLength = 0;
            let chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunks.push(value);
                receivedLength += value.length;

                if (contentLength) {
                    const progress = Math.round((receivedLength / contentLength) * 100);
                    this.broadcastProgress(`Downloading: ${progress}%`, progress);
                }
            }

            this.broadcastProgress('Finalizing...', 100);
            
            // Concatenate chunks into a single Blob
            const blob = new Blob(chunks, { type: 'application/pdf' });
            const buffer = await blob.arrayBuffer();
            const base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));

            chrome.downloads.download({
                url: `data:application/pdf;base64,${base64}`,
                filename: filename
            }, () => {
                this.broadcastProgress('Done', 0);
                setTimeout(() => this.broadcastProgress('', 0), 2000);
            });
        } catch (err) {
            this.broadcastProgress(`Error: ${err.message}`, 0);
        }
    },

    broadcastProgress(message, progress) {
        chrome.runtime.sendMessage({ type: 'BULK_PROGRESS', payload: { message, progress } }).catch(() => {});
    }
};