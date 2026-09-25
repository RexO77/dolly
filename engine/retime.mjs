/**
 * Reading times off the picture. A beat marked on the scenario's clock can
 * land a frame or two off what the master shows, and a beat a scenario only
 * notices late (a wait that polls) can be off by more; these find the frame
 * where the change really shows, so the camera sits on the picture.
 */
import { decodeFrames, probe } from './ffmpeg.mjs';

const cache = new Map();

/** Every frame of a master, small: W x H gray (or rgb). Decoded once per master and shape. */
async function small(master, width, height, pixFmt) {
  const key = `${master}|${width}x${height}|${pixFmt}`;
  if (!cache.has(key)) {
    const frames = [];
    const { fps } = probe(master);
    await decodeFrames(master, { width, height, scale: true, pixFmt }, (f) => {
      frames.push(f);
    });
    cache.set(key, { frames, fps });
  }
  return cache.get(key);
}

/**
 * The first time at or after `from` (seconds) where the region `box`
 * (fractions of the frame) changes from one frame to the next by more than
 * `threshold` grey levels on average. -1 when it never does.
 */
export async function firstChange(master, box, { from = 0, threshold = 1.5 } = {}) {
  const W = 320;
  const H = 200;
  const { frames, fps } = await small(master, W, H, 'gray');
  const x0 = Math.trunc(box.x * W);
  const y0 = Math.trunc(box.y * H);
  const x1 = Math.max(x0 + 2, Math.trunc((box.x + box.w) * W));
  const y1 = Math.max(y0 + 2, Math.trunc((box.y + box.h) * H));
  const n = (x1 - x0) * (y1 - y0);
  for (let i = Math.max(1, Math.trunc(from * fps)); i < frames.length; i += 1) {
    const a = frames[i];
    const b = frames[i - 1];
    let sum = 0;
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) sum += Math.abs(a[y * W + x] - b[y * W + x]);
    if (sum / n > threshold) return i / fps;
  }
  return -1;
}

/**
 * The first time at or after `from` where the pixel at `point` (fractions
 * of the frame) passes `test(r, g, b)`, read at 144x90. -1 when it never does.
 */
export async function firstPixel(master, point, test, { from = 0 } = {}) {
  const W = 144;
  const H = 90;
  const { frames, fps } = await small(master, W, H, 'rgb24');
  const o = (Math.trunc(point.y * H) * W + Math.trunc(point.x * W)) * 3;
  for (let i = Math.max(0, Math.trunc(from * fps)); i < frames.length; i += 1) {
    const f = frames[i];
    if (test(f[o], f[o + 1], f[o + 2])) return i / fps;
  }
  return -1;
}
