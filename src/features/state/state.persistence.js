/**
 * Isolates chrome storage interactions for the StateManager.
 */
export const statePersistence = {
    saveOutline(bookId, outline) {
        if (!bookId) return;
        const saveObj = { bookId };
        saveObj[`outline_${bookId}`] = outline;
        chrome.storage.local.set(saveObj).catch(() => {});
    },

    savePagebreaks(bookId, pagebreaks) {
        if (!bookId) return;
        const saveObj = { bookId };
        saveObj[`pagebreaks_${bookId}`] = pagebreaks;
        chrome.storage.local.set(saveObj).catch(() => {});
    },

    saveCustomSelector(selector) {
        chrome.storage.local.set({ lastCustomSelector: selector }).catch(() => {});
    },

    loadInitial(callback) {
        try {
            chrome.storage.local.get(['lastCustomSelector'], (res) => {
                if (res.lastCustomSelector) callback(res.lastCustomSelector);
            });
        } catch (e) {}
    }
};