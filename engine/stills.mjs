/**
 * Stills: one frame per shot, from the same off-screen window a take uses,
 * so a still has the display's own pixel ratio. A project lists its shots in
 * projects/<p>/stills.mjs:
 *
 *   export const shots = [{ name, url, query?, wait?, element?, deliver? }];
 *   export const css = '...';                            hidden before every shot
 *   export const deliver = 'default';                    where shots go without their own `deliver`
 *   export async function init(page, { query }) {}       once, before the first shot
 *   export async function before(page, shot, { url, query }) {}   each shot, after it loads
 *
 * Output: out/<p>/stills/<name>.webp. A batch fails when two shots come out
 * byte-identical: two routes rendering the same thing is a mistake to fix,
 * not a still to ship.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { clipUrl, deliverFolder } from './config.mjs';
import { openBrowser, fitWindow } from './browser.mjs';
import { sleep } from './motion.mjs';
import { pngToWebp, requireTools } from './ffmpeg.mjs';
import { deliverFiles } from './files.mjs';

/** A project's stills.mjs, with every shot's deliver folder and query resolved. */
export async function loadStills(project) {
  const file = join(project.dir, 'stills.mjs');
  if (!existsSync(file)) throw new Error(`${project.name} has no stills: add projects/${project.name}/stills.mjs with a list of shots (docs/workspaces.md shows one)`);
  const mod = await import(pathToFileURL(file).href);
  if (!Array.isArray(mod.shots)) throw new Error(`projects/${project.name}/stills.mjs needs \`export const shots = [...]\``);
  const shots = mod.shots.map((shot) => ({
    ...shot,
    deliver: shot.deliver ?? mod.deliver ?? 'default',
    query: { ...project.query, ...shot.query },
  }));
  return { ...mod, shots };
}

/** The shots whose names contain `filter` (all of them without one). */
function pick(shots, filter) {
  const picked = shots.filter((shot) => !filter || shot.name.includes(filter));
  if (!picked.length) throw new Error(`no still is named like "${filter}"; stills.mjs has ${shots.map((s) => s.name).join(', ')}`);
  return picked;
}

const stillPath = (project, name) => join(project.paths.out, 'stills', `${name}.webp`);

/** Load one shot's page, style it, and write its WebP. */
async function shoot(page, project, stills, shot, { url, query, frameDir }) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await fitWindow(page, stills.viewport);
  if (stills.css) await page.addStyleTag({ content: stills.css });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  if (stills.before) await stills.before(page, shot, { url, query });
  await sleep(shot.wait ?? 1500);
  const png = join(frameDir, `${shot.name}.png`);
  if (shot.element) {
    const el = await page.$(shot.element);
    if (!el) throw new Error(`nothing on the page matches its element, ${shot.element}`);
    await el.screenshot({ path: png });
  } else {
    await page.screenshot({ path: png });
  }
  const webp = stillPath(project, shot.name);
  pngToWebp(png, webp, 85);
  return webp;
}

/**
 * Shoot a project's stills. `filter` picks shots by name; `query` adds to
 * every shot's URL. Returns {results, duplicates, outDir}: each result is
 * {shot, file} or {shot, error}, and `duplicates` lists names that came out
 * byte-identical.
 */
export async function shootStills(project, { filter, query = {}, log = console.log } = {}) {
  requireTools('cwebp');
  const loaded = await loadStills(project);
  const shots = pick(loaded.shots, filter);
  const viewport = { width: project.viewport.width, height: project.viewport.height, ...loaded.viewport };
  const stills = { ...loaded, viewport };
  const outDir = join(project.paths.out, 'stills');
  const frameDir = join(project.paths.tmp, 'stills');
  mkdirSync(outDir, { recursive: true });
  mkdirSync(frameDir, { recursive: true });

  const browser = await openBrowser(viewport);
  const results = [];
  try {
    if (stills.init) await stills.init(browser.page, { query });
    for (const shot of shots) {
      const shotQuery = { ...shot.query, ...query };
      const url = clipUrl(project, { url: shot.url ?? '/', query: shotQuery });
      try {
        results.push({ shot, file: await shoot(browser.page, project, stills, shot, { url, query: shotQuery, frameDir }) });
        log(`  ${shot.name}`);
      } catch (error) {
        results.push({ shot, error });
        log(`  ${shot.name} FAILED: ${error.message}`);
      }
    }
  } finally {
    await browser.close();
    rmSync(frameDir, { recursive: true, force: true });
  }

  const byHash = new Map();
  for (const { shot, file } of results.filter((r) => r.file)) {
    const hash = createHash('sha1').update(readFileSync(file)).digest('hex');
    byHash.set(hash, [...(byHash.get(hash) ?? []), shot.name]);
  }
  const duplicates = [...byHash.values()].filter((names) => names.length > 1);
  return { results, duplicates, outDir };
}

/**
 * Copy shot stills to the deliver folder each one names (its own
 * `deliver`, else the module's, else `default`). Stills not shot yet are
 * listed in `missing`. Returns {copied, same, held, missing}.
 */
export async function deliverStills(project, { filter, overwrite = false } = {}) {
  const { shots } = await loadStills(project);
  const result = { copied: [], same: [], held: [], missing: [] };
  /* Every folder is checked before anything is copied, so a missing one never leaves a delivery half done. */
  const planned = [];
  for (const shot of pick(shots, filter)) {
    const file = stillPath(project, shot.name);
    if (existsSync(file)) planned.push([file, deliverFolder(project, shot.deliver, `the still ${shot.name}`)]);
    else result.missing.push(shot.name);
  }
  for (const [file, dir] of planned) {
    const done = deliverFiles([file], dir, { overwrite });
    for (const key of ['copied', 'same', 'held']) result[key].push(...done[key]);
  }
  return result;
}
