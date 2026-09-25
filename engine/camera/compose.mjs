/**
 * Putting a card on its background: the frame's gradient and vignette, the
 * card's soft shadow, an optional browser title bar, and the picture itself
 * with antialiased rounded corners. Packed RGB in, packed RGB out; pure, so
 * it runs on the render workers.
 *
 * The Studio draws the same things with a canvas (studio/src/model/picture.js),
 * from the same geometry (card.mjs): the gradient runs along the output's
 * diagonal and the vignette from 35% of the way to the corners.
 */

/* A 4 x 4 ordered dither, in fractions of a level: gradients this soft would band in the encoder otherwise. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);

/** The browser window's colours: its bar, the three dots, the address field and the line under the bar. */
export const WINDOW = { bar: [238, 237, 233], dot: [203, 202, 197], field: [226, 225, 220], edge: [214, 213, 208] };

const backgrounds = new Map();

/** The background alone, W x H, cached: it is the same on every frame of a clip. */
export function backdrop(bg, W, H) {
  const key = `${W}x${H}:${bg.from}:${bg.to}:${bg.vignette}`;
  const cached = backgrounds.get(key);
  if (cached) return cached;
  const out = new Uint8Array(W * H * 3);
  const diag = W * W + H * H;
  const R = Math.hypot(W, H) / 2;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const t = ((x + 0.5) * W + (y + 0.5) * H) / diag;
      const d = Math.hypot(x + 0.5 - W / 2, y + 0.5 - H / 2) / R;
      const shade = 1 - bg.vignette * Math.max(0, Math.min(1, (d - 0.35) / 0.65));
      const n = BAYER[(y & 3) * 4 + (x & 3)];
      const o = (y * W + x) * 3;
      for (let c = 0; c < 3; c += 1) out[o + c] = Math.max(0, Math.min(255, Math.round((bg.from[c] + (bg.to[c] - bg.from[c]) * t) * shade + n)));
    }
  }
  if (backgrounds.size > 4) backgrounds.clear();
  backgrounds.set(key, out);
  return out;
}

/** Signed distance from (px, py) to a rounded rect; negative inside. `r` is [top left, top right, bottom right, bottom left]. */
function roundedRect(px, py, x, y, w, h, r) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const right = px >= cx;
  const bottom = py >= cy;
  const radius = Math.max(0, Math.min(bottom ? (right ? r[2] : r[3]) : right ? r[1] : r[0], w / 2, h / 2));
  const qx = Math.abs(px - cx) - (w / 2 - radius);
  const qy = Math.abs(py - cy) - (h / 2 - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

const coverage = (d) => Math.max(0, Math.min(1, 0.5 - d));

/** Three passes of a box blur approximate a Gaussian of `sigma`: in place over a w x h float mask. */
function blur(mask, w, h, sigma) {
  if (sigma <= 0) return mask;
  const r = Math.max(1, Math.round((Math.sqrt((12 * sigma * sigma) / 3 + 1) - 1) / 2));
  const tmp = new Float32Array(mask.length);
  const pass = (from, to, len, count, stride, step) => {
    for (let i = 0; i < count; i += 1) {
      const base = i * stride;
      let sum = 0;
      for (let k = -r; k <= r; k += 1) sum += from[base + Math.max(0, Math.min(len - 1, k)) * step];
      for (let j = 0; j < len; j += 1) {
        to[base + j * step] = sum / (2 * r + 1);
        sum += from[base + Math.min(len - 1, j + r + 1) * step] - from[base + Math.max(0, j - r) * step];
      }
    }
  };
  for (let n = 0; n < 3; n += 1) {
    pass(mask, tmp, w, h, w, 1);
    pass(tmp, mask, h, w, 1, w);
  }
  return mask;
}

/**
 * The finished frame: the background, the shadow, the title bar, and the
 * picture (`img`, IW x IH, placed at whole pixel X, Y) clipped to the card.
 *   card   from cardAt(): {x, y, w, h, bar, radius, shadow: {alpha, blur, drop}}
 */
export function compose(img, IW, IH, X, Y, card, bg, W, H) {
  const out = new Uint8Array(backdrop(bg, W, H));
  const { x, y, w, h, bar } = card;
  const r = card.radius;
  const top = y - bar;

  /* The shadow, worked out at a quarter of the size and spread back up. */
  if (card.shadow.alpha > 0.002) {
    const q = 4;
    const mw = Math.ceil(W / q);
    const mh = Math.ceil(H / q);
    const mask = new Float32Array(mw * mh);
    for (let my = 0; my < mh; my += 1) {
      for (let mx = 0; mx < mw; mx += 1) {
        mask[my * mw + mx] = coverage(roundedRect((mx + 0.5) * q, (my + 0.5) * q - card.shadow.drop, x, top, w, h + bar, [r, r, r, r]) / q);
      }
    }
    blur(mask, mw, mh, card.shadow.blur / 2 / q);
    for (let py = 0; py < H; py += 1) {
      const fy = Math.max(0, Math.min(mh - 1.001, (py + 0.5) / q - 0.5));
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      for (let px = 0; px < W; px += 1) {
        const fx = Math.max(0, Math.min(mw - 1.001, (px + 0.5) / q - 0.5));
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const i = y0 * mw + x0;
        const m = (mask[i] * (1 - tx) + mask[i + 1] * tx) * (1 - ty) + (mask[i + mw] * (1 - tx) + mask[i + mw + 1] * tx) * ty;
        if (m <= 0.001) continue;
        const k = 1 - card.shadow.alpha * m;
        const o = (py * W + px) * 3;
        out[o] = Math.round(out[o] * k);
        out[o + 1] = Math.round(out[o + 1] * k);
        out[o + 2] = Math.round(out[o + 2] * k);
      }
    }
  }

  const blend = (o, rgb, a) => {
    out[o] = Math.round(out[o] + (rgb[0] - out[o]) * a);
    out[o + 1] = Math.round(out[o + 1] + (rgb[1] - out[o + 1]) * a);
    out[o + 2] = Math.round(out[o + 2] + (rgb[2] - out[o + 2]) * a);
  };

  /* The title bar: three dots and an address field, the way a browser window reads at a glance. */
  if (bar > 0.5) {
    const dot = bar * 0.17;
    const field = { w: Math.min(w * 0.34, bar * 14), h: bar * 0.52 };
    const y0 = Math.max(0, Math.floor(top));
    const y1 = Math.min(H, Math.ceil(y));
    for (let py = y0; py < y1; py += 1) {
      for (let px = Math.max(0, Math.floor(x)); px < Math.min(W, Math.ceil(x + w)); px += 1) {
        const cx = px + 0.5;
        const cy = py + 0.5;
        const a = coverage(roundedRect(cx, cy, x, top, w, bar + r + 1, [r, r, 0, 0]));
        if (a <= 0) continue;
        const o = (py * W + px) * 3;
        blend(o, WINDOW.bar, a);
        for (let i = 0; i < 3; i += 1) {
          const d = Math.hypot(cx - (x + bar * 0.62 + i * bar * 0.56), cy - (top + bar / 2)) - dot;
          const c = coverage(d);
          if (c > 0) blend(o, WINDOW.dot, c * a);
        }
        const f = coverage(roundedRect(cx, cy, x + (w - field.w) / 2, top + (bar - field.h) / 2, field.w, field.h, Array(4).fill(field.h / 2)));
        if (f > 0) blend(o, WINDOW.field, f * a);
        const edge = coverage(Math.abs(cy - (y - 0.5)) - 0.5);
        if (edge > 0) blend(o, WINDOW.edge, edge * a * 0.8);
      }
    }
  }

  /* The picture, with rounded corners; under a title bar its top corners are square. */
  const corners = bar > 0.5 ? [0, 0, r, r] : [r, r, r, r];
  const inner = r + 1.5;
  for (let iy = 0; iy < IH; iy += 1) {
    const py = Y + iy;
    if (py < 0 || py >= H) continue;
    const cy = py + 0.5;
    const nearY = cy < y + inner || cy > y + h - inner;
    for (let ix = 0; ix < IW; ix += 1) {
      const px = X + ix;
      if (px < 0 || px >= W) continue;
      const cx = px + 0.5;
      const s = (iy * IW + ix) * 3;
      const o = (py * W + px) * 3;
      const edge = nearY || cx < x + inner || cx > x + w - inner;
      const a = edge ? coverage(roundedRect(cx, cy, x, y, w, h, corners)) : 1;
      if (a >= 1) {
        out[o] = img[s];
        out[o + 1] = img[s + 1];
        out[o + 2] = img[s + 2];
      } else if (a > 0) blend(o, [img[s], img[s + 1], img[s + 2]], a);
    }
  }
  return out;
}
