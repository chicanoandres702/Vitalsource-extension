/**
 * Mobile Floating Menu Logic
 * Replaces the sidebar on Android devices.
 */

class MobileMenu {
    constructor() {
        this.isOpen = false;
        this.mount();
    }

    mount() {
        // Create FAB
        const fab = document.createElement('div');
        fab.id = 'vst-mobile-fab';
        fab.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
            </svg>
        `;
        fab.onclick = () => this.toggle();
        document.body.appendChild(fab);

        // Create Drawer
        const drawer = document.createElement('div');
        drawer.id = 'vst-mobile-drawer';
        drawer.innerHTML = `
            <div class="vst-drawer-header">
                <h2>Pilot Pro Mobile</h2>
                <button id="vst-close-drawer">✕</button>
            </div>
            <div class="vst-drawer-content">
                <div id="vst-mobile-controls" style="display: flex; gap: 10px; margin-bottom: 20px;">
                     <button class="btn-primary" id="vst-mob-run">Run</button>
                     <button class="btn-secondary" id="vst-mob-pick">Pick</button>
                     <button class="btn-danger" id="vst-mob-stop">Stop</button>
                </div>
                <div id="vst-mobile-status">Ready</div>
            </div>
        `;
        document.body.appendChild(drawer);

        document.getElementById('vst-mob-run').onclick = () => {
            this.updateStatus('Starting...');
            window.dispatchEvent(new CustomEvent('vst-command', { detail: { action: 'START_FULL_RIP' } }));
        };

        document.getElementById('vst-mob-pick').onclick = () => {
            this.updateStatus('Pick element...');
            window.dispatchEvent(new CustomEvent('vst-command', { detail: { action: 'PICK' } }));
            this.close(); // Close drawer to see the page
        };

        document.getElementById('vst-mob-stop').onclick = () => {
            this.updateStatus('Stopping...');
            window.dispatchEvent(new CustomEvent('vst-command', { detail: { action: 'STOP_RIP' } }));
        };

        document.getElementById('vst-close-drawer').onclick = () => this.close();
    }

    updateStatus(text) {
        const el = document.getElementById('vst-mobile-status');
        if (el) el.textContent = text;
    }

    toggle() {
        this.isOpen ? this.close() : this.open();
    }

    open() {
        this.isOpen = true;
        document.getElementById('vst-mobile-drawer').classList.add('open');
    }

    close() {
        this.isOpen = false;
        document.getElementById('vst-mobile-drawer').classList.remove('open');
    }
}

// Initializer
if (navigator.userAgent.toLowerCase().includes('android')) {
    new MobileMenu();
}
