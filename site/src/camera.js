/**
 * The hero's camera. It is Dolly's own: the grammar's `shots` turns the
 * take's beats and boxes into a spec, and every frame goes through
 * `cameraAt`, `viewBox` and `spotAlpha`, the modules the renderer and the
 * Studio run. The visitor only changes what a director could: how far the
 * lean goes, the curve each move arrives on, and whether the wash is on.
 */
import { cameraAt, viewBox, spotAlpha, checkSpec, normalizeSpec, spring, smootherstep, bouncySpring } from '../../engine/camera/math.mjs';
import { shots, LEAN_Z, SPRING, WASH, WASH_ALPHA, SPOT_RADIUS } from '../../engine/camera/grammar.mjs';
import { segments } from '../../engine/storyboard.mjs';

export { LEAN_Z, SPRING, WASH_ALPHA };

/** The feel of a move, as the arriving keyframe's curve. */
export const FEELS = {
  spring: { label: 'Spring', note: 'zero bounce, the grammar', curve: (u) => spring(u), key: {} },
  smooth: { label: 'Smooth', note: 'even, no jolt', curve: (u) => smootherstep(u), key: { ease: 'smooth' } },
  bouncy: { label: 'Bouncy', note: 'why the grammar says no', curve: (u) => bouncySpring(u, { bounce: 0.4 }, SPRING), key: { transition: { type: 'spring', bounce: 0.4 } } },
};

/** The camera spec for a direction: {lean, feel, wash}. */
export function direct(tour, { lean = LEAN_Z, feel = 'spring', wash = true }) {
  const { spec } = shots(tour.shots, { at: (label) => tour.beats[label], boxes: tour.boxes, length: tour.master.duration });
  const key = FEELS[feel].key;
  const camera = spec.camera.map((k, i) => ({ ...k, ...(i > 0 ? key : {}), ...(k.focus ? { z: lean } : {}) }));
  const out = normalizeSpec({ camera, spots: wash ? spec.spots : [] });
  const { warnings } = checkSpec(out);
  return { spec: out, warnings, segments: segments(out.camera, tour.boxes) };
}

function drawWash(c, X, Y, RW, RH, radius, alpha, W, H) {
  const level = Math.trunc(255 * WASH_ALPHA * alpha) / 255;
  if (level <= 0) return;
  c.save();
  c.beginPath();
  c.rect(0, 0, W, H);
  c.roundRect(X, Y, RW, RH, Math.max(0, Math.min(radius, RW / 2, RH / 2)));
  c.fillStyle = `rgba(${WASH.join(',')},${level})`;
  c.fill('evenodd');
  c.restore();
}

/**
 * One frame at `t`, drawn onto a canvas of OW x OH from the proxy `video`
 * (PW x PH). `spec` null is the raw take: the whole frame, as recorded.
 * Returns the view [cx, cy, z].
 */
export function drawFrame(c, video, tour, spec, t, OW, OH) {
  const PW = video.videoWidth || tour.proxy.width;
  const PH = video.videoHeight || tour.proxy.height;
  const view = spec ? cameraAt(spec.camera, t) : [0.5, 0.5, 1];
  const v = viewBox(PW, PH, OW, OH, view);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(video, v.x0, v.y0, v.vw, v.vh, 0, 0, OW, OH);
  if (spec) {
    const k = OW / v.vw;
    const css = PW / tour.viewport.width;
    for (const s of spec.spots) {
      drawWash(c, (s.x * PW - v.x0) * k, (s.y * PH - v.y0) * k, s.w * PW * k, s.h * PH * k, SPOT_RADIUS * css * k, spotAlpha(s, t), OW, OH);
    }
  }
  return view;
}

/** What the camera is doing at `t`, in words, from the storyboard's segments. */
export function shotAt(segs, t) {
  const i = segs.findIndex((s) => t >= s.t0 && t < s.t1);
  const n = i < 0 ? segs.length - 1 : i;
  return { n: n + 1, seg: segs[n] };
}
