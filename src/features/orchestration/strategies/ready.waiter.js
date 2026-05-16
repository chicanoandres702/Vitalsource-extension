/**
 * Ready Waiter Strategy
 * Handles the initial decrypt/render wait before polling begins.
 */
export async function waitForReady(minWaitMs = 15000, isRunning = () => true) {
    const waitSec = Math.round(minWaitMs / 1000);
    for (let i = waitSec; i > 0 && isRunning(); i--) {
        // In real use, broadcast status here if needed
        await new Promise(r => setTimeout(r, 1000));
    }
    return isRunning();
}
