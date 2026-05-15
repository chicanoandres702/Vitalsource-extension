/**
 * Canvas Cleaner Utility
 * Design Intent: Converts HTML5 Canvases to static images for capture persistence.
 */
export const canvasCleaner = {
    convertCanvases(node, wrapper) {
        const originalCanvases = node.tagName === 'CANVAS' ? [node] : Array.from(node.querySelectorAll('canvas'));
        const clonedCanvases = wrapper.tagName === 'CANVAS' ? [wrapper] : Array.from(wrapper.querySelectorAll('canvas'));
        
        for (let i = 0; i < originalCanvases.length; i++) {
            if (originalCanvases[i].width < 50 || originalCanvases[i].height < 50) {
                clonedCanvases[i].remove();
                continue;
            }
            try {
                const dataUrl = originalCanvases[i].toDataURL('image/png');
                if (dataUrl.length < 3500) {
                    clonedCanvases[i].remove();
                    continue;
                }
                const img = document.createElement('img');
                img.src = dataUrl;
                img.className = clonedCanvases[i].className;
                img.style.cssText = clonedCanvases[i].style.cssText;
                clonedCanvases[i].replaceWith(img);
            } catch (e) {
                // Canvas CORS taint - cannot export
            }
        }
    }
};