/**
 * Reading a product's repo for `dolly init`: its dev script, framework,
 * package manager and port. The repo is only ever read. Every answer comes
 * with the reason for it, so init can print what it inferred and why.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { displayPath } from './util.mjs';

const LOCKS = [
  ['package-lock.json', 'npm'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
];

/** Scripts that start a dev server, in the order they are tried. */
export const DEV_SCRIPTS = ['dev', 'start', 'develop', 'serve'];

/* Frameworks by what their dev script runs, then by dependency. `port` is the one a bare dev script serves on. */
export const FRAMEWORKS = {
  next: { label: 'Next.js', port: 3000, script: /\bnext\b/, dep: 'next' },
  astro: { label: 'Astro', port: 4321, script: /\bastro\b/, dep: 'astro' },
  sveltekit: { label: 'SvelteKit', port: 5173, script: /\bvite\b/, dep: '@sveltejs/kit' },
  vite: { label: 'Vite', port: 5173, script: /\bvite\b/, dep: 'vite' },
  cra: { label: 'Create React App', port: 3000, script: /\breact-scripts\s+start\b/, dep: 'react-scripts' },
};

/** The package manager: the lockfile in the repo or a folder above it (up to the git root), else packageManager, else npm. */
export function packageManager(dir, pkg) {
  for (let d = dir; ; d = dirname(d)) {
    const lock = LOCKS.find(([file]) => existsSync(join(d, file)));
    if (lock) return { pm: lock[1], why: d === dir ? lock[0] : `${lock[0]} in ${displayPath(d)}` };
    if (existsSync(join(d, '.git')) || dirname(d) === d) break;
  }
  const declared = /^(npm|pnpm|yarn|bun)@/.exec(pkg?.packageManager ?? '');
  if (declared) return { pm: declared[1], why: `packageManager "${pkg.packageManager}"` };
  return { pm: 'npm', why: 'no lockfile, so npm' };
}

/** The framework, from what `script` runs, then from the dependencies. */
export function framework(pkg, script) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const cmd = pkg.scripts?.[script] ?? '';
  if (FRAMEWORKS.sveltekit.script.test(cmd) && deps['@sveltejs/kit']) return { id: 'sveltekit', why: `@sveltejs/kit, and "${script}" runs vite` };
  for (const [id, f] of Object.entries(FRAMEWORKS)) {
    if (id !== 'sveltekit' && f.script.test(cmd)) return { id, why: `"${script}" runs \`${cmd}\`` };
  }
  for (const [id, f] of Object.entries(FRAMEWORKS)) {
    if (deps[f.dep]) return { id, why: `${f.dep} in its dependencies` };
  }
  return { id: 'plain', why: 'no framework Dolly knows in its package.json' };
}

/** A port the dev script pins itself: --port N, --port=N, -p N, or PORT=N before the command. */
export function scriptPort(cmd = '') {
  const m = /(?:--port[=\s]+|\s-p\s+|\bPORT=)(\d{2,5})\b/.exec(cmd);
  return m ? Number(m[1]) : null;
}

/** A port set in the framework's config file (vite.config.ts or astro.config.mjs `server: { port }`). */
export function configPort(dir, id) {
  const stem = { vite: 'vite.config', sveltekit: 'vite.config', astro: 'astro.config' }[id];
  if (!stem) return null;
  const file = readdirSync(dir).find((f) => f.startsWith(`${stem}.`));
  if (!file) return null;
  const m = /\bport\s*:\s*(\d{2,5})\b/.exec(readFileSync(join(dir, file), 'utf8'));
  return m ? { port: Number(m[1]), why: `${file} sets port ${m[1]}` } : null;
}

/** How to start the product's dev server on `port`, and whether that command pins the port. */
export function startCommand({ pm, script, id, cmd, port }) {
  const pinned = scriptPort(cmd) === port;
  let args = '';
  let env = '';
  if (id === 'vite' || id === 'sveltekit') args = pinned ? (/--strictPort/.test(cmd) ? '' : '--strictPort') : `--port ${port} --strictPort`;
  else if (id === 'next' || id === 'astro') args = pinned ? '' : `--port ${port}`;
  else if (id === 'cra') env = `${pinned ? '' : `PORT=${port} `}BROWSER=none `;
  const run = pm === 'npm' && args ? `npm run ${script} --` : `${pm} run ${script}`;
  return { line: `${env}${run}${args ? ` ${args}` : ''}`, pins: pinned || id !== 'plain' };
}

/** A short name: the initials of a hyphenated name (field-notes is fn), or the first three letters of one word over four letters. */
export function aliasFor(name, taken) {
  const parts = name.split(/[-_.]/).filter(Boolean);
  const alias = parts.length > 1 ? parts.map((p) => p[0]).join('') : name.length > 4 ? name.slice(0, 3) : null;
  return alias && !taken.has(alias) && alias !== name ? alias : null;
}

/** The port a local URL serves on, or null for a URL that is not on this machine. */
export function localPort(base) {
  try {
    const url = new URL(base);
    if (!/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(url.hostname)) return null;
    return Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  } catch {
    return null;
  }
}
