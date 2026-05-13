/**
 * filepath: src/features/ripping/storage.service.js
 * PilotStorage - Shared persistence layer.
 */
export class StorageService {
    constructor() {
        this._storageKey = 'pilot_pro_captured_pages';
    }

    async savePage(pageData) {
        const result = await chrome.storage.local.get([this._storageKey]);
        const pages = result[this._storageKey] || [];
        
        const exists = pages.some(p => p.index === pageData.index && p.metadata?.title === pageData.metadata?.title);
        
        if (!exists) {
            pages.push({ ...pageData, timestamp: Date.now() });
            await chrome.storage.local.set({ [this._storageKey]: pages });
            return pages.length;
        }
        return pages.length;
    }

    async getAllPages() {
        const result = await chrome.storage.local.get([this._storageKey]);
        return result[this._storageKey] || [];
    }

    async clear() {
        await chrome.storage.local.remove([this._storageKey]);
    }

    async getCount() {
        const pages = await this.getAllPages();
        return pages.length;
    }
}

export const PilotStorage = new StorageService();