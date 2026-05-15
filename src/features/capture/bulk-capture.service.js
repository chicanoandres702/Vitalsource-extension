/**
 * Bulk Capture Service
 * Design Intent: Leverages the internal Mimeo print API to fetch 
 * high-fidelity page ranges directly as PDFs/URLs.
 */
import { mimeoBridge } from './mimeo-bridge.service.js';
import { messagingService } from '../../services/messaging.service.js';
import { logger } from '../../services/logger.service.js';

export const bulkCaptureService = {
    /**
     * Downloads a range of pages using VitalSource's print engine.
     * @param {string} range - e.g., "1-10"
     */
    async captureRange(range) {
        logger.log('DATA', `Requesting bulk capture for range: ${range}`);
        try {
            // Design Intent: getPrintUrl typically triggers a background PDF generation
            // on the VitalSource side and returns the resulting blob/s3 URL.
            const printUrl = await mimeoBridge.request('GET_PRINT_URL', range);
            if (printUrl) {
                window.open(printUrl, '_blank');
                return true;
            }
        } catch (err) {
            logger.log('ERROR', `Bulk capture failed: ${err.message}`);
        }
        return false;
    },

    /**
     * Fetches the print token and requests the background script to handle
     * the download of the PDF range to avoid opening new tabs.
     */
    async downloadRangeSilently(range) {
        logger.log('DATA', `Initiating silent bulk capture: ${range}`);
        messagingService.safeSend({ type: 'BULK_PROGRESS', payload: { message: 'Requesting URL...' } });
        try {
            const printUrl = await mimeoBridge.request('GET_PRINT_URL', range);
            messagingService.safeSend({ type: 'BULK_PROGRESS', payload: { message: 'Authorizing...' } });
            const { token } = await mimeoBridge.request('GET_TOKEN');
            
            if (printUrl && token) {
                messagingService.safeSend({
                    type: 'DOWNLOAD_RESOURCE',
                    payload: { 
                        url: printUrl, 
                        token,
                        filename: `bulk_capture_${range}.pdf`
                    }
                });
                return true;
            }
        } catch (err) {
            logger.log('ERROR', `Silent capture failed: ${err.message}`);
        }
        return false;
    }
};