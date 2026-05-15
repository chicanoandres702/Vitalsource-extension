/**
 * Navigation Watchdog
 * Design Intent: Detects stalls in Auto-Pilot and manages key navigation.
 */
import logger from '../../services/logger.service.js';
import stateManager from '../state/state.manager.js';
import navigationService from '../navigation/turner.service.js';
import captureService from '../capture/capture.service.js';

export const navigationWatchdog = {
    init(onSpaNav) {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                logger.log('NAV', 'Arrow key navigation detected.');
                setTimeout(onSpaNav, 300);
            }
        });

        this.startStallCheck();
    },

    startStallCheck() {
        if (window.top !== window.self) return;

        setInterval(() => {
            const isAuto = stateManager.getAutoPilot();
            const isScraping = stateManager.getIsScraping();
            if (!isAuto || !isScraping || document.hidden) return;

            if (Date.now() - stateManager.getLastFlipTime() > 8000) {
                logger.log('NAV', 'WATCHDOG: Stall detected (8s). Nudge recovery.');
                captureService.captureCurrentView();
                setTimeout(() => navigationService.nextPage(), 3000);
                stateManager.setLastFlipTime(Date.now());
            }
        }, 3000);
    }
};
export default navigationWatchdog;