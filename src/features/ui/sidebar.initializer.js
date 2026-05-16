/**
 * Sidebar Initializer
 * Centralizes all service initialization for the sidebar.
 * Keeps sidebar.entry.js clean and under 100 lines.
 */
import chapterTreeService from '../ui/chapter-tree.service.js';
import manifestRipService from '../ui/manifest-rip.service.js';
import { coordinatorService } from '../orchestration/coordinator.service.js';

export function initializeSidebar(ui, sendCommand, setEngineState, flipDelay) {
    chapterTreeService.init(ui);
    manifestRipService.init(sendCommand, setEngineState, flipDelay);
    coordinatorService.init(sendCommand, flipDelay);
}
