/**
 * Selectors and patterns for content detection.
 * Design Intent: Centralize configuration to allow easy updates for new 
 * reader UI versions without touching logic modules.
 */

export const CONTENT_SELECTORS = [
    'body > mosaic-book',
    'mosaic-book',
    'mosaic-page',
    '#epub-content-container', 
    'section.chapter-rw',
    '.mosaic-page',
    '.epub-container',
    '.vst-main',
    'main[role="main"]',
    '.vst-cover',
    '.cover-image',
    '.book-cover',
    '.front-matter',
    'img[alt*="cover" i]'
];

export const UNWANTED_SELECTORS = [
    '.pbk-page-header', '.vst-navigation-header', '.epub-running-head',
    '.epub-running-hf', '.epub-running-foot', '.vst-sidebar-ignore',
    '.breadcrumb', '.page-heading-nav', '.vst-breadcrumbs', '.vst-tooltip',
    '.sr-only', '.visually-hidden', '.assistive-text', '[aria-hidden="true"]',
    '#page-number-input', '.page-number-display', '.reader-toolbar', '.site-nav'
];

export const JUNK_PHRASES = [
    'undefined', 'section content', 'loading content', 
    'fetching', 'please wait', 'seq '
];