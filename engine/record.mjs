/**
 * One take: open the product, run the scenario's setup off camera, then
 * capture while the scenario plays, and write the master and its take file
 * (beats, boxes and notes on the master's own clock).
 *
 * Recording starts once the page has loaded and its fonts have settled, and
 * stops `tailMs` after the scenario returns, so a clip ends on a still frame.
 * A take is rejected when the scenario throws or when the product reloads
 * mid-take (a hot update resets the app, and a reset take must never ship),
 * and `takes` sets how many tries a clip gets in all.
 */
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { clipUrl, presets } from './config.mjs';
import { openBrowser, fitWindow } from './browser.mjs';
import { startCapture, stitch } from './capture.mjs';
import { helpers } from './input.mjs';
import { sleep } from './motion.mjs';
import { probe, requireTools } from './ffmpeg.mjs';
import { writeJson } from './files.mjs';

/** How long a loaded page gets to finish its first paint and settle before setup runs. */
const SETTLE_MS = 1200;
/** What dev servers log in the page when they hot-update or reload it: Vite, Next.js, webpack. */
const HOT_UPDATE = /\[vite\]|\[Fast Refresh\]|\[HMR\]|\[WDS\]|\[webpack-dev-server\]/;

/** Move the master and take file a new take replaces into .history/: masters are never deleted. */
function archive(paths) {
  if (!existsSync(paths.master)) return null;
  const stamp = statSync(paths.master).mtime.toISOString().replace(/[:.]/g, '-');
  const dir = join(dirname(paths.master), '.history');
  const name = basename(paths.master, '.mp4');
  mkdirSync(dir, { recursive: true });
  const kept = join(dir, `${name}.${stamp}.mp4`);
  renameSync(paths.master, kept);
  if (existsSync(paths.take)) renameSync(paths.take, join(dir, `${name}.${stamp}.take.json`));
  return kept;
}

/** Collect every reload and hot update the page reports while `watching` is on. */
function watchReloads(page) {
  const seen = [];
  const watch = { on: false, seen };
  page.on('load', () => watch.on && seen.push('the page loaded again'));
  page.on('console', (message) => watch.on && HOT_UPDATE.test(message.text()) && seen.push(message.text()));
  return watch;
}

/** Load the clip's page and put it in its opening state, off camera. Returns the window's real size and pixel ratio. */
async function openScene(page, h, project, clip, url, log) {
  const { meta } = clip;
  await page.goto(url, { waitUntil: 'networkidle' });
  const fit = await fitWindow(page, meta.viewport);
  fit.warnings.forEach((w) => log(`  warning: ${w}`));
  if (fit.dpr !== meta.viewport.dpr) {
    log(`  warning: this display's pixel ratio is ${fit.dpr}, not ${meta.viewport.dpr}, so the master will be ${meta.viewport.width * fit.dpr} wide; record on a retina display for sharp leans`);
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await sleep(SETTLE_MS);
  if (project.hooks.prepare) await project.hooks.prepare(h, meta);
  if (clip.setup) await clip.setup(h);
  await h.park();
  await sleep(300);
  return fit;
}

/** Stitch the captured frames into the master, keeping the one it replaces. */
function writeMaster(project, clip, captured, frameDir, log) {
  mkdirSync(project.paths.masters, { recursive: true });
  const kept = archive(clip.paths);
  if (kept) log(`  kept the previous master as ${project.workspace.rel(kept)}`);
  const stitched = join(frameDir, 'master.mp4');
  stitch(captured, frameDir, stitched, presets.master);
  renameSync(stitched, clip.paths.master);
  return probe(clip.paths.master);
}

async function takeOnce(project, clip, { log, query }) {
  const { meta } = clip;
  const viewport = { width: meta.viewport.width, height: meta.viewport.height };
  const frameDir = join(project.paths.tmp, 'frames', clip.name);
  const browser = await openBrowser(viewport);
  const { page } = browser;
  const take = { project: project.name, clip: clip.name, beats: {}, boxes: {}, notes: [] };
  const h = helpers(page, viewport, take);
  h.clock.setup = performance.now();
  h.meta = meta;
  const reloads = watchReloads(page);
  try {
    const url = clipUrl(project, meta, query);
    const fit = await openScene(page, h, project, clip, url, log);

    const capture = await startCapture(page, { dir: frameDir, ...viewport, dpr: fit.dpr, quality: presets.master.jpeg });
    h.clock.zero = capture.zero;
    reloads.on = true;
    let captured;
    try {
      await h.until(meta.leadMs / 1000);
      await clip.take(h);
      await sleep(meta.tailMs);
    } finally {
      reloads.on = false;
      captured = await capture.stop();
    }
    if (reloads.seen.length && !meta.allowReload) {
      throw new Error(`the product reloaded during the take (${reloads.seen.join(' | ')}); record again once nothing is editing its files, or set meta.allowReload`);
    }

    const { width, height, duration, fps } = writeMaster(project, clip, captured, frameDir, log);
    Object.assign(take, {
      recordedAt: new Date().toISOString(),
      url,
      viewport: { ...viewport, dpr: fit.dpr },
      master: { width, height, fps, duration: Math.round(duration * 1000) / 1000, frames: captured.frames.length },
      leadMs: meta.leadMs,
      tailMs: meta.tailMs,
    });
    writeJson(clip.paths.take, take);
    return take;
  } catch (error) {
    const shot = join(project.paths.tmp, `${clip.name}-failed.png`);
    mkdirSync(project.paths.tmp, { recursive: true });
    await page.screenshot({ path: shot }).then(() => {
      error.message += ` (the screen when it failed: ${project.workspace.rel(shot)})`;
    }, () => undefined);
    throw error;
  } finally {
    await browser.close();
    rmSync(frameDir, { recursive: true, force: true });
  }
}

/**
 * Record a clip: up to `takes` tries (default `meta.takes`, 1), logging
 * each rejected one. Writes the master and its take file, and returns the
 * take: {beats, boxes, notes, url, viewport, master: {width, height, fps, duration}}.
 * The product must already answer at `project.base` (see `ensureServer`).
 * @param {object} project from `loadProject`
 * @param {object} clip from `loadClip`
 * @param {{log?: (line: string) => void, query?: Record<string, string>, takes?: number}} [options]
 */
export async function record(project, clip, { log = console.log, query = {}, takes } = {}) {
  if (!clip.take) throw new Error(`${clip.name} has nothing to play: scenarios/${clip.name}.mjs needs a default export, the take`);
  requireTools('ffmpeg', 'ffprobe');
  const tries = takes ?? clip.meta.takes;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await takeOnce(project, clip, { log, query });
    } catch (error) {
      if (attempt >= tries) throw error;
      log(`  take ${attempt} of ${tries} rejected: ${error.message}`);
    }
  }
}
