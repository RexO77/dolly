/**
 * One frame of a launch film: a master frame laid on a plane in a black
 * void, seen through the launch camera, with optical depth of field, a pool
 * of light lying on the plane, and the lens's vignette. Packed RGB in, packed
 * RGB out, pure, so it runs on the render workers.
 *
 * Depth of field is optical: every pixel's blur grows with its depth from
 * the focal plane, toward the near edge and the far edge alike. It is drawn
 * from a stack of blurred copies of the sharp frame (smaller copies for the
 * wider blurs), mixed per pixel by that pixel's blur.
 */
import { projection, invert } from './camera.mjs';

/* ─────────────────────────────────────────────────────────
 * Mipmaps: the master, halved again and again, so a far, foreshortened
 * part of the plane is sampled from a copy as small as it appears and
 * never aliases.
 * ───────────────────────────────────────────────────────── */
export function pyramid(src, W, H) {
  const levels = [{ data: src, w: W, h: H }];
  while (levels.at(-1).w > 16 && levels.at(-1).h > 16) {
    const { data, w, h } = levels.at(-1);
    const nw = Math.max(1, w >> 1);
    const nh = Math.max(1, h >> 1);
    const out = new Uint8Array(nw * nh * 3);
    for (let y = 0; y < nh; y += 1) {
      const y0 = Math.min(h - 1, y * 2);
      const y1 = Math.min(h - 1, y * 2 + 1);
      for (let x = 0; x < nw; x += 1) {
        const x0 = Math.min(w - 1, x * 2);
        const x1 = Math.min(w - 1, x * 2 + 1);
        for (let c = 0; c < 3; c += 1) {
          out[(y * nw + x) * 3 + c] = (data[(y0 * w + x0) * 3 + c] + data[(y0 * w + x1) * 3 + c] + data[(y1 * w + x0) * 3 + c] + data[(y1 * w + x1) * 3 + c] + 2) >> 2;
        }
      }
    }
    levels.push({ data: out, w: nw, h: nh });
  }
  return levels;
}

/** Bilinear sample of one mip level at texel (x, y), added into `acc` times `weight`. */
function sampleLevel(level, x, y, weight, acc) {
  const { data, w, h } = level;
  const fx = Math.max(0, Math.min(w - 1.001, x - 0.5));
  const fy = Math.max(0, Math.min(h - 1.001, y - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const i00 = (y0 * w + x0) * 3;
  const i10 = i00 + 3;
  const i01 = i00 + w * 3;
  const i11 = i01 + 3;
  for (let c = 0; c < 3; c += 1) {
    const top = data[i00 + c] + (data[i10 + c] - data[i00 + c]) * tx;
    const bottom = data[i01 + c] + (data[i11 + c] - data[i01 + c]) * tx;
    acc[c] += (top + (bottom - top) * ty) * weight;
  }
}

/* ─────────────────────────────────────────────────────────
 * Blur: three box passes approach a Gaussian. Wide blurs run on a
 * smaller copy, which costs a fraction and looks the same.
 * ───────────────────────────────────────────────────────── */
function boxPass(from, to, w, h, r, horizontal) {
  const n = 2 * r + 1;
  const count = horizontal ? h : w;
  const len = horizontal ? w : h;
  const stride = horizontal ? 3 : w * 3;
  for (let i = 0; i < count; i += 1) {
    const base = horizontal ? i * w * 3 : i * 3;
    for (let c = 0; c < 3; c += 1) {
      let sum = 0;
      for (let k = -r; k <= r; k += 1) sum += from[base + Math.max(0, Math.min(len - 1, k)) * stride + c];
      for (let j = 0; j < len; j += 1) {
        to[base + j * stride + c] = sum / n;
        sum += from[base + Math.min(len - 1, j + r + 1) * stride + c] - from[base + Math.max(0, j - r) * stride + c];
      }
    }
  }
}

/** Blur a float RGB image in place, roughly a Gaussian of `sigma` pixels. */
export function gaussian(img, w, h, sigma) {
  const r = Math.max(1, Math.round((Math.sqrt((12 * sigma * sigma) / 3 + 1) - 1) / 2));
  const tmp = new Float32Array(img.length);
  for (let n = 0; n < 3; n += 1) {
    boxPass(img, tmp, w, h, r, true);
    boxPass(tmp, img, w, h, r, false);
  }
  return img;
}

function shrink(img, w, h, f) {
  const nw = Math.ceil(w / f);
  const nh = Math.ceil(h / f);
  const out = new Float32Array(nw * nh * 3);
  for (let y = 0; y < nh; y += 1) {
    for (let x = 0; x < nw; x += 1) {
      const acc = [0, 0, 0];
      let n = 0;
      for (let dy = 0; dy < f; dy += 1) {
        const sy = y * f + dy;
        if (sy >= h) continue;
        for (let dx = 0; dx < f; dx += 1) {
          const sx = x * f + dx;
          if (sx >= w) continue;
          const i = (sy * w + sx) * 3;
          acc[0] += img[i];
          acc[1] += img[i + 1];
          acc[2] += img[i + 2];
          n += 1;
        }
      }
      const o = (y * nw + x) * 3;
      out[o] = acc[0] / n;
      out[o + 1] = acc[1] / n;
      out[o + 2] = acc[2] / n;
    }
  }
  return { data: out, w: nw, h: nh, f };
}

/** Sample a (possibly smaller) float copy at output pixel (x, y), bilinear. */
function sampleCopy(copy, x, y, out) {
  const { data, w, h, f } = copy;
  const fx = Math.max(0, Math.min(w - 1.001, (x + 0.5) / f - 0.5));
  const fy = Math.max(0, Math.min(h - 1.001, (y + 0.5) / f - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const i00 = (y0 * w + x0) * 3;
  const i01 = i00 + w * 3;
  for (let c = 0; c < 3; c += 1) {
    const top = data[i00 + c] + (data[i00 + 3 + c] - data[i00 + c]) * tx;
    const bottom = data[i01 + c] + (data[i01 + 3 + c] - data[i01 + c]) * tx;
    out[c] = top + (bottom - top) * ty;
  }
}

/* The blur stack: each copy's blur, in output pixels, and how much smaller it is drawn. */
const STACK = [
  { sigma: 1.25, f: 1 },
  { sigma: 2.5, f: 1 },
  { sigma: 5, f: 2 },
  { sigma: 10, f: 4 },
  { sigma: 20, f: 8 },
];

/* ─────────────────────────────────────────────────────────
 * Light: two soft ellipses lying on the plane, a wide spill and a hot
 * core nudged toward the key, each passing (1 - alpha) of the light, so
 * the hot spot has a gentle shoulder instead of one ramp to black.
 * ───────────────────────────────────────────────────────── */
const SPILL = [[0, 0], [0.15, 0], [0.3, 0.06], [0.5, 0.22], [0.68, 0.5], [0.85, 0.82], [1, 1]];
const CORE = [[0, 0], [0.45, 0], [0.7, 0.1], [1, 0.22]];

function ramp(stops, d) {
  if (d >= 1) return stops.at(-1)[1];
  for (let i = 1; i < stops.length; i += 1) {
    if (d <= stops[i][0]) {
      const [d0, a0] = stops[i - 1];
      const [d1, a1] = stops[i];
      return a0 + ((a1 - a0) * (d - d0)) / (d1 - d0);
    }
  }
  return stops.at(-1)[1];
}

/** How much light reaches plane point (u, v): 1 in the hot spot, falling to 0 in the void. */
function lightAt(light, u, v) {
  const { x, y, along, across, angle, coreRatio, keyX, keyY } = light;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const ellipse = (cx, cy, ra, rb) => {
    const dx = u - cx;
    const dy = v - cy;
    const a = (dx * cos + dy * sin) / ra;
    const b = (-dx * sin + dy * cos) / rb;
    return Math.sqrt(a * a + b * b);
  };
  const spill = ramp(SPILL, ellipse(x, y, along, across));
  const core = ramp(CORE, ellipse(x + keyX, y + keyY, along * coreRatio, across * coreRatio));
  return (1 - spill) * (1 - core);
}

/**
 * Render one film frame.
 *   levels   pyramid() of the master frame, or of a crop of it
 *   plane    {dpr, w, h, ox, oy}: device pixels per CSS pixel, the whole
 *            screen's size in CSS pixels, and where the crop starts in the
 *            master, in device pixels (0, 0 for a whole frame)
 *   cam      cameraAt() for this moment
 *   look     {focus: [u, v], blur: {k, max}, light, slab: {radius}, exposure, vignette}
 * Returns Float32Array RGB, 0 to 255, OW x OH, before grain.
 */
export function renderFilmFrame(levels, plane, cam, look, OW, OH) {
  const { dpr, w: css, h: cssH, ox = 0, oy = 0 } = plane;
  const { H, depth } = projection(cam, OW, OH);
  const inv = invert(H);
  const zFocus = depth[0] * look.focus[0] + depth[1] * look.focus[1] + depth[2];
  const sharp = new Float32Array(OW * OH * 3);
  const radius = new Float32Array(OW * OH);
  const lit = new Float32Array(OW * OH);
  const radiusCss = look.slab.radius;
  const acc = [0, 0, 0];
  const maxLevel = levels.length - 1;

  for (let y = 0; y < OH; y += 1) {
    for (let x = 0; x < OW; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w = inv[6] * px + inv[7] * py + inv[8];
      const o = y * OW + x;
      if (w <= 0) continue;
      const u = (inv[0] * px + inv[1] * py + inv[2]) / w;
      const v = (inv[3] * px + inv[4] * py + inv[5]) / w;
      /* The slab: the screen's rect with rounded corners, antialiased by a pixel's footprint. */
      const wx = inv[6] * (px + 1) + inv[7] * py + inv[8];
      const du = Math.hypot((inv[0] * (px + 1) + inv[1] * py + inv[2]) / wx - u, (inv[3] * (px + 1) + inv[4] * py + inv[5]) / wx - v);
      const wy = inv[6] * px + inv[7] * (py + 1) + inv[8];
      const dv = Math.hypot((inv[0] * px + inv[1] * (py + 1) + inv[2]) / wy - u, (inv[3] * px + inv[4] * (py + 1) + inv[5]) / wy - v);
      const footprint = Math.max(du, dv);
      const qx = Math.abs(u - css / 2) - (css / 2 - radiusCss);
      const qy = Math.abs(v - cssH / 2) - (cssH / 2 - radiusCss);
      const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radiusCss;
      const cover = Math.max(0, Math.min(1, 0.5 - d / Math.max(footprint, 1e-6)));
      if (cover <= 0) continue;
      /* Trilinear: the two mip levels around this pixel's footprint in master pixels. */
      const lod = Math.max(0, Math.min(maxLevel, Math.log2(Math.max(1, footprint * dpr))));
      const l0 = Math.floor(lod);
      const l1 = Math.min(maxLevel, l0 + 1);
      const t = lod - l0;
      acc[0] = 0;
      acc[1] = 0;
      acc[2] = 0;
      sampleLevel(levels[l0], (u * dpr - ox) / 2 ** l0, (v * dpr - oy) / 2 ** l0, 1 - t, acc);
      if (t > 0) sampleLevel(levels[l1], (u * dpr - ox) / 2 ** l1, (v * dpr - oy) / 2 ** l1, t, acc);
      const i = o * 3;
      sharp[i] = acc[0] * cover;
      sharp[i + 1] = acc[1] * cover;
      sharp[i + 2] = acc[2] * cover;
      const z = depth[0] * u + depth[1] * v + depth[2];
      radius[o] = Math.min(look.blur.max, look.blur.k * Math.abs(z - zFocus));
      lit[o] = lightAt(look.light, u, v);
    }
  }

  /* Light first, so a bright part of the UI that sits in the dark does not bloom into the lit part when it blurs. */
  for (let o = 0; o < OW * OH; o += 1) {
    const l = lit[o];
    const i = o * 3;
    sharp[i] *= l;
    sharp[i + 1] *= l;
    sharp[i + 2] *= l;
  }

  /* The blur stack, from the sharp frame. */
  const copies = STACK.map(({ sigma, f }) => {
    const copy = f === 1 ? { data: Float32Array.from(sharp), w: OW, h: OH, f } : shrink(sharp, OW, OH, f);
    gaussian(copy.data, copy.w, copy.h, sigma / f);
    return { ...copy, sigma };
  });
  /* A radius between two copies' blurs blends the two; below the first, the sharp frame. */
  const mixRadius = STACK.map((s) => s.sigma * 1.6);

  const out = new Float32Array(OW * OH * 3);
  const a = [0, 0, 0];
  const b = [0, 0, 0];
  const cx = OW / 2;
  const cy = OH / 2;
  for (let y = 0; y < OH; y += 1) {
    for (let x = 0; x < OW; x += 1) {
      const o = y * OW + x;
      const i = o * 3;
      const r = radius[o];
      if (r <= 0.35) {
        a[0] = sharp[i];
        a[1] = sharp[i + 1];
        a[2] = sharp[i + 2];
      } else {
        let k = 0;
        while (k < mixRadius.length && mixRadius[k] < r) k += 1;
        if (k === 0) {
          sampleCopy(copies[0], x, y, b);
          const t = r / mixRadius[0];
          for (let c = 0; c < 3; c += 1) a[c] = sharp[i + c] + (b[c] - sharp[i + c]) * t;
        } else if (k >= mixRadius.length) {
          sampleCopy(copies.at(-1), x, y, a);
        } else {
          sampleCopy(copies[k - 1], x, y, a);
          sampleCopy(copies[k], x, y, b);
          const t = (r - mixRadius[k - 1]) / (mixRadius[k] - mixRadius[k - 1]);
          for (let c = 0; c < 3; c += 1) a[c] += (b[c] - a[c]) * t;
        }
        /* Out-of-focus light spreads and dims rather than glowing. */
        const dim = 1 - 0.28 * Math.min(1, r / look.blur.max);
        a[0] *= dim;
        a[1] *= dim;
        a[2] *= dim;
      }
      /* The lens's vignette: centred and constant, it only keeps the corners black. */
      const ex = (x + 0.5 - cx) / (1.2 * OW);
      const ey = (y + 0.5 - cy) / (0.95 * OH);
      const dd = Math.sqrt(ex * ex + ey * ey) * 2;
      const vig = 1 - look.vignette * Math.max(0, Math.min(1, (dd - 0.5) / 0.5));
      const g = look.exposure * vig;
      out[i] = a[0] * g;
      out[i + 1] = a[1] * g;
      out[i + 2] = a[2] * g;
    }
  }
  return out;
}
