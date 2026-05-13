/**
 * Navigation Turner Service
 * Handles page flipping via keyboard and DOM triggers.
 */

const NEXT_SELECTORS = [
    'button[aria-label="Next Page"]',
    'button.next-button',
    '.vst-icon-chevron-right'
];

function triggerNext(flipDelay = 1200) {
    const nextBtn = document.querySelector(NEXT_SELECTORS.join(','));
    
    const keyOptions = { 
        key: 'ArrowRight', 
        code: 'ArrowRight', 
        keyCode: 39, 
        which: 39, 
        bubbles: true 
    };
    
    [document, window, document.body].forEach(t => {
        try {
            t.dispatchEvent(new KeyboardEvent('keydown', keyOptions));
            t.dispatchEvent(new KeyboardEvent('keyup', keyOptions));
        } catch(err) {}
    });

    if (nextBtn && !nextBtn.disabled) {
        nextBtn.click();
    }
}

// Make it globally available
window.triggerNext = triggerNext;