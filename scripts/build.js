import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';

const isWatch = process.argv.includes('--watch');

const buildOptions = {
    entryPoints: [
        'src/entries/content.entry.js',
        'src/entries/background.entry.js',
        'src/entries/sidebar.entry.js',
        'src/entries/print.entry.js',
        'src/entries/intercept.entry.js'
    ],
    bundle: true,
    outdir: 'dist',
    minify: !isWatch,
    sourcemap: isWatch ? 'inline' : false,
    format: 'iife', // Auto-executing function since Chrome Content Scripts don't easily support unbundled modules
    target: ['chrome100']
};

async function build() {
    try {
        if (isWatch) {
            const ctx = await esbuild.context(buildOptions);
            await ctx.watch();
            console.log('👀 Watching for changes in extension files...');
        } else {
            await esbuild.build(buildOptions);
            console.log('✅ Extension built successfully to dist/');
        }
    } catch (e) {
        console.error('Build failed', e);
        process.exit(1);
    }
}

build();
