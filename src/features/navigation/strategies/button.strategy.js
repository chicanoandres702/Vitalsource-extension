/**
 * Button Click Strategy
 * Most reliable method for VitalSource mosaic-book readers.
 */
export async function tryButtonClick() {
    try {
        const nextBtn = document.querySelector(
            'button[aria-label*="Next"], .next-button, [data-testid="next-btn"], .vst-icon-next, mosaic-book button[aria-label*="Next"]'
        );
        if (nextBtn) {
            nextBtn.click();
            return true;
        }
    } catch (e) {}
    return false;
}
