import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { docsPlugin } from './docs/build.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = fileURLToPath(new URL('..', import.meta.url));

/*
 * The reference's command table is `dolly --help` itself, read at build
 * time, so the page can never list a command the CLI does not have.
 * `virtual:dolly-help` exports the help's groups: [{title, rows: [[usage, summary]]}].
 */
function dollyHelp() {
  const id = 'virtual:dolly-help';
  return {
    name: 'dolly-help',
    resolveId: (source) => (source === id ? `\0${id}` : null),
    load(resolved) {
      if (resolved !== `\0${id}`) return null;
      const text = execFileSync(process.execPath, ['bin/dolly.mjs', '--help'], { cwd: root, encoding: 'utf8' });
      const groups = [];
      for (const block of text.split(/\n\s*\n/)) {
        const [title, ...lines] = block.split('\n');
        const rows = lines.map((l) => /^ {2}(dolly .+?) {2,}(.+)$/.exec(l)).filter(Boolean).map(([, usage, summary]) => [usage, summary]);
        if (rows.length) groups.push({ title, rows });
      }
      const more = /`(dolly help <command>)` shows (.+?)\./.exec(text);
      if (more) groups.at(-1).rows.push([more[1], `Show ${more[2]}`]);
      return `export default ${JSON.stringify(groups)};`;
    },
  };
}

/*
 * The site imports the engine's camera modules and the Studio's controls
 * directly, so the hero runs the renderer's own maths and the lens is the
 * Studio's own. Built for GitHub Pages at /dolly/, with the docs at /dolly/docs/.
 */
export default defineConfig(({ command, isPreview }) => ({
  root: here,
  base: command === 'build' || isPreview ? '/dolly/' : '/',
  plugins: [react(), dollyHelp(), docsPlugin(root)],
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
