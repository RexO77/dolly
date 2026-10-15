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
import { sleep, tempo } from './motion.mjs';
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

/**
 * Slow the product down `slow` times for the length of the take: its CSS
 * animations and transitions through Chrome's playback rate, and its timers
 * and animation frames through a page clock driven at the same rate. The
 * hand slows with it (through `tempo`). Returns a function that undoes it.
 */
async function slowDown(page, slow) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / slow });
  await page.clock.pauseAt(await page.evaluate(() => Date.now()));
  let running = true;
  const STEP = 8;
  const drive = (async () => {
    while (running) {
      await page.clock.runFor(STEP / slow).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, STEP));
    }
  })();
  tempo.slow = slow;
  return async () => {
    tempo.slow = 1;
    running = false;
    await drive;
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 }).catch(() => undefined);
    await cdp.detach().catch(() => undefined);
    await page.clock.resume().catch(() => undefined);
  };
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
function writeMaster(project, clip, captured, frameDir, log, { slow = 1 } = {}) {
  mkdirSync(project.paths.masters, { recursive: true });
  const kept = archive(clip.paths);
  if (kept) log(`  kept the previous master as ${project.workspace.rel(kept)}`);
  const stitched = join(frameDir, 'master.mp4');
  /* A slow-motion take has frames to spare: keep them, at 60 a second. */
  stitch(captured, frameDir, stitched, { ...presets.master, slow, fps: slow > 1 ? 60 : presets.master.fps });
  renameSync(stitched, clip.paths.master);
  return probe(clip.paths.master);
}

async function takeOnce(project, clip, { log, query }) {
  const { meta } = clip;
  const viewport = { width: meta.viewport.width, height: meta.viewport.height };
  const frameDir = join(project.paths.tmp, 'frames', clip.name);
  const browser = await openBrowser({ ...viewport, dpr: meta.viewport.dpr, colorScheme: meta.colorScheme });
  const { page } = browser;
  const take = { project: project.name, clip: clip.name, beats: {}, boxes: {}, notes: [] };
  const h = helpers(page, viewport, take);
  h.clock.setup = performance.now();
  h.meta = meta;
  const reloads = watchReloads(page);
  try {
    const url = clipUrl(project, meta, query);
    const slow = meta.slow ?? 1;
    /* The page's clock has to be in place before its scripts run, so a slow take installs it before loading. */
    if (slow > 1) await page.clock.install();
    const fit = await openScene(page, h, project, clip, url, log);

    const capture = await startCapture(page, { dir: frameDir, ...viewport, dpr: fit.dpr, quality: presets.master.jpeg });
    const undoSlow = slow > 1 ? await slowDown(page, slow) : null;
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
      await undoSlow?.();
    }
    if (reloads.seen.length && !meta.allowReload) {
      throw new Error(`the product reloaded during the take (${reloads.seen.join(' | ')}); record again once nothing is editing its files, or set meta.allowReload`);
    }

    const { width, height, duration, fps } = writeMaster(project, clip, captured, frameDir, log, { slow });
    Object.assign(take, {
      recordedAt: new Date().toISOString(),
      url,
      viewport: { ...viewport, dpr: fit.dpr },
      master: { width, height, fps, duration: Math.round(duration * 1000) / 1000, frames: captured.frames.length },
      leadMs: meta.leadMs,
      tailMs: meta.tailMs,
      ...(slow > 1 ? { slow } : {}),
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
