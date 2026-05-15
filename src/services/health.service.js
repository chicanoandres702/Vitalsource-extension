/**
 * Health and Dependency verification service.
 * Design Intent: Ensure all modular services are correctly instantiated
 * and reachable before background communication or automation begins.
 */
import { logger } from './logger.service.js';

export const healthService = {
    /**
     * Checks if the essential service instances are available in the current context.
     * @param {Object} dependencies - Map of service names to instances
     * @returns {boolean}
     */
    isSystemStable(dependencies) {
        const missing = Object.entries(dependencies)
            .filter(([name, instance]) => !instance)
            .map(([name]) => name);

        if (missing.length > 0) {
            // Design Intent: Log specifically which module failed to load 
            // to aid in rapid debugging of bundle/import issues.
            logger.log('ERROR', `System unstable. Missing dependencies: ${missing.join(', ')}`);
            return false;
        }

        logger.log('BRIDGE', 'System stability verified. All services active.');
        return true;
    }
};