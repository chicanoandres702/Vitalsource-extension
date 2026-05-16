// content.js - Legacy relay for TOC/pagebreaks sync (restored)
(function() {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (msg && (msg.type === 'VS_OUTLINE_JSON' || msg.type === 'VS_PAGEBREAKS_JSON')) {
      try {
        chrome.runtime.sendMessage({
          type: 'TOC_UPDATE',
          data: msg.data || msg,
          bookId: msg.bookId,
          url: msg.url
        });
        console.log('[PilotPro content] Relayed TOC to extension:', (msg.data || msg).length, 'items');
      } catch (e) {}
    }
  });
})();
