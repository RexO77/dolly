/**
 * The stage: the camera's finished frame as a card turned in 3D over a
 * background. It comes after the camera, so a take is never recorded again
 * for a tilt, and a spec without a `stage` renders exactly as before.
 *
 * Pure functions with no Node or DOM dependency: the renderer warps each
 * frame with `stageAt` and `homography`, and the Studio's preview turns its
 * canvas with `cssMatrix` of the same homography, so the two match.
 *
 *   spec.stage = {background: 'paper' | 'ink' | 'wash' | 'dusk' | {from, to, vignette},
 *                 inset, perspective, radius, shadow: {strength, blur, drop}}
 *   keyframe.tilt = {x, y, z}   degrees: x pitches the card's top away, y turns
 *                               it (positive sends its right side away), z rolls it
 *   keyframe.inset              the card's size at this keyframe, overriding the stage's
 *
 * Tilt and inset move between keyframes on the same curve as the camera.
 */
import { progress } from './math.mjs';
import { STAGE_INSET, STAGE_PERSPECTIVE, STAGE_RADIUS, STAGE_SHADOW, BACKGROUNDS } from './grammar.mjs';

const REFERENCE_WIDTH = 1920;
const rad = (d) => (d * Math.PI) / 180;

/** The stage with every default filled in, or null when the spec has none. */
export function resolveStage(stage) {
  if (!stage) return null;
  const background = typeof stage.background === 'string' || !stage.background
    ? BACKGROUNDS[stage.background ?? 'paper'] ?? BACKGROUNDS.paper
    : { vignette: 0, ...stage.background };
  return {
    background,
    inset: stage.inset ?? STAGE_INSET,
    perspective: stage.perspective ?? STAGE_PERSPECTIVE,
    radius: stage.radius ?? STAGE_RADIUS,
    shadow: { ...STAGE_SHADOW, ...stage.shadow },
  };
}

const pose = (k, stage) => ({ x: k.tilt?.x ?? 0, y: k.tilt?.y ?? 0, z: k.tilt?.z ?? 0, inset: k.inset ?? stage.inset });

/** The card's pose {x, y, z, inset} at time `t`, over the camera's keyframes sorted by `t`. */
export function stageAt(keys, stage, t) {
  if (t <= keys[0].t) return pose(keys[0], stage);
  for (let i = 0; i + 1 < keys.length; i += 1) {
    const a = keys[i];
    const b = keys[i + 1];
    if (a.t <= t && t <= b.t) {
      const span = b.t - a.t;
      const e = progress(b, span > 0 ? (t - a.t) / span : 1, span);
      const pa = pose(a, stage);
      const pb = pose(b, stage);
      return Object.fromEntries(Object.keys(pa).map((key) => [key, pa[key] + (pb[key] - pa[key]) * e]));
    }
  }
  return pose(keys[keys.length - 1], stage);
}

/**
 * Where the card's corners land in a W x H output, [top left, top right,
 * bottom right, bottom left], each [x, y]. The card is the frame at `inset`
 * of its size, centred, turned like CSS rotateX(x) rotateY(y) rotateZ(z)
 * and seen from `perspective` away.
 */
export function stageCorners(stage, p, W, H) {
  const d = stage.perspective * (W / REFERENCE_WIDTH);
  const [cx, sx] = [Math.cos(rad(p.x)), Math.sin(rad(p.x))];
  const [cy, sy] = [Math.cos(rad(p.y)), Math.sin(rad(p.y))];
  const [cz, sz] = [Math.cos(rad(p.z)), Math.sin(rad(p.z))];
  const hw = (W * p.inset) / 2;
  const hh = (H * p.inset) / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x0, y0]) => {
    /* rotateZ, then rotateY, then rotateX: the order CSS applies `rotateX() rotateY() rotateZ()` in. */
    const x1 = x0 * cz - y0 * sz;
    const y1 = x0 * sz + y0 * cz;
    const x2 = x1 * cy;
    const z2 = -x1 * sy;
    const y3 = y1 * cx - z2 * sx;
    const z3 = y1 * sx + z2 * cx;
    const k = d / (d - z3);
    return [W / 2 + x2 * k, H / 2 + y3 * k];
  });
}

/**
 * The 3x3 homography, row major, taking a point (u, v) of the frame, each
 * 0 to 1, to its place on the output: x = (h0 u + h1 v + h2) / (h6 u + h7 v + h8).
 */
export function homography(corners) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = corners;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}

/** The inverse of a 3x3 row-major matrix: output pixel back to (u, v) on the frame. */
export function invert(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
}

/** Apply a 3x3 row-major homography to (x, y). */
export function apply(m, x, y) {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

/**
 * A CSS matrix3d that puts a w x h element, drawn at the output's top left,
 * where the homography puts the frame, for an output drawn `scale` CSS px
 * per output px. The Studio turns its canvas with this.
 */
export function cssMatrix(m, w, h, scale = 1) {
  /* Element px to (u, v), then the homography, then output px to CSS px. */
  const n = [m[0] / w, m[1] / h, m[2], m[3] / w, m[4] / h, m[5], m[6] / w, m[7] / h, m[8]].map((v, i) => (i < 6 ? v * scale : v));
  const [a, b, c, d, e, f, g, hh, i] = n;
  return `matrix3d(${[a, d, 0, g, b, e, 0, hh, 0, 0, 1, 0, c, f, 0, i].map((v) => +v.toFixed(9)).join(',')})`;
}
