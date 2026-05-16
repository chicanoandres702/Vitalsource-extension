/**
 * Page Advancer Strategy (Autonomous)
 * Uses the same reliable navigation as Legacy mode.
 */
import navigationService from '../../navigation/turner.service.js';

export async function advancePage() {
    try {
        // Legacy-style: direct navigation, no waiting
        const success = await navigationService.nextPage();
        return success;
    } catch (e) {
        console.error('[Autonomous] Page advance failed:', e);
        return false;
    }
}
