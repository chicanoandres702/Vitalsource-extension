// sidebar.js

/**
 * Sends a PING message to the background script and waits for a PONG response.
 * @param {number} timeoutMs The maximum time to wait for a PONG response in milliseconds.
 * @returns {Promise<boolean>} Resolves to true if a PONG is received, false otherwise.
 */
async function pingBackground(timeoutMs = 1000) {
    const pingId = Date.now().toString(36) + Math.random().toString(36).substring(2);
    const pingMessage = {
        type: 'PING',
        id: pingId,
        origin: 'sidebar'
    };

    console.log(`Sidebar sending PING (ID: ${pingId}) to background...`);

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            console.warn(`Sidebar PING (ID: ${pingId}) to background timed out after ${timeoutMs}ms.`);
            // Remove the listener if it timed out to prevent memory leaks
            chrome.runtime.onMessage.removeListener(pongListener);
            resolve(false);
        }, timeoutMs);

        const pongListener = (message, sender) => {
            // Ensure the response is from our background script (optional, but good for security/robustness)
            if (sender.id === chrome.runtime.id && message.type === 'PONG' && message.id === pingId) {
                clearTimeout(timeout);
                chrome.runtime.onMessage.removeListener(pongListener);
                console.log(`Sidebar received PONG (ID: ${message.id}) from background. Background is active.`);
                resolve(true);
            }
        };

        // Temporarily listen for the PONG response
        chrome.runtime.onMessage.addListener(pongListener);

        chrome.runtime.sendMessage(pingMessage)
            .catch(error => {
                // This catch handles errors like "Receiving end does not exist"
                clearTimeout(timeout);
                chrome.runtime.onMessage.removeListener(pongListener);
                if (error.message && error.message.includes('Receiving end does not exist')) {
                    console.error(`Sidebar PING (ID: ${pingId}) failed: Background script is not running or responsive.`);
                } else {
                    console.error(`Sidebar PING (ID: ${pingId}) failed with unexpected error:`, error);
                }
                resolve(false);
            });
    });
}

// Example usage:
document.addEventListener('DOMContentLoaded', async () => {
    const statusBadge = document.getElementById('status-badge');
    if (statusBadge) {
        statusBadge.textContent = 'CONNECTING...';
        statusBadge.classList.replace('chip-cyan', 'chip-amber');
    }

    const isBackgroundActive = await pingBackground(2000); // Wait up to 2 seconds

    if (isBackgroundActive) {
        console.log("Background script is active. Proceed with normal operations.");
        if (statusBadge) {
            statusBadge.textContent = 'ONLINE';
            statusBadge.classList.replace('chip-amber', 'chip-emerald');
        }
        // You can now confidently send other messages to the background script
        // chrome.runtime.sendMessage({ action: 'someOtherAction', data: 'hello' });
    } else {
        console.error("Background script is not active. Some features might not work.");
        if (statusBadge) {
            statusBadge.textContent = 'OFFLINE';
            statusBadge.classList.replace('chip-amber', 'chip-red'); // Assuming a red chip for errors
        }
    }
});