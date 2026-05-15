/**
 * Validation logic for identifying valid vs junk content in the automation loop.
 */
export const coordinatorValidator = {
    ENCRYPTED_PATTERN: /\d{1,3}(,\d{1,3}){3,}:[A-Za-z0-9+/=]{20,}/,
    JUNK_PHRASES: ['undefined', 'section content', 'loading content', 'fetching', 'please wait', 'seq '],

    isInvalid(text) {
        if (!text || text.trim().length < 50) return true;
        const lower = text.toLowerCase();

        // 1. Known loading/placeholder phrases.
        if (this.JUNK_PHRASES.some(p => lower.includes(p))) return true;

        // 2. Explicit VitalSource encrypted payload check
        if (this.ENCRYPTED_PATTERN.test(text)) return true;

        // 3. High density of digits and commas (likely encrypted content)
        const digitCommaCount = (text.match(/[\d,]/g) || []).length;
        if (digitCommaCount / text.length > 0.5) return true;

        // 4. Whitespace-density check: real prose always has spaces.
        const spaces = (text.match(/ /g) || []).length;
        if (spaces / text.length < 0.025) return true;

        // 5. Low letter ratio → binary/encrypted garbage.
        const letters = (text.match(/[a-zA-Z]/g) || []).length;
        if (letters / text.length < 0.40) return true;

        return false;
    },

    hash(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) {
            h = Math.imul(h ^ str.charCodeAt(i), 16777619);
        }
        return (h >>> 0).toString(16);
    }
};