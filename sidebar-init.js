/*
 * sidebar-init.js
 * Re-styles #status-badge whenever sidebar.js changes its textContent.
 * Must run BEFORE sidebar.js so the observer is armed before first write.
 */

(function initStatusBadge() {
    const badge = document.getElementById('status-badge');
    if (!badge) return;

    // Maps badge text to CSS chip classes
    const STYLE_MAP = {
        'standby':    { remove: ['chip-amber','chip-red'], add: 'chip-cyan' },
        'autonomous': { remove: ['chip-cyan', 'chip-red'], add: 'chip-amber' },
        'error':      { remove: ['chip-cyan', 'chip-amber'], add: 'chip-red' },
    };

    function applyStyle(text) {
        const key = text.toLowerCase().trim();
        const entry = STYLE_MAP[key] || STYLE_MAP['standby'];
        entry.remove.forEach(c => badge.classList.remove(c));
        badge.classList.add(entry.add);
    }

    // Apply on load
    applyStyle(badge.textContent);

    // Watch for sidebar.js changes
    new MutationObserver(() => applyStyle(badge.textContent))
        .observe(badge, { childList: true, characterData: true, subtree: true });
})();
