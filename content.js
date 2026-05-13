/**
 * VitalSource Pilot Pro - Content Script
 * Initializes and orchestrates all features
 */

(async function init() {
  // Check if we are in an orphaned context
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
    console.warn('[Pilot] Script injected into orphaned context. Skipping init.');
    return;
  }

  console.log('[Pilot] Core initializing...');

  const features = [
    'src/features/platform/detection.service.js',
    'src/features/ripping/storage.service.js',
    'src/features/navigation/turner.service.js',
    'src/features/ripping/watchdog.service.js',
    'src/features/ui/renderer.service.js',
    'orchestrator.js'
  ];

  for (const script of features) {
    try {
      await injectScript(script);
      // Brief delay to ensure JS engine processes the script before next injection
      await new Promise(r => setTimeout(r, 10)); 
    } catch (e) {
      console.error(`[Pilot] Failed to load ${script}. Check manifest.json web_accessible_resources.`);
    }
  }
})();

function injectScript(file) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    // Using try/catch for chrome.runtime.getURL to catch invalidation early
    try {
      s.src = chrome.runtime.getURL(file);
    } catch (e) {
      return reject(new Error('Extension context invalidated'));
    }
    
    s.type = 'text/javascript';
    s.async = false;
    s.onload = () => {
      s.remove();
      resolve();
    };
    s.onerror = (err) => {
      s.remove();
      reject(err);
    };
    (document.head || document.documentElement).appendChild(s);
  });
}