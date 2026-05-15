/**
 * Utility to sanitize and normalize Canonical Fragment Identifiers (CFI).
 * Design Intent: Convert Range CFIs to Point CFIs to maintain navigation stability
 * across multi-part book structures without triggering reader parser errors.
 */
export const cfiSanitizer = {
    /**
     * Sanitizes a CFI by removing ranges and metadata parameters.
     * @param {string} cfi - The raw intercepted CFI string.
     * @returns {string|null}
     */
    sanitize: (cfi) => {
        if (!cfi || typeof cfi !== 'string') return null;

        // 1. Convert Range to Point: VitalSource navigation often fails if a range is provided.
        // We extract the base point: epubcfi(/6/2!/4, /10/2, /10/4) -> epubcfi(/6/2!/4)
        let clean = cfi.split(',')[0];
        
        // 2. Remove the "!" range marker if it exists at the end of the first part
        if (clean.includes('!') && !clean.includes(',')) {
            clean = clean.split('!')[0];
        }

        // 3. Strip internal parameters: Remove anything starting with ';' (e.g. ;vnd.vst.idref)
        // This prevents "wrong number of pieces" errors in the reader's internal parser.
        clean = clean.replace(/;[^\])]+/g, '');

        // 4. Structural Integrity: Ensure the CFI is properly wrapped in parentheses.
        if (cfi.includes('(') && !clean.endsWith(')')) {
            clean += ')';
        }
        
        // 5. Ensure the protocol prefix is present
        if (!clean.startsWith('epubcfi(')) {
            clean = 'epubcfi(' + clean + ')';
        }

        return clean;
    }
};