import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { docsPlugin } from './docs/build.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = fileURLToPath(new URL('..', import.meta.url));

/*
 * The site imports the engine's camera modules and the Studio's controls
 * directly, so the hero runs the renderer's own maths and the lens is the
 * Studio's own. Built for GitHub Pages at /dolly/, with the docs at /dolly/docs/.
 */
export default defineConfig(({ command, isPreview }) => ({
  root: here,
  base: command === 'build' || isPreview ? '/dolly/' : '/',
  plugins: [react(), docsPlugin(root)],
  server: { fs: { allow: [root] } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    /* The landing page, and the docs' template: docsPlugin writes a page from it for every doc. */
    rollupOptions: { input: { main: `${here}index.html`, docs: `${here}docs.html` } },
  },
}));
