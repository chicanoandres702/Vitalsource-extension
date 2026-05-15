/**
 * Global state container for the sidebar.
 * Fixes "isFixed is not defined" by ensuring variables are initialized.
 */
export interface SidebarState {
  isFixed: boolean;
}

export const sidebarState: SidebarState = {
  isFixed: false
};