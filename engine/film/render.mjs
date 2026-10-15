/**
 * Rendering a launch film: every shot's frames from its take's master,
 * through the launch camera, with camera motion blur, cut hard one after
 * another, then the ending, with fine grain over all of it.
 *
 * Each frame decodes the master once and sends only the part of it the
 * camera can see to a worker, so a close-up of a 5760-wide take is about
 * as quick as a wide shot of a small one.
 */
import { availableParallelism } from 'node:os';
import { renameSync, rmSync, writeFileSync } from 'node:fs';
import { decodeFrames, encoder, ffmpeg, frameCount } from '../ffmpeg.mjs';
import { foley, wav } from './foley.mjs';
import { WorkerPool } from '../render.mjs';
import { resolveShots, shotAt } from './shots.mjs';
import { projection, invert } from './camera.mjs';
import { pyramid, renderFilmFrame } from './frame.mjs';
import { setEnding, endingFrames } from './ending.mjs';
import { FILM } from './grammar.mjs';

/** The camera and look for each moment the shutter is open around shot time `t`. */
function shutter(shot, t, { fps, subframes, shutter: open }, OW, OH) {
  const k = Math.max(1, subframes);
  return Array.from({ length: k }, (_, i) => shotAt(shot, t + ((i + 0.5) / k - 0.5) * (open / fps), OW, OH));
}

/**
 * The part of the master, in device pixels, that any of `views` can see,
 * with a margin: {x, y, w, h}. The whole frame when a view looks past the
 * plane's horizon.
 */
export function visibleCrop(views, take, OW, OH) {
  const { width, height, dpr } = take.viewport;
  const W = width * dpr;
  const H = height * dpr;
  let [u0, v0, u1, v1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { cam } of views) {
    const inv = invert(projection(cam, OW, OH).H);
    for (let i = 0; i <= 16; i += 1) {
      const f = i / 16;
      for (const [x, y] of [[f * OW, 0], [f * OW, OH], [0, f * OH], [OW, f * OH]]) {
        const w = inv[6] * x + inv[7] * y + inv[8];
        if (w <= 0) return { x: 0, y: 0, w: W, h: H };
        const u = (inv[0] * x + inv[1] * y + inv[2]) / w;
        const v = (inv[3] * x + inv[4] * y + inv[5]) / w;
        u0 = Math.min(u0, u);
        v0 = Math.min(v0, v);
        u1 = Math.max(u1, u);
        v1 = Math.max(v1, v);
      }
    }
  }
  const margin = 8;
  const x = Math.max(0, Math.floor((u0 - margin) * dpr));
  const y = Math.max(0, Math.floor((v0 - margin) * dpr));
  const x1 = Math.min(W, Math.ceil((u1 + margin) * dpr));
  const y1 = Math.min(H, Math.ceil((v1 + margin) * dpr));
  if (x1 <= x || y1 <= y) return { x: 0, y: 0, w: 2, h: 2 };
  return { x, y, w: x1 - x, h: y1 - y };
}

/** Copy a crop out of a packed RGB frame W wide. */
function cropOf(frame, W, { x, y, w, h }) {
  const out = new Uint8Array(w * h * 3);
  for (let row = 0; row < h; row += 1) out.set(frame.subarray(((y + row) * W + x) * 3, ((y + row) * W + x + w) * 3), row * w * 3);
  return out;
}

/** One frame's job: the crop of its master frame and the shutter's views. */
function task(shot, take, frame, t, opts) {
  const { width, height, dpr } = take.viewport;
  const views = shutter(shot, t, opts, opts.width, opts.height);
  const crop = visibleCrop(views, take, opts.width, opts.height);
  return {
    src: cropOf(frame, width * dpr, crop).buffer,
    cw: crop.w,
    ch: crop.h,
    plane: { dpr, w: width, h: height, ox: crop.x, oy: crop.y },
    subframes: views,
    OW: opts.width,
    OH: opts.height,
  };
}

/**
 * Render `film` to `out`.
 *   takes     {name: take file}, for every take the shots are cut from
 *   masters   {name: master path}
 *   ending    the ending to set ({copy, tagline?, logo?, name?}); film.ending when absent
 *   onProgress(done, total)
 * Returns {frames, duration}.
 */
export async function renderFilm({ film, takes, masters, out, onProgress, ...overrides }) {
  const opts = { ...FILM, ...film.output, ...overrides };
  const shots = resolveShots(film, takes);
  const fps = opts.fps;
  const total = shots.reduce((n, s) => n + Math.round(s.length * fps), 0);
  const pool = new WorkerPool(Math.max(1, Math.min(availableParallelism() - 1, 10)), new URL('./worker.mjs', import.meta.url));
  const enc = await encoder(out, { width: opts.width, height: opts.height, fps, crf: opts.crf, preset: 'slow', filter: opts.grain ? `noise=c0s=${opts.grain}:c0f=t` : undefined });
  let written = 0;
  let last = null;
  try {
    for (const shot of shots) {
      const take = takes[shot.take];
      const n = Math.round(shot.length * fps);
      const mfps = take.master.fps;
      const start = Math.max(0, shot.from - 0.1);
      /* Which master frame each film frame shows: the one nearest the middle of its shutter. */
      const want = Array.from({ length: n }, (_, j) => Math.round((shot.from + j / fps - start) * mfps));
      const results = new Array(n);
      let next = 0;
      let dispatched = 0;
      const pending = [];
      const flush = async () => {
        while (next < n && results[next]) {
          last = await results[next];
          await enc.write(last);
          results[next] = null;
          next += 1;
          written += 1;
          onProgress?.(written, total);
        }
      };
      const { width, height, dpr } = take.viewport;
      await decodeFrames(masters[shot.take], { width: width * dpr, height: height * dpr, start, end: shot.length + 0.4 }, async (frame, i) => {
        while (dispatched < n && want[dispatched] <= i) {
          const job = pool.run(`${shot.index}:${dispatched}`, task(shot, take, frame, dispatched / fps, opts));
          results[dispatched] = job;
          pending.push(job);
          dispatched += 1;
          /* Keep the workers busy without holding the whole shot in memory. */
          if (dispatched - next > pool.workers.length + 2) {
            await results[next];
            await flush();
          }
        }
      });
      if (dispatched < n) throw new Error(`shot ${shot.index + 1} runs past the end of ${shot.take}'s master; shorten it or cut in earlier`);
      await Promise.all(pending);
      await flush();
    }
    const ending = overrides.ending ?? film.ending;
    if (ending && last) {
      const set = await setEnding(ending, opts.width, opts.height);
      for (const frame of endingFrames(set, last, opts.width, opts.height, fps)) {
        await enc.write(frame);
        written += 1;
      }
    }
  } finally {
    await pool.close();
  }
  await enc.close();
  const frames = frameCount(out);
  if (frames !== written) throw new Error(`${out} has ${frames} frames, not ${written}; render it again`);
  /* The foley: the hand's presses and keystrokes, cut as the picture is cut, laid under it. */
  if (opts.sound !== false) {
    const sound = `${out}.foley.wav`;
    const muxed = `${out}.muxed.mp4`;
    writeFileSync(sound, wav(foley(shots, takes, frames / fps)));
    ffmpeg(['-i', out, '-i', sound, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', muxed]);
    renameSync(muxed, out);
    rmSync(sound, { force: true });
  }
  return { frames, duration: frames / fps, shots };
}

/**
 * One film frame, without workers or the shutter: shot `index` at shot time
 * `t`. For the Studio's stills and for the judge. Returns {frame, width, height}.
 */
export async function renderFilmStill({ film, takes, masters, index, t, width = FILM.width, height = FILM.height }) {
  const shots = resolveShots(film, takes);
  const shot = shots[index];
  const take = takes[shot.take];
  const { width: cw, height: ch, dpr } = take.viewport;
  let src = null;
  await decodeFrames(masters[shot.take], { width: cw * dpr, height: ch * dpr, start: Math.max(0, shot.from + t - 0.02), end: 0.05 }, async (frame) => {
    src ??= frame;
  });
  if (!src) throw new Error(`no frame of ${shot.take} at ${(shot.from + t).toFixed(2)}s`);
  const view = shotAt(shot, t, width, height);
  const crop = visibleCrop([view], take, width, height);
  const levels = pyramid(cropOf(src, cw * dpr, crop), crop.w, crop.h);
  const img = renderFilmFrame(levels, { dpr, w: cw, h: ch, ox: crop.x, oy: crop.y }, view.cam, view.look, width, height);
  const frame = new Uint8Array(img.length);
  for (let i = 0; i < img.length; i += 1) frame[i] = Math.max(0, Math.min(255, Math.round(img[i])));
  return { frame, width, height, shot };
}
