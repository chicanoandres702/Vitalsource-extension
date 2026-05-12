/**
 * renderer.service.js
 * Manages the sidebar's visual state.
 */

const PilotRenderer = {
    updateProgress(current, total) {
        const bar = document.getElementById('progress-bar-fill');
        const hud = document.getElementById('page-count-hud');
        if (bar) bar.style.width = `${(current / Math.max(total, 1)) * 100}%`;
        if (hud) hud.textContent = `${current} / ${total}`;
    },

    updateFrameCount(count) {
        const squad = document.getElementById('squadron');
        if (squad) squad.textContent = `${count} Frame${count !== 1 ? 's' : ''}`;
    },

    setEngineActive(active) {
        const btn = document.getElementById('btn-run');
        const hud = document.getElementById('active-progress-hud');
        if (btn) {
            btn.innerHTML = active ? '<span>STOP SYSTEM</span>' : '<span>START SYSTEM</span>';
            btn.style.borderColor = active ? 'var(--red)' : 'var(--cyan)';
            btn.style.color = active ? 'var(--red)' : 'var(--cyan)';
        }
        if (hud) hud.classList.toggle('hidden', !active);
    },

    renderTOC(list) {
        const container = document.getElementById('chapter-list');
        const wrap = document.getElementById('chapter-list-wrap');
        if (!container || !Array.isArray(list)) return;

        if (wrap) wrap.classList.remove('hidden');
        container.innerHTML = list.map((item, i) => `
            <div class="toc-item flex items-center gap-2 p-1 hover:bg-white/5 cursor-pointer">
                <div class="mono text-[8px] text-dim w-4">${i+1}</div>
                <div class="text-[9px] text-bright truncate flex-1">${item.title || 'Untitled'}</div>
                <div class="mono text-[8px] text-cyan-dim">${item.page || ''}</div>
            </div>
        `).join('');

        const count = document.getElementById('selection-count');
        if (count) count.textContent = `${list.length} ITEMS DETECTED`;
    },

    updateVesselInfo(id, meta) {
        const idLabel = document.getElementById('vessel-id');
        const metaLabel = document.getElementById('meta-info');
        if (idLabel) idLabel.textContent = `VESSEL: ${id}`;
        if (metaLabel) metaLabel.textContent = meta || 'Stabilizing...';
    }
};

window.PilotRenderer = PilotRenderer;

class SnapPreview {
    constructor() {
        this.snapCount = 0;
        this.init();
    }

    init() {
        window.addEventListener('snap-updated', () => this.updatePreview());
    }

    updatePreview() {
        const previewElement = document.getElementById('snap-preview');
        if (previewElement) {
            previewElement.textContent = `Snaps: ${this.snapCount}`;
        }
    }

    addSnap() {
        this.snapCount++;
        this.updatePreview();
    }
}

// Initializer
const snapPreview = new SnapPreview();
