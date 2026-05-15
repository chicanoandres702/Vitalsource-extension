import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const isWatch = process.argv.includes('--watch');

const buildOptions = {
    entryPoints: [
        'src/entries/content.entry.js',
        // Design Intent: Centralize the background router as a primary entry point
        // for the extension's service worker.
        'src/entries/background.entry.js',
        'src/entries/sidebar.entry.js',
        'src/entries/print.entry.js',
        'src/entries/intercept.entry.js',
        // Design Intent: Bundle mobile features into dist to remove src dependency
        'src/features/mobile/floating-menu.js'
    ],
    bundle: true,
    outdir: 'dist',
    minify: !isWatch,
    sourcemap: isWatch ? 'inline' : false,
    format: 'iife', // Auto-executing function since Chrome Content Scripts don't easily support unbundled modules
    target: ['chrome100'],
    // Design Intent: Preserve original entry point filenames in the output 
    // directory to maintain alignment with manifest.json references.
    entryNames: '[name]'
};

async function copyStaticAssets() {
    const assets = [
        'manifest.json',
        'sidebar.html',
        'print.html',
        'icon.svg',
        'html2pdf.bundle.min.js',
        'src/features/mobile/menu.styles.css'
    ];
    for (const asset of assets) {
        try {
            const dest = path.join('dist', path.basename(asset));
            await fs.copyFile(asset, dest);
        } catch (e) {}
    }
}

async function build() {
    try {
        // Design Intent: Clear the dist directory before a production build 
        // to ensure that stale artifacts or removed features do not persist.
        if (!isWatch) await fs.rm('dist', { recursive: true, force: true });
        await fs.mkdir('dist', { recursive: true });

        if (isWatch) {
            const ctx = await esbuild.context(buildOptions);
            await ctx.watch();
            console.log('👀 Watching for changes in extension files...');
        } else {
            await esbuild.build(buildOptions);
            // Design Intent: Sync static assets after compilation
            await copyStaticAssets();
            console.log('✅ Extension built successfully to dist/');
        }
    } catch (e) {
        console.error('Build failed', e);
        process.exit(1);
    }
}

build();
