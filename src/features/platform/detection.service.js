/**
 * Platform Detection Service
 * Logic for identifying the current operating environment.
 */

const isAndroid = () => {
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes('android');
};

const isMobile = () => {
    return isAndroid() || /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
};

// Make functions globally available
window.isAndroid = isAndroid;
window.isMobile = isMobile;
