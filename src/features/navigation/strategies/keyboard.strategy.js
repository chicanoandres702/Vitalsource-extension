/**
 * Direct Keyboard Dispatch Strategy
 * Matches the working behavior from earlier versions of the extension.
 */
export function tryDirectKeyboard(direction = 'next') {
    try {
        const key = direction === 'next' ? 'ArrowRight' : 'ArrowLeft';
        const code = direction === 'next' ? 39 : 37;

        const event = new KeyboardEvent('keydown', {
            key,
            code: key,
            keyCode: code,
            which: code,
            bubbles: true,
            cancelable: true
        });

        document.dispatchEvent(event);

        if (window.top && window.top !== window) {
            window.top.document.dispatchEvent(event);
        }

        return true;
    } catch (e) {
        return false;
    }
}
