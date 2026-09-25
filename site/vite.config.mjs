import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

/*
 * The site imports the engine's camera modules directly, like the Studio, so
 * the hero runs the renderer's own maths. Built for GitHub Pages at /dolly/.
 */
export default defineConfig(({ command, isPreview }) => ({
  root: here,
  base: command === 'build' || isPreview ? '/dolly/' : '/',
  plugins: [react()],
  server: { fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, target: 'es2022' },
}));
