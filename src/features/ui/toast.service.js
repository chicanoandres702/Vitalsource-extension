/**
 * Toast UI Service
 * Design Intent: Provides visual feedback for capture events.
 */
export const toastService = {
    showVisualConfirmation(label) {
        const toast = document.createElement('div');
        toast.id = 'pilot-confirmation';
        Object.assign(toast.style, {
            position: 'fixed', top: '20px', left: '20px', zIndex: '2147483647',
            background: '#059669', color: '#ffffff', padding: '12px 20px',
            borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.4)',
            fontFamily: 'Inter, sans-serif', fontWeight: 'bold', fontSize: '14px',
            display: 'flex', alignItems: 'center', gap: '10px',
            transition: 'all 0.4s ease', transform: 'translateY(-100px)', opacity: '0'
        });
        toast.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Captured: ${label}
        `;
        document.body.appendChild(toast);
        requestAnimationFrame(() => {
            toast.style.transform = 'translateY(0)';
            toast.style.opacity = '1';
        });
        setTimeout(() => {
            toast.style.transform = 'translateY(-20px)';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 2000);
    }
};