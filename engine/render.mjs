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
 */
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { cameraAt, viewBox, spotAlpha, normalizeSpec, checkSpec } from './camera/math.mjs';
import { resample } from './camera/resample.mjs';
import { renderFrame } from './camera/frame.mjs';
import { probe, frameCount, decodeFrames, encoder, writeWebp } from './ffmpeg.mjs';

/** A -filter_complex graph for the spec's cut, or undefined. */
export function cutFilter(cut) {
  if (!cut) return undefined;
  const fade = cut.fade ?? 0.25;
  return `[0:v]trim=0:${cut.from},setpts=PTS-STARTPTS[v0];[0:v]trim=${cut.to},setpts=PTS-STARTPTS[v1];`
    + `[v0][v1]xfade=transition=fade:duration=${fade}:offset=${cut.from - fade}[v]`;
}

/** The delivery size for a master: `width` wide at the master's aspect, even on both sides. */
export function outputSize(master, { width, size }) {
  if (size) {
    const [w, h] = String(size).split('x').map(Number);
    return { width: w, height: h };
  }
  return { width, height: Math.round((width * master.height) / master.width / 2) * 2 };
}

class Pool {
  constructor(n) {
    this.idle = [];
    this.waiters = [];
    this.jobs = new Map();
    this.workers = Array.from({ length: n }, () => {
      const w = new Worker(new URL('./camera/worker.mjs', import.meta.url));
      w.on('message', ({ id, out }) => {
        const job = this.jobs.get(id);
        this.jobs.delete(id);
        this.release(w);
        job.resolve(new Uint8Array(out));
      });
      w.on('error', (error) => {
        for (const job of this.jobs.values()) job.reject(error);
        this.jobs.clear();
      });
      this.idle.push(w);
      return w;
    });
  }

  release(w) {
    const next = this.waiters.shift();
    if (next) next(w);
    else this.idle.push(w);
  }

  async run(id, task) {
    const w = this.idle.pop() ?? (await new Promise((resolve) => this.waiters.push(resolve)));
    return new Promise((resolve, reject) => {
      this.jobs.set(id, { resolve, reject });
      w.postMessage({ id, ...task }, [task.src]);
    });
  }

  close() {
    return Promise.all(this.workers.map((w) => w.terminate()));
  }
}

/**
 * Render `master` through `spec` to `out`.
 *   width | size   delivery width (height follows the master), or "WxH"
 *   crf, x264      encoder quality and preset
 *   css            master pixels per CSS pixel (sizes the spotlight's radius)
 *   poster         {path, at?, width, quality}; `at` in seconds, else the last frame
 */
export async function render({ master, spec, out, width = 1920, size, crf = 20, x264 = 'slow', css = 2, poster, onProgress }) {
  spec = normalizeSpec(spec);
  const { errors, warnings } = checkSpec(spec);
  if (errors.length) throw new Error(`camera spec: ${errors.join('; ')}`);
  const src = probe(master);
  const { width: OW, height: OH } = outputSize(src, { width, size });
  const { fps } = src;
  const W = src.width;
  const H = src.height;
  const { end, cut } = spec.source;
  const length = Math.min(end ?? Infinity, cut ? src.duration - (cut.to - cut.from) - (cut.fade ?? 0.25) : src.duration);
  const total = Math.round(length * fps);

  mkdirSync(dirname(out), { recursive: true });
  const enc = encoder(out, { width: OW, height: OH, fps, crf, preset: x264 });
  const pool = new Pool(Math.max(1, Math.min(availableParallelism() - 1, 10)));
  const ahead = pool.workers.length * 2;
  const results = new Map();
  let written = 0;
  let wake = null;
  const posterAt = poster?.at !== undefined ? Math.round(poster.at * fps) : null;
  let posterFrame = null;
  let lastFrame = null;

  /* Frames finish out of order; they are written in order as soon as they can be. */
  const flush = async () => {
    while (results.has(written)) {
      const frame = results.get(written);
      results.delete(written);
      if (written === posterAt) posterFrame = frame;
      lastFrame = frame;
      await enc.write(frame);
      written += 1;
      onProgress?.(written, total);
      wake?.();
    }
  };
  let flushing = Promise.resolve();
  const failures = [];

  let frames;
  try {
    frames = await decodeFrames(master, { width: W, height: H, filter: cutFilter(cut), end }, async (frame, i) => {
      while (i - written >= ahead) await new Promise((resolve) => (wake = resolve));
      if (failures.length) throw failures[0];
      const t = i / fps;
      const view = viewBox(W, H, OW, OH, cameraAt(spec.camera, t));
      const spots = spec.spots.map((s) => ({ ...s, alpha: spotAlpha(s, t) })).filter((s) => s.alpha > 0.002);
      pool.run(i, { src: frame.buffer, W, H, OW, OH, view, spots, css })
        .then((result) => {
          results.set(i, result);
          flushing = flushing.then(flush);
        })
        .catch((error) => failures.push(error));
    });
    while (written < frames && !failures.length) await new Promise((resolve) => (wake = resolve));
    await flushing;
    if (failures.length) throw failures[0];
  } finally {
    await pool.close();
    await enc.close();
  }

  const encoded = frameCount(out);
  if (encoded !== frames) throw new Error(`${out} holds ${encoded} frames, but ${frames} were rendered`);

  if (poster && lastFrame) {
    const pw = poster.width ?? 1440;
    const ph = Math.round((pw * OH) / OW);
    writeWebp(resample(posterFrame ?? lastFrame, OW, OH, pw, ph, [0, 0, OW, OH]), pw, ph, poster.path, poster.quality ?? 85);
  }
  return { out, frames, fps, duration: frames / fps, width: OW, height: OH, warnings, poster: poster?.path };
}

/**
 * One frame of the delivered clip at `t` seconds (on the trimmed clip's
 * clock), without rendering the rest: for a poster from a chosen moment.
 */
export async function renderStill({ master, spec, t, width = 1920, size, css = 2 }) {
  spec = normalizeSpec(spec);
  const src = probe(master);
  const { width: OW, height: OH } = outputSize(src, { width, size });
  const W = src.width;
  const H = src.height;
  const want = Math.round(t * src.fps);
  let last = null;
  let lastIndex = -1;
  /* Decode no further than the frame wanted. */
  const end = Math.min(spec.source.end ?? Infinity, (want + 2) / src.fps);
  await decodeFrames(master, { width: W, height: H, filter: cutFilter(spec.source.cut), end }, (frame, i) => {
    if (i <= want) {
      last = frame;
      lastIndex = i;
    }
  });
  if (!last) throw new Error(`${master} has no frames`);
  const at = lastIndex / src.fps;
  const view = viewBox(W, H, OW, OH, cameraAt(spec.camera, at));
  const spots = spec.spots.map((s) => ({ ...s, alpha: spotAlpha(s, at) })).filter((s) => s.alpha > 0.002);
  return { frame: renderFrame(last, W, H, OW, OH, view, spots, css), width: OW, height: OH, t: at };
}
