/**
 * Projects and clips. A project is a folder in the workspace's projects/
 * with a project.json (the product it records and where clips go) and,
 * optionally, a project.mjs of hooks. A clip is one scenario module in its
 * scenarios/.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import presets from './encode.json' with { type: 'json' };
import { expand } from './workspace.mjs';

/** Where Dolly itself is installed: the Studio's files and the engine live here, never a user's clips. */
export const PACKAGE = fileURLToPath(new URL('..', import.meta.url));
export { presets, expand };

/** Every project in a workspace: name, alias and folder. */
export function listProjects(ws) {
  const dir = ws.paths.projects;
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'project.json')))
    .map((d) => {
      const cfg = JSON.parse(readFileSync(join(dir, d.name, 'project.json'), 'utf8'));
      return { name: cfg.name ?? d.name, alias: cfg.alias, dir: join(dir, d.name) };
    });
}

/** A project by name or alias, with every path resolved. */
export async function loadProject(ws, name, { masters, out } = {}) {
  const found = listProjects(ws).find((p) => p.name === name || p.alias === name);
  if (!found) {
    const known = listProjects(ws).map((p) => (p.alias ? `${p.name} (${p.alias})` : p.name)).join(', ');
    throw new Error(`no project "${name}" in ${ws.root}${known ? `; there is ${known}` : '; `dolly init <name>` adds one'}`);
  }
  const cfg = JSON.parse(readFileSync(join(found.dir, 'project.json'), 'utf8'));
  if (!cfg.base) throw new Error(`${found.name}/project.json needs a "base" URL`);
  const hooksFile = join(found.dir, 'project.mjs');
  const hooks = existsSync(hooksFile) ? await import(pathToFileURL(hooksFile).href) : {};
  const preset = presets[cfg.preset ?? 'web-1920'];
  if (!preset) throw new Error(`${found.name}: no preset "${cfg.preset}"; there is ${Object.keys(presets).filter((k) => k !== 'master').join(', ')}`);
  return {
    ...cfg,
    name: found.name,
    dir: found.dir,
    workspace: ws,
    viewport: { width: 1440, height: 900, dpr: 2, ...cfg.viewport },
    query: cfg.query ?? {},
    start: cfg.start && { ...cfg.start, cwd: expand(cfg.start.cwd) },
    deliver: Object.fromEntries(Object.entries(cfg.deliver ?? {}).map(([k, v]) => [k, expand(v)])),
    preset,
    hooks,
    paths: {
      scenarios: join(found.dir, 'scenarios'),
      cameras: join(found.dir, 'cameras'),
      masters: join(expand(masters) ?? ws.paths.masters, found.name),
      out: join(expand(out) ?? ws.paths.out, found.name),
      tmp: join(ws.paths.tmp, found.name),
    },
  };
}

/** The clip names a project has scenarios for. */
export function listClips(project) {
  if (!existsSync(project.paths.scenarios)) return [];
  return readdirSync(project.paths.scenarios)
    .filter((f) => f.endsWith('.mjs') && !f.startsWith('_'))
    .map((f) => f.slice(0, -4))
    .sort();
}

/**
 * Clip names from the command line: exact names, or globs with `*`. Clips
 * that only have a master (their scenario lives elsewhere) match too, for
 * the stages that do not record.
 */
export function matchClips(project, patterns, { recorded = false } = {}) {
  const names = new Set(listClips(project));
  if (recorded && existsSync(project.paths.masters)) {
    for (const f of readdirSync(project.paths.masters)) if (/^[^.]+\.mp4$/.test(f)) names.add(f.slice(0, -4));
  }
  const all = [...names].sort();
  if (!patterns.length) return all;
  const out = [];
  for (const p of patterns) {
    const re = new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    const hit = all.filter((n) => re.test(n));
    if (!hit.length) throw new Error(`${project.name} has no clip matching "${p}"`);
    out.push(...hit.filter((n) => !out.includes(n)));
  }
  return out;
}

/** Defaults every scenario's `meta` starts from. */
const META = {
  url: '/',
  leadMs: 700,
  tailMs: 1400,
  takes: 1,
  deliver: 'default',
  output: {},
};

/** A clip's scenario module, with its meta resolved against the project. */
export async function loadClip(project, name) {
  const file = join(project.paths.scenarios, `${name}.mjs`);
  const mod = existsSync(file) ? await import(pathToFileURL(file).href) : {};
  const meta = { ...META, ...mod.meta };
  meta.viewport = { ...project.viewport, ...mod.meta?.viewport };
  meta.query = meta.query === false ? {} : { ...project.query, ...meta.query };
  return {
    name,
    file: existsSync(file) ? file : null,
    meta,
    setup: mod.setup,
    take: mod.default,
    camera: mod.camera,
    direction: mod.direction,
    paths: {
      master: join(project.paths.masters, `${name}.mp4`),
      take: join(project.paths.masters, `${name}.take.json`),
      camera: join(project.paths.cameras, `${name}.camera.json`),
      out: join(project.paths.out, `${name}.mp4`),
      poster: join(project.paths.out, `${name}-poster.webp`),
    },
  };
}

/** The page URL for a clip: the project's base and the clip's path, its query spliced in before any hash route. */
export function clipUrl(project, meta, extra = {}) {
  const query = { ...meta.query, ...extra };
  const [path, hash] = meta.url.split('#');
  const url = new URL(path, project.base);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return `${url.href}${hash !== undefined ? `#${hash}` : ''}`;
}
