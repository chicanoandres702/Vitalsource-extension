/**
 * Chapter Tree UI Component
 * Renders the TOC table of contents, checkbox selection, and expansion states.
 */
import { debounce } from '../../services/utils.service.js';

let bookOutline = [];
let groupedChapters = [];
let expandedChapters = new Set();
let selectedChapters = new Set();
let chapterSearchTerm = '';
let captureMode = 'full';

export const chapterTreeService = {
    init(uiElements) {
        this.ui = uiElements;
        this.setupListeners();
        // Auto-load saved TOC from localStorage (old git commit pattern)
        setTimeout(() => {
            const keys = Object.keys(localStorage).filter(k => k.startsWith('__VS_TOC_'));
            if (keys.length > 0) {
                try {
                    const saved = JSON.parse(localStorage.getItem(keys[0]));
                    if (Array.isArray(saved) && saved.length > 0) {
                        this.handleOutlineUpdate(saved);
                        console.log('[PilotPro] Auto-loaded TOC from localStorage:', saved.length);
                    }
                } catch (e) {}
            }
        }, 800);
    },

    setupListeners() {
        this.ui.chapterSearch.oninput = debounce(() => {
            chapterSearchTerm = this.ui.chapterSearch.value;
            this.renderChapterList();
        }, 300);

        this.ui.btnSelAll.onclick = () => {
            groupedChapters.forEach(rootNode => {
                this.collectCfis(rootNode).forEach(cfi => selectedChapters.add(cfi));
            });
            this.updateSelectionState();
        };

        this.ui.btnDeselAll.onclick = () => {
            selectedChapters.clear();
            this.updateSelectionState();
        };
    },

    setMode(mode) {
        captureMode = mode;
        if (mode === 'chapter') {
            this.ui.chapterWrap.classList.remove('hidden');
            this.renderChapterList();
        } else {
            this.ui.chapterWrap.classList.add('hidden');
        }
    },

    getMode() { return captureMode; },
    getOutline() { return bookOutline; },
    getSelectedChapters() { return selectedChapters; },

    handleOutlineUpdate(data) {
        if (!data || data.length === 0) return;
        bookOutline = data;
        
        const root = [];
        const stack = [{ level: 0, children: root }];

        data.forEach(item => {
            const node = { ...item, children: [], id: 'node_' + Math.random().toString(36).substr(2, 9) };
            while (stack.length > 1 && stack[stack.length - 1].level >= item.level) stack.pop();
            stack[stack.length - 1].children.push(node);
            stack.push(node);
        });

        groupedChapters = root;
        this.ui.chapterPanel.style.display = 'block';
        if (this.ui.manifestIndicator) this.ui.manifestIndicator.classList.remove('hidden');
        this.renderChapterList();
    },

    collectCfis(node) {
        const cfis = [node.cfi];
        node.children.forEach(c => cfis.push(...this.collectCfis(c)));
        return cfis;
    },

    subtreeAllSelected(node) {
        return this.collectCfis(node).every(cfi => selectedChapters.has(cfi));
    },

    subtreeSomeSelected(node) {
        const cfis = this.collectCfis(node);
        const count = cfis.filter(cfi => selectedChapters.has(cfi)).length;
        return count > 0 && count < cfis.length;
    },

    renderChapterList() {
        const fragment = document.createDocumentFragment();
        const renderNode = (node, depth) => {
            const hasChildren = node.children.length > 0;
            const isExpanded  = expandedChapters.has(node.id);
            const allSel      = this.subtreeAllSelected(node);
            const someSel     = !allSel && this.subtreeSomeSelected(node);

            const wrap = document.createElement('div');
            const row = document.createElement('div');
            row.style.cssText = `display:flex;align-items:center;gap:6px;padding:5px 6px 5px ${depth * 14 + 6}px;border-radius:5px;cursor:pointer;transition:background 0.15s;`;
            row.onmouseenter = () => row.style.background = 'rgba(0,212,232,0.07)';
            row.onmouseleave = () => row.style.background = '';

            const arrow = document.createElement('span');
            arrow.textContent = hasChildren ? (isExpanded ? '▾' : '▸') : '·';
            arrow.style.cssText = `font-size:10px;width:10px;text-align:center;color:var(--cyan-dim);flex-shrink:0;opacity:${hasChildren ? 1 : 0.3};`;
            if (hasChildren) {
                arrow.style.cursor = 'pointer';
                arrow.onclick = (e) => {
                    e.stopPropagation();
                    if (isExpanded) expandedChapters.delete(node.id);
                    else expandedChapters.add(node.id);
                    this.renderChapterList();
                };
            }

            const box = document.createElement('div');
            box.style.cssText = `width:13px;height:13px;border-radius:3px;border:1px solid;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:all 0.15s;`;
            if (allSel) {
                box.style.background = 'var(--cyan)';
                box.style.borderColor = 'var(--cyan)';
                box.innerHTML = '<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="4"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            } else if (someSel) {
                box.style.background = 'rgba(0,212,232,0.35)';
                box.style.borderColor = 'var(--cyan)';
                box.innerHTML = '<div style="width:6px;height:2px;background:black;border-radius:1px"></div>';
            } else {
                box.style.background = 'rgba(0,0,0,0.4)';
                box.style.borderColor = '#334';
            }

            const label = document.createElement('span');
            label.textContent = node.title;
            label.style.cssText = `flex:1;font-size:9.5px;letter-spacing:0.02em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${allSel ? 'var(--cyan-bright)' : 'var(--text-muted, #8899aa)'};font-weight:${allSel ? 700 : 400};`;

            row.appendChild(arrow);
            row.appendChild(box);
            row.appendChild(label);

            if (node.page) {
                const badge = document.createElement('span');
                badge.textContent = `p${node.page}`;
                badge.style.cssText = 'font-size:7px;color:#445566;flex-shrink:0;';
                row.appendChild(badge);
            }

            row.onclick = () => {
                const newState = !this.subtreeAllSelected(node);
                this.collectCfis(node).forEach(cfi => {
                    if (newState) selectedChapters.add(cfi);
                    else selectedChapters.delete(cfi);
                });
                this.updateSelectionState();
            };

            wrap.appendChild(row);

            if (isExpanded && hasChildren) {
                const stripe = document.createElement('div');
                stripe.style.cssText = `border-left:1px solid rgba(0,212,232,0.12);margin-left:${depth * 14 + 11}px;`;
                node.children.forEach(child => stripe.appendChild(renderNode(child, depth + 1)));
                wrap.appendChild(stripe);
            }
            return wrap;
        };

        groupedChapters.forEach(rootNode => {
            const el = renderNode(rootNode, 0);
            if (el) fragment.appendChild(el);
        });
        this.ui.chapterList.innerHTML = '';
        this.ui.chapterList.appendChild(fragment);
        
        this.updateSelectionState(false);
    },
    updateSelectionState(refreshList = true) {
        if (this.ui.selectionCount) this.ui.selectionCount.textContent = `${selectedChapters.size} SELECTED`;
        if (refreshList) this.renderChapterList();
    }
};

// Auto-sync TOC from intercept (restored from old git commits)
window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data && (event.data.type === 'VS_OUTLINE_JSON' || event.data.type === 'VS_PAGEBREAKS_JSON')) {
        const outline = event.data.data || event.data;
        if (Array.isArray(outline) && outline.length > 0) {
            chapterTreeService.handleOutlineUpdate(outline);
            console.log('[PilotPro] TOC synced via postMessage:', outline.length, 'items');
        }
    }
});

export default chapterTreeService;
