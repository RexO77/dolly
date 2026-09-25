/**
 * One take: open the product, run the scenario's setup off camera, then
 * capture while the scenario plays, and write the master and its take file
 * (beats, boxes and notes on the master's own clock).
 *
 * Recording starts once the page has loaded and its fonts have settled, and
 * stops `tailMs` after the scenario returns, so a clip ends on a still frame.
 * A take is rejected, and retried up to `takes` times, when the scenario
 * throws or when the product reloads mid-take (a Vite hot update resets the
 * app, and a reset take must never ship).
 */
import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { clipUrl, presets } from './config.mjs';
import { openBrowser, fitWindow } from './browser.mjs';
import { startCapture, stitch } from './capture.mjs';
import { helpers, sleep } from './input.mjs';
import { probe } from './ffmpeg.mjs';

/** Keep the master and take a new recording replaces: masters are never deleted. */
function archive(paths) {
  if (!existsSync(paths.master)) return null;
  const stamp = statSync(paths.master).mtime.toISOString().replace(/[:.]/g, '-');
  const dir = join(paths.master, '..', '.history');
  mkdirSync(dir, { recursive: true });
  const name = paths.master.split('/').pop().replace(/\.mp4$/, '');
  const kept = join(dir, `${name}.${stamp}.mp4`);
  renameSync(paths.master, kept);
  if (existsSync(paths.take)) renameSync(paths.take, join(dir, `${name}.${stamp}.take.json`));
  return kept;
}

async function takeOnce(project, clip, { log, query }) {
  const { meta } = clip;
  const viewport = { width: meta.viewport.width, height: meta.viewport.height };
  const tmp = join(project.paths.tmp, 'frames', clip.name);
  const rel = project.workspace.rel;
  const browser = await openBrowser(viewport);
  const { page } = browser;
  const take = { project: project.name, clip: clip.name, beats: {}, boxes: {}, notes: [] };
  const h = helpers(page, viewport, take);
  h.clock.setup = performance.now();
  h.meta = meta;
  let recording = false;
  const reloads = [];
  page.on('load', () => recording && reloads.push('page load'));
  page.on('console', (m) => recording && /\[vite\]/.test(m.text()) && reloads.push(m.text()));
  try {
    const url = clipUrl(project, meta, query);
    await page.goto(url, { waitUntil: 'networkidle' });
    const fit = await fitWindow(page, viewport);
    fit.warnings.forEach((w) => log(`  warning: ${w}`));
    if (fit.dpr !== meta.viewport.dpr) log(`  warning: the display's pixel ratio is ${fit.dpr}, not ${meta.viewport.dpr}; the master will be ${viewport.width * fit.dpr} wide`);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await sleep(1200);
    if (project.hooks.prepare) await project.hooks.prepare(h, meta);
    if (clip.setup) await clip.setup(h);
    await h.park();
    await sleep(300);

    const capture = await startCapture(page, { dir: tmp, ...viewport, dpr: fit.dpr, quality: presets.master.jpeg });
    h.clock.zero = capture.zero;
    recording = true;
    let stopped;
    try {
      await h.until(meta.leadMs / 1000);
      await clip.take(h);
      await sleep(meta.tailMs);
    } finally {
      recording = false;
      stopped = await capture.stop();
    }
    if (reloads.length && !meta.allowReload) throw new Error(`the product reloaded during the take: ${reloads.join(' | ')}`);

    mkdirSync(project.paths.masters, { recursive: true });
    const kept = archive(clip.paths);
    if (kept) log(`  kept the previous master as ${rel(kept)}`);
    const master = join(tmp, 'master.mp4');
    stitch(stopped, tmp, master, presets.master);
    renameSync(master, clip.paths.master);
    const { width, height, duration, fps } = probe(clip.paths.master);
    Object.assign(take, {
      recordedAt: new Date().toISOString(),
      url,
      viewport: { ...viewport, dpr: fit.dpr },
      master: { width, height, fps, duration: Math.round(duration * 1000) / 1000, frames: stopped.frames.length },
      leadMs: meta.leadMs,
      tailMs: meta.tailMs,
    });
    writeFileSync(clip.paths.take, `${JSON.stringify(take, null, 2)}\n`);
    return take;
  } catch (error) {
    const shot = join(project.paths.tmp, `${clip.name}-failed.png`);
    mkdirSync(project.paths.tmp, { recursive: true });
    await page.screenshot({ path: shot }).then(() => {
      error.message += ` (the screen at the failure: ${rel(shot)})`;
    }, () => undefined);
    throw error;
  } finally {
    await browser.close();
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Record a clip, retrying rejected takes. Returns the take. */
export async function record(project, clip, { log = console.log, query = {}, takes } = {}) {
  if (!clip.take) throw new Error(`${clip.name} has no scenario to run (no default export in scenarios/${clip.name}.mjs)`);
  const tries = takes ?? clip.meta.takes;
  for (let i = 1; ; i += 1) {
    try {
      return await takeOnce(project, clip, { log, query });
    } catch (error) {
      if (i >= tries) throw error;
      log(`  take ${i} rejected: ${error.message}`);
    }
  }
}
