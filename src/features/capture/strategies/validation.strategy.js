/**
 * Content Validation Strategy
 * Reusable validation logic for autonomous capture.
 */
export function isContentValidForSnap(element, getPureText) {
    if (!element) return false;
    const text = getPureText(element) || '';
    return text.length > 50 || element.querySelector('img, canvas, svg');
}
