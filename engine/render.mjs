/**
 * Master + camera spec to the delivery file: every frame of the master goes
 * through the camera (engine/camera) on worker threads and straight into
 * the encoder, and the poster comes from the same frames.
 *
 * The spec's `source` trims the master before the camera sees it:
 *   end: seconds          stop there (a take can hold past its last beat)
 *   cut: {from, to, fade} take out a stretch the clip should not dwell on,
 *                         with a crossfade across the join
 * Camera and spotlight times are on the trimmed clip's clock.
 *
 * Sizes follow the camera modules: W x H is the master, OW x OH the delivery.
 */
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { cameraAt, viewBox, spotAlpha, normalizeSpec, checkSpec } from './camera/math.mjs';
import { resample } from './camera/resample.mjs';
import { renderFrame } from './camera/frame.mjs';
import { resolveFrame, cardAt, cardSource } from './camera/card.mjs';
import { probe, frameCount, decodeFrames, encoder, writeWebp, requireTools } from './ffmpeg.mjs';

const DEFAULT_CUT_FADE = 0.25;
/** A wash fainter than this changes no pixel, so it is not drawn. */
const UNSEEN_WASH = 0.002;

/** A -filter_complex graph for the spec's cut, or undefined. */
export function cutFilter(cut) {
  if (!cut) return undefined;
  const fade = cut.fade ?? DEFAULT_CUT_FADE;
  return `[0:v]trim=0:${cut.from},setpts=PTS-STARTPTS[v0];[0:v]trim=${cut.to},setpts=PTS-STARTPTS[v1];`
    + `[v0][v1]xfade=transition=fade:duration=${fade}:offset=${cut.from - fade}[v]`;
}

/** The delivery size for a master: `width` wide at the master's aspect, even on both sides, or `size` ("WxH"). */
export function outputSize(master, { width, size }) {
  if (size) {
    const [w, h] = String(size).split('x').map(Number);
    return { width: w, height: h };
  }
  return { width, height: Math.round((width * master.height) / master.width / 2) * 2 };
}

/** What the camera shows at `t`: its crop of the master, the washes lit enough to see, and where the card sits when the clip has a frame. */
function shotAt(spec, t, W, H, OW, OH) {
  const view = viewBox(W, H, OW, OH, cameraAt(spec.camera, t));
  const spots = spec.spots.map((s) => ({ ...s, alpha: spotAlpha(s, t) })).filter((s) => s.alpha > UNSEEN_WASH);
  const look = resolveFrame(spec.frame);
  if (!look) return { view, spots, frame: null };
  const card = cardAt(look, spec.camera, t, OW, OH);
  return { view, spots, frame: { card, source: cardSource(card, view), background: look.background } };
}

/** A delivered frame (OW x OH) as the poster: `width` wide, WebP at `quality`. */
function writePoster(frame, OW, OH, poster) {
  const width = poster.width ?? 1440;
  const height = Math.round((width * OH) / OW);
  writeWebp(resample(frame, OW, OH, width, height, [0, 0, OW, OH]), width, height, poster.path, poster.quality ?? 85);
}

/** Render workers, one frame per job. Frames go to a free worker, or wait for one. */
class WorkerPool {
  constructor(size) {
    this.idle = [];
    this.waiting = [];
    this.jobs = new Map();
    this.workers = Array.from({ length: size }, () => {
      const worker = new Worker(new URL('./camera/worker.mjs', import.meta.url));
      worker.on('message', ({ id, out }) => {
        const job = this.jobs.get(id);
        this.jobs.delete(id);
        this.release(worker);
        job.resolve(new Uint8Array(out));
      });
      worker.on('error', (error) => {
        for (const job of this.jobs.values()) job.reject(error);
        this.jobs.clear();
      });
      this.idle.push(worker);
      return worker;
    });
  }

  release(worker) {
    const next = this.waiting.shift();
    if (next) next(worker);
    else this.idle.push(worker);
  }

  /** Run one frame; `task.src` is transferred to the worker, not copied. */
  async run(id, task) {
    const worker = this.idle.pop() ?? (await new Promise((resolve) => this.waiting.push(resolve)));
    return new Promise((resolve, reject) => {
      this.jobs.set(id, { resolve, reject });
      worker.postMessage({ id, ...task }, [task.src]);
    });
  }

  close() {
    return Promise.all(this.workers.map((worker) => worker.terminate()));
  }
}

/**
 * Render `master` through `spec` to `out`.
 *   width | size   delivery width (height follows the master), or "WxH"
 *   crf, x264      encoder quality and preset
 *   css            master pixels per CSS pixel (sizes the spotlight's radius)
 *   poster         {path, at?, width, quality}; `at` in seconds, else the last frame
 *   onProgress     called with (framesWritten, totalFrames)
 */
export async function render({ master, spec, out, width = 1920, size, crf = 20, x264 = 'slow', css = 2, poster, onProgress }) {
  requireTools('ffmpeg', 'ffprobe', ...(poster ? ['cwebp'] : []));
  spec = normalizeSpec(spec);
  const { errors, warnings } = checkSpec(spec);
  if (errors.length) throw new Error(`the camera spec has errors: ${errors.join('; ')}`);
  const source = probe(master);
  const { width: OW, height: OH } = outputSize(source, { width, size });
  const { width: W, height: H, fps } = source;
  const { end, cut } = spec.source;
  const cutLength = cut ? source.duration - (cut.to - cut.from) - (cut.fade ?? DEFAULT_CUT_FADE) : source.duration;
  const total = Math.round(Math.min(end ?? Infinity, cutLength) * fps);

  mkdirSync(dirname(out), { recursive: true });
  const video = await encoder(out, { width: OW, height: OH, fps, crf, preset: x264 });
  const pool = new WorkerPool(Math.max(1, Math.min(availableParallelism() - 1, 10)));
  /* Decode at most two frames per worker ahead of the encoder, so memory stays flat. */
  const ahead = pool.workers.length * 2;
  const finished = new Map();
  const posterIndex = poster?.at !== undefined ? Math.round(poster.at * fps) : null;
  let posterFrame = null;
  let lastFrame = null;
  let written = 0;
  let wake = null;
  const failures = [];

  /* Frames finish out of order; each is written as soon as every frame before it has been. */
  const writeReady = async () => {
    while (finished.has(written)) {
      const frame = finished.get(written);
      finished.delete(written);
      if (written === posterIndex) posterFrame = frame;
      lastFrame = frame;
      await video.write(frame);
      written += 1;
      onProgress?.(written, total);
      wake?.();
    }
  };
  let writing = Promise.resolve();
  const nextWrite = () => new Promise((resolve) => (wake = resolve));

  let frames;
  try {
    frames = await decodeFrames(master, { width: W, height: H, filter: cutFilter(cut), end }, async (frame, i) => {
      while (i - written >= ahead) await nextWrite();
      if (failures.length) throw failures[0];
      const shot = shotAt(spec, i / fps, W, H, OW, OH);
      pool.run(i, { src: frame.buffer, W, H, OW, OH, ...shot, css })
        .then((result) => {
          finished.set(i, result);
          writing = writing.then(writeReady);
        })
        .catch((error) => failures.push(error));
    });
    while (written < frames && !failures.length) await nextWrite();
    await writing;
    if (failures.length) throw failures[0];
  } finally {
    await pool.close();
    await video.close();
  }

  const encoded = frameCount(out);
  if (encoded !== frames) throw new Error(`${out} holds ${encoded} frames, but ${frames} were rendered; render it again`);
  if (poster && lastFrame) writePoster(posterFrame ?? lastFrame, OW, OH, poster);
  return { out, frames, fps, duration: frames / fps, width: OW, height: OH, warnings, poster: poster?.path };
}

/**
 * One frame of the delivered clip at `t` seconds (on the trimmed clip's
 * clock), without rendering the rest: for a poster from a chosen moment.
 */
export async function renderStill({ master, spec, t, width = 1920, size, css = 2 }) {
  spec = normalizeSpec(spec);
  const source = probe(master);
  const { width: OW, height: OH } = outputSize(source, { width, size });
  const { width: W, height: H, fps } = source;
  const wanted = Math.round(t * fps);
  let last = null;
  let lastIndex = -1;
  /* Decode no further than the frame wanted. */
  const end = Math.min(spec.source.end ?? Infinity, (wanted + 2) / fps);
  await decodeFrames(master, { width: W, height: H, filter: cutFilter(spec.source.cut), end }, (frame, i) => {
    if (i <= wanted) {
      last = frame;
      lastIndex = i;
    }
  });
  if (!last) throw new Error(`${master} has no frames to take a poster from`);
  const at = lastIndex / fps;
  const shot = shotAt(spec, at, W, H, OW, OH);
  return { frame: renderFrame(last, W, H, OW, OH, shot.view, shot.spots, css, shot.frame), width: OW, height: OH, t: at };
}

/** A poster from one moment of the clip (seconds on its clock), without rendering the clip. */
export async function renderPoster({ master, spec, t, width, size, css, poster }) {
  requireTools('ffmpeg', 'ffprobe', 'cwebp');
  const still = await renderStill({ master, spec, t, width, size, css });
  mkdirSync(dirname(poster.path), { recursive: true });
  writePoster(still.frame, still.width, still.height, poster);
  return { poster: poster.path, t: still.t };
}
