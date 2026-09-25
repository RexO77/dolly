/**
 * The site's camera. It is Dolly's own: the grammar's `shots` turns the
 * take's beats and boxes into a spec, and every frame goes through
 * `cameraAt`, `viewBox`, `spotAlpha` and, for a frame, `cardAt`: the modules
 * the renderer and the Studio run. The visitor only changes what a director
 * could: how far the lean goes, the curve each move arrives on, the wash,
 * and whether the clip sits on a background as a card.
 */
import { cameraAt, viewBox, spotAlpha, checkSpec, normalizeSpec, spring, smootherstep, bouncySpring } from '../../engine/camera/math.mjs';
import { shots, LEAN_Z, SPRING, WASH, WASH_ALPHA, SPOT_RADIUS, BACKDROPS } from '../../engine/camera/grammar.mjs';
import { resolveFrame, cardAt } from '../../engine/camera/card.mjs';
import { WINDOW } from '../../engine/camera/compose.mjs';
import { segments } from '../../engine/storyboard.mjs';

export { LEAN_Z, SPRING, WASH_ALPHA, BACKDROPS };

/** The feel of a move, as the arriving keyframe's curve. */
export const FEELS = {
  spring: { label: 'Spring', note: 'zero bounce, the grammar', curve: (u) => spring(u), key: {} },
  smooth: { label: 'Smooth', note: 'even, no jolt', curve: (u) => smootherstep(u), key: { ease: 'smooth' } },
  bouncy: { label: 'Bouncy', note: 'why the grammar says no', curve: (u) => bouncySpring(u, { bounce: 0.4 }, SPRING), key: { transition: { type: 'spring', bounce: 0.4 } } },
};

/** The camera spec for a direction: {lean, feel, wash, frame}. */
export function direct(tour, { lean = LEAN_Z, feel = 'spring', wash = true, frame = null }) {
  const { spec } = shots(tour.shots, { at: (label) => tour.beats[label], boxes: tour.boxes, length: tour.master.duration });
  const key = FEELS[feel].key;
  const camera = spec.camera.map((k, i) => ({ ...k, ...(i > 0 ? key : {}), ...(k.focus ? { z: lean } : {}) }));
  const out = normalizeSpec({ camera, spots: wash ? spec.spots : [] });
  const { warnings } = checkSpec(out);
  return { spec: out, look: resolveFrame(frame), warnings, segments: segments(out.camera, tour.boxes) };
}

const rgb = (c, a = 1) => `rgba(${c.join(',')},${a})`;

function drawWash(c, X, Y, RW, RH, radius, alpha, bounds) {
  const level = Math.trunc(255 * WASH_ALPHA * alpha) / 255;
  if (level <= 0) return;
  c.save();
  c.beginPath();
  c.rect(...bounds);
  c.roundRect(X, Y, RW, RH, Math.max(0, Math.min(radius, RW / 2, RH / 2)));
  c.fillStyle = `rgba(${WASH.join(',')},${level})`;
  c.fill('evenodd');
  c.restore();
}

/**
 * The frame's background behind the card: the gradient along the diagonal,
 * the vignette, the card's shadow and the browser bar, drawn the way the
 * Studio's preview draws them (studio/src/model/picture.js).
 */
function drawBackdrop(c, look, card, W, H) {
  const { from, to, vignette } = look.background;
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, rgb(from));
  g.addColorStop(1, rgb(to));
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  if (vignette > 0) {
    const R = Math.hypot(W, H) / 2;
    const v = c.createRadialGradient(W / 2, H / 2, R * 0.35, W / 2, H / 2, R);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, `rgba(0,0,0,${vignette})`);
    c.fillStyle = v;
    c.fillRect(0, 0, W, H);
  }
  const top = card.y - card.bar;
  if (card.shadow.alpha > 0.002) {
    c.save();
    c.filter = `blur(${card.shadow.blur / 2}px)`;
    c.fillStyle = `rgba(0,0,0,${card.shadow.alpha})`;
    c.beginPath();
    c.roundRect(card.x, top + card.shadow.drop, card.w, card.h + card.bar, card.radius);
    c.fill();
    c.restore();
  }
  if (card.bar > 0.5) {
    const { bar } = card;
    c.save();
    c.beginPath();
    c.roundRect(card.x, top, card.w, bar + card.radius + 1, [card.radius, card.radius, 0, 0]);
    c.clip();
    c.fillStyle = rgb(WINDOW.bar);
    c.fillRect(card.x, top, card.w, bar);
    c.fillStyle = rgb(WINDOW.dot);
    for (let i = 0; i < 3; i += 1) {
      c.beginPath();
      c.arc(card.x + bar * 0.62 + i * bar * 0.56, top + bar / 2, bar * 0.17, 0, Math.PI * 2);
      c.fill();
    }
    const fw = Math.min(card.w * 0.34, bar * 14);
    const fh = bar * 0.52;
    c.fillStyle = rgb(WINDOW.field);
    c.beginPath();
    c.roundRect(card.x + (card.w - fw) / 2, top + (bar - fh) / 2, fw, fh, fh / 2);
    c.fill();
    c.fillStyle = rgb(WINDOW.edge, 0.8);
    c.fillRect(card.x, card.y - 1, card.w, 1);
    c.restore();
  }
}

/**
 * One frame at `t`, drawn onto a canvas of OW x OH from `source` (a video
 * or an image of the take, SW x SH). `spec` null is the raw take: the whole
 * frame, as recorded. `look` is a resolved frame, or null for none. `css` is
 * source pixels per CSS pixel of the recording, for the wash's corners.
 * Returns the view [cx, cy, z].
 */
export function drawShot(c, source, { SW, SH, spec, look = null, t, OW, OH, css }) {
  const view = spec ? cameraAt(spec.camera, t) : [0.5, 0.5, 1];
  const v = viewBox(SW, SH, OW, OH, view);
  const card = spec && look ? cardAt(look, spec.camera, t, OW, OH) : { x: 0, y: 0, w: OW, h: OH, bar: 0 };
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.save();
  if (spec && look) {
    drawBackdrop(c, look, card, OW, OH);
    const r = card.radius;
    c.beginPath();
    c.roundRect(card.x, card.y, card.w, card.h, card.bar > 0.5 ? [0, 0, r, r] : r);
    c.clip();
  }
  c.drawImage(source, v.x0, v.y0, v.vw, v.vh, card.x, card.y, card.w, card.h);
  if (spec) {
    const k = card.w / v.vw;
    for (const s of spec.spots) {
      drawWash(c, card.x + (s.x * SW - v.x0) * k, card.y + (s.y * SH - v.y0) * k, s.w * SW * k, s.h * SH * k, SPOT_RADIUS * css * k, spotAlpha(s, t), [card.x, card.y, card.w, card.h]);
    }
  }
  c.restore();
  return view;
}

/** The hero's frame at `t` from the proxy video. */
export function drawFrame(c, video, tour, spec, look, t, OW, OH) {
  const SW = video.videoWidth || tour.proxy.width;
  const SH = video.videoHeight || tour.proxy.height;
  return drawShot(c, video, { SW, SH, spec, look, t, OW, OH, css: SW / tour.viewport.width });
}

/** What the camera is doing at `t`, in words, from the storyboard's segments. */
export function shotAt(segs, t) {
  const i = segs.findIndex((s) => t >= s.t0 && t < s.t1);
  const n = i < 0 ? segs.length - 1 : i;
  return { n: n + 1, seg: segs[n] };
}
