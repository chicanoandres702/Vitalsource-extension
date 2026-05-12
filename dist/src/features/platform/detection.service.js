/**
 * Platform Detection Service
 * Logic for identifying the current operating environment.
 */

export const isAndroid = () => {
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes('android');
};

export const isMobile = () => {
    return isAndroid() || /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
};
