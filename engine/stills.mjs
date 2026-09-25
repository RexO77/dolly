/**
 * Stills: one frame per shot, from the same off-screen window a take uses,
 * so a still has the display's own pixel ratio. A project lists its shots in
 * projects/<p>/stills.mjs:
 *
 *   export const shots = [{ name, url, wait?, element?, deliver? }];
 *   export const css = '...';                  hidden before every shot
 *   export async function init(page) {}        once, before the first shot
 *   export async function before(page, shot) {} each shot, after it loads
 *
 * Output: out/<p>/stills/<name>.webp. A batch fails when two shots come out
 * byte-identical: two routes rendering the same thing is a mistake to fix,
 * not a still to ship.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { clipUrl } from './config.mjs';
import { openBrowser, fitWindow } from './browser.mjs';
import { sleep } from './motion.mjs';

export async function loadStills(project) {
  const file = join(project.dir, 'stills.mjs');
  if (!existsSync(file)) throw new Error(`${project.name} has no stills.mjs`);
  return import(pathToFileURL(file).href);
}

export async function shootStills(project, { filter, query = {}, log = console.log } = {}) {
  const mod = await loadStills(project);
  const shots = mod.shots.filter((s) => !filter || s.name.includes(filter));
  if (!shots.length) throw new Error(`no stills match "${filter}"`);
  const viewport = { width: project.viewport.width, height: project.viewport.height, ...mod.viewport };
  const outDir = join(project.paths.out, 'stills');
  const tmp = join(project.paths.tmp, 'stills');
  mkdirSync(outDir, { recursive: true });
  mkdirSync(tmp, { recursive: true });

  const browser = await openBrowser(viewport);
  const { page } = browser;
  const results = [];
  try {
    if (mod.init) await mod.init(page);
    for (const shot of shots) {
      const url = clipUrl(project, { url: shot.url, query: { ...project.query, ...shot.query } }, query);
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await fitWindow(page, viewport);
        if (mod.css) await page.addStyleTag({ content: mod.css });
        await page.evaluate(async () => {
          await document.fonts.ready;
        });
        if (mod.before) await mod.before(page, shot);
        await sleep(shot.wait ?? 1500);
        const png = join(tmp, `${shot.name}.png`);
        const webp = join(outDir, `${shot.name}.webp`);
        if (shot.element) {
          const el = await page.$(shot.element);
          if (!el) throw new Error(`element not found: ${shot.element}`);
          await el.screenshot({ path: png });
        } else {
          await page.screenshot({ path: png });
        }
        execFileSync('cwebp', ['-quiet', '-q', '85', png, '-o', webp]);
        results.push({ shot, file: webp });
        log(`  ${shot.name}`);
      } catch (error) {
        results.push({ shot, error });
        log(`  ${shot.name} FAILED: ${error.message}`);
      }
    }
  } finally {
    await browser.close();
    rmSync(tmp, { recursive: true, force: true });
  }

  const byHash = new Map();
  for (const r of results.filter((r) => r.file)) {
    const h = createHash('sha1').update(readFileSync(r.file)).digest('hex');
    byHash.set(h, [...(byHash.get(h) ?? []), r.shot.name]);
  }
  const duplicates = [...byHash.values()].filter((names) => names.length > 1);
  return { results, duplicates, outDir, deliver: mod.deliver ?? 'default' };
}
