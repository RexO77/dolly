/**
 * One delivered frame: the camera's view of a master frame, with any lit
 * spotlights washed over it. Everything here is per-frame and pure, so the
 * renderer can run it on worker threads.
 */
import { resample } from './resample.mjs';
import { WASH, WASH_ALPHA, SPOT_RADIUS } from './grammar.mjs';

/* Pillow's paste blend: (dst * (255 - m) + src * m) / 255, rounded its way. */
const div255 = (v) => {
  const t = v + 128;
  return ((t >> 8) + t) >> 8;
};

/**
 * Wash everything but one rounded rect (output pixels) with `level` 0..255
 * of the warm ground. The rect's edge is antialiased over one pixel.
 */
function wash(img, OW, OH, rect, level) {
  const { X, Y, RW, RH } = rect;
  const r = Math.max(0, Math.min(rect.radius, RW / 2, RH / 2));
  const cx = X + RW / 2;
  const cy = Y + RH / 2;
  const hx = RW / 2 - r;
  const hy = RH / 2 - r;
  const [w0, w1, w2] = WASH;
  const blend = (o, m) => {
    const n = 255 - m;
    img[o] = div255(img[o] * n + w0 * m);
    img[o + 1] = div255(img[o + 1] * n + w1 * m);
    img[o + 2] = div255(img[o + 2] * n + w2 * m);
  };
  const top = Math.floor(Y) - 1;
  const bottom = Math.ceil(Y + RH) + 1;
  const left = Math.max(0, Math.floor(X) - 1);
  const right = Math.min(OW, Math.ceil(X + RW) + 1);
  for (let y = 0; y < OH; y += 1) {
    const row = y * OW * 3;
    if (y < top || y >= bottom) {
      for (let x = 0; x < OW; x += 1) blend(row + x * 3, level);
      continue;
    }
    for (let x = 0; x < left; x += 1) blend(row + x * 3, level);
    const qy = Math.abs(y + 0.5 - cy) - hy;
    for (let x = left; x < right; x += 1) {
      /* Signed distance from the pixel's centre to the rounded rect. */
      const qx = Math.abs(x + 0.5 - cx) - hx;
      const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
      const inside = Math.max(0, Math.min(1, 0.5 - d));
      const m = Math.round(level * (1 - inside));
      if (m > 0) blend(row + x * 3, m);
    }
    for (let x = right; x < OW; x += 1) blend(row + x * 3, level);
  }
}

/**
 * Render one output frame.
 *   src     the master frame, packed RGB, W x H
 *   view    {x0, y0, vw, vh} from viewBox()
 *   spots   [{x, y, w, h, radius?, alpha}], rects as fractions of the source
 *   css     source pixels per CSS pixel (the capture's device pixel ratio)
 */
export function renderFrame(src, W, H, OW, OH, view, spots = [], css = 2) {
  const { x0, y0, vw, vh } = view;
  const out = resample(src, W, H, OW, OH, [x0, y0, x0 + vw, y0 + vh]);
  const k = OW / vw;
  for (const s of spots) {
    const level = Math.trunc(255 * WASH_ALPHA * s.alpha);
    if (level <= 0) continue;
    wash(out, OW, OH, {
      X: (s.x * W - x0) * k,
      Y: (s.y * H - y0) * k,
      RW: s.w * W * k,
      RH: s.h * H * k,
      radius: (s.radius ?? SPOT_RADIUS) * css * k,
    }, level);
  }
  return out;
}
