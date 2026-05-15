/**
 * Safe logging utility to prevent "warn is not a function" errors.
 * Ensures that even if the logging service is partially initialized,
 * the call does not crash the application.
 */
export const sidebarLogger = {
  warn: (message: string, ...extra: unknown[]): void => {
    // Fallback to native console if the custom logger is unavailable
    const log = console.warn || console.log;
    log(`[Sidebar Warning]: ${message}`, ...extra);
  }
};