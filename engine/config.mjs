/**
 * Projects and clips. A project is a folder in the workspace's projects/
 * with a project.json (the product it records and where clips go) and,
 * optionally, a project.mjs of hooks. A clip is one scenario module in its
 * scenarios/.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import encodePresets from './encode.json' with { type: 'json' };
import { expand } from './workspace.mjs';
import { readJson } from './files.mjs';

/** Where Dolly itself is installed: the Studio's files and the engine live here, never a user's clips. */
export const PACKAGE = fileURLToPath(new URL('..', import.meta.url));

/** The delivery presets (`web-1920`), and `master`, the settings every take is stitched with. */
export const presets = encodePresets;

/** Every project in a workspace: name, alias and folder. */
export function listProjects(ws) {
  const dir = ws.paths.projects;
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'project.json')))
    .map((d) => {
      const config = readJson(join(dir, d.name, 'project.json'));
      return { name: config.name ?? d.name, alias: config.alias, dir: join(dir, d.name) };
    });
}

/**
 * A project by name or alias, with its project.json, hooks, preset and
 * every path resolved. `masters` and `out` move those folders for one run.
 * @param {ReturnType<import('./workspace.mjs').loadWorkspace>} ws
 * @param {string} name
 * @param {{masters?: string, out?: string}} [options]
 */
export async function loadProject(ws, name, { masters, out } = {}) {
  const projects = listProjects(ws);
  const found = projects.find((p) => p.name === name || p.alias === name);
  if (!found) {
    const known = projects.map((p) => (p.alias ? `${p.name} (${p.alias})` : p.name)).join(', ');
    throw new Error(`this workspace has no project "${name}"; ${known ? `it has ${known}` : `\`dolly init ${name} --from <repo>\` adds it`}`);
  }
  const config = readJson(join(found.dir, 'project.json'));
  if (!config.base) throw new Error(`projects/${found.name}/project.json needs a "base": the URL the product answers at, like "http://localhost:5173"`);
  const hooksFile = join(found.dir, 'project.mjs');
  const hooks = existsSync(hooksFile) ? await import(pathToFileURL(hooksFile).href) : {};
  const preset = presets[config.preset ?? 'web-1920'];
  if (!preset || config.preset === 'master') {
    const names = Object.keys(presets).filter((k) => k !== 'master').join(', ');
    throw new Error(`projects/${found.name}/project.json asks for the preset "${config.preset}", which Dolly does not have; use ${names}`);
  }
  return {
    ...config,
    name: found.name,
    dir: found.dir,
    workspace: ws,
    viewport: { width: 1440, height: 900, dpr: 2, ...config.viewport },
    query: config.query ?? {},
    /* Relative folders in project.json are relative to the workspace, wherever Dolly is run from. */
    start: config.start && { ...config.start, cwd: expand(config.start.cwd, ws.root) },
    deliver: Object.fromEntries(Object.entries(config.deliver ?? {}).map(([key, dir]) => [key, expand(dir, ws.root)])),
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

/** The folder a project delivers `key` to, or an error that says how to name one. */
export function deliverFolder(project, key, what) {
  const dir = project.deliver[key];
  if (!dir) {
    const named = Object.keys(project.deliver);
    throw new Error(`${project.name}'s project.json names no deliver folder "${key}" for ${what}`
      + `${named.length ? ` (it names ${named.join(', ')})` : ''}; add one under "deliver", like "${key}": "~/site/public/media"`);
  }
  return dir;
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
  const matched = [];
  for (const pattern of patterns) {
    const glob = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    const hits = all.filter((name) => glob.test(name));
    if (!hits.length) throw new Error(`${project.name} has no clip matching "${pattern}"; \`dolly list ${project.name}\` shows its clips`);
    matched.push(...hits.filter((name) => !matched.includes(name)));
  }
  return matched;
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

/**
 * A clip: its scenario module (`setup`, the take, `direction` or `camera`),
 * its meta resolved against the project, and the paths of its master, take
 * file, camera file, render and poster. A clip with only a master loads too.
 * @param {Awaited<ReturnType<typeof loadProject>>} project
 * @param {string} name
 */
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
  const hashAt = meta.url.indexOf('#');
  const path = hashAt < 0 ? meta.url : meta.url.slice(0, hashAt);
  const url = new URL(path, project.base);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return `${url.href}${hashAt < 0 ? '' : meta.url.slice(hashAt)}`;
}
