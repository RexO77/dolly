/**
 * The camera's maths: where the view sits at any moment, and how strongly
 * each spotlight is lit. Pure functions with no Node or DOM dependency, so
 * the renderer and the Studio's live preview read the same module.
 *
 * A camera spec is {camera: [...keyframes], spots: [...], source?: {...}}.
 * A keyframe is {t, wide: true}, {t, focus: {x, y, w, h}, z?} or
 * {t, cx, cy, z}; every position is a fraction of the frame. Between two
 * keyframes the camera moves on the ARRIVING keyframe's curve: its
 * `transition` when it has one (shaped in the Studio's curve editor), else
 * its `ease`, "spring" (the default) or "smooth". Two equal neighbours make
 * a hold.
 *
 *   transition: {type: 'easing', ease: [x1, y1, x2, y2]}   a cubic Bezier over the move
 *   transition: {type: 'spring', bounce}                   a spring that lands on the move's end
 */
import { LEAN_Z, SPRING_A, FOCUS_FILL } from './grammar.mjs';

/** Zero velocity and zero acceleration at both ends: a move never starts or stops with a jolt. */
export function smootherstep(u) {
  u = Math.max(0, Math.min(1, u));
  return u * u * u * (u * (u * 6 - 15) + 10);
}

/**
 * A zero-bounce (critically damped) spring, normalised to land exactly at 1:
 * quick off the mark, a long soft settle, never overshooting.
 */
export function spring(u) {
  u = Math.max(0, Math.min(1, u));
  const raw = 1 - (1 + SPRING_A * u) * Math.exp(-SPRING_A * u);
  const end = 1 - (1 + SPRING_A) * Math.exp(-SPRING_A);
  return raw / end;
}

const bezierAxis = (t, a1, a2) => (1 - 3 * a2 + 3 * a1) * t * t * t + (3 * a2 - 6 * a1) * t * t + 3 * a1 * t;
const bezierSlope = (t, a1, a2) => 3 * (1 - 3 * a2 + 3 * a1) * t * t + 2 * (3 * a2 - 6 * a1) * t + 3 * a1;

/** A CSS-style cubic Bezier easing at progress `p`: Newton's method, then bisection where it stalls. */
export function cubicBezier(p, [x1, y1, x2, y2]) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let t = p;
  for (let i = 0; i < 8; i += 1) {
    const x = bezierAxis(t, x1, x2) - p;
    if (Math.abs(x) < 1e-5) return bezierAxis(t, y1, y2);
    const dx = bezierSlope(t, x1, x2);
    if (Math.abs(dx) < 1e-6) break;
    t -= x / dx;
  }
  let lo = 0;
  let hi = 1;
  t = p;
  while (hi - lo > 1e-5) {
    if (bezierAxis(t, x1, x2) < p) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return bezierAxis(t, y1, y2);
}

/**
 * A damped spring with some bounce over a move of `span` seconds (period
 * from the move's length, damping ratio 1 - bounce), normalised to land
 * exactly on the move's end: a spring's own tail would creep or snap after
 * the move, and the camera must be still when the change starts.
 */
export function bouncySpring(u, { bounce = 0 } = {}, span = 1) {
  u = Math.max(0, Math.min(1, u));
  const w0 = (2 * Math.PI) / (span * 1.2);
  const zeta = Math.min(1, Math.max(0.05, 1 - bounce));
  const at = (t) => {
    if (t <= 0) return 0;
    if (zeta < 0.9999) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
    }
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  };
  return at(u * span) / at(span);
}

/** How far through a move the arriving keyframe's curve is at `u` (0..1) of a move lasting `span` seconds. */
export function progress(k, u, span) {
  const tr = k.transition;
  if (tr?.type === 'easing') return cubicBezier(u, tr.ease);
  if (tr?.type === 'spring') return bouncySpring(u, tr, span);
  return k.ease === 'smooth' ? smootherstep(u) : spring(u);
}

/**
 * A keyframe as a view [cx, cy, z]. A `focus` rect is leaned in on at
 * LEAN_Z (or its own `z`), centred on the rect and backed off just enough
 * that the whole rect stays in view.
 */
export function resolve(k) {
  if (k.wide) return [0.5, 0.5, 1];
  if (k.focus) {
    const f = k.focus;
    let z = k.z ?? LEAN_Z;
    z = Math.min(z, FOCUS_FILL / Math.max(f.w, 1e-6), FOCUS_FILL / Math.max(f.h, 1e-6));
    return [f.x + f.w / 2, f.y + f.h / 2, Math.max(1, z)];
  }
  return [k.cx, k.cy, k.z];
}

/** The view [cx, cy, z] at time `t`, over keyframes sorted by `t`. */
export function cameraAt(keys, t) {
  if (t <= keys[0].t) return resolve(keys[0]);
  for (let i = 0; i + 1 < keys.length; i += 1) {
    const a = keys[i];
    const b = keys[i + 1];
    if (a.t <= t && t <= b.t) {
      const span = b.t - a.t;
      const u = span > 0 ? (t - a.t) / span : 1;
      const e = progress(b, u, span);
      const va = resolve(a);
      const vb = resolve(b);
      return [0, 1, 2].map((i) => va[i] + (vb[i] - va[i]) * e);
    }
  }
  return resolve(keys[keys.length - 1]);
}

/**
 * The crop, in source pixels, for a view over a W x H source delivered at
 * OW x OH. It keeps the output's aspect ratio and is clamped inside the
 * frame, so it never shows an edge. Float box: moves are sub-pixel smooth.
 */
export function viewBox(W, H, OW, OH, [cx, cy, z]) {
  z = Math.max(1, z);
  let vw = W / z;
  let vh = (vw * OH) / OW;
  if (vh > H) {
    vh = H;
    vw = (vh * OW) / OH;
  }
  const x0 = Math.min(Math.max(cx * W - vw / 2, 0), W - vw);
  const y0 = Math.min(Math.max(cy * H - vh / 2, 0), H - vh);
  return { x0, y0, vw, vh };
}

/**
 * How lit a spotlight is at `t`, 0..1. It fades in on an ease-out over
 * `fade` seconds from `in`, and out a little quicker (exits are quieter
 * than entrances) from `out`, if given.
 */
export function spotAlpha(s, t) {
  const fade = s.fade ?? 0.5;
  if (t < s.in) return 0;
  const u = Math.min(1, (t - s.in) / fade);
  let a = 1 - (1 - u) ** 3;
  if (s.out !== undefined && t > s.out) {
    const fo = s.fadeOut ?? fade * 0.7;
    const v = Math.min(1, (t - s.out) / fo);
    a *= 1 - smootherstep(v);
  }
  return Math.max(0, Math.min(1, a));
}

/** A spec as the renderer reads it: a bare keyframe list is accepted, keys are sorted by time. */
export function normalizeSpec(spec) {
  const s = Array.isArray(spec) ? { camera: spec } : { ...spec };
  if (!Array.isArray(s.camera) || !s.camera.length) throw new Error('camera spec has no keyframes');
  s.camera = [...s.camera].sort((a, b) => a.t - b.t);
  s.spots = s.spots ?? [];
  s.source = s.source ?? {};
  return s;
}

/** Problems a spec can have that would render wrong or break the grammar. Errors stop a render; warnings do not. */
export function checkSpec(spec) {
  const errors = [];
  const warnings = [];
  const inFrame = (r) => r && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0;
  spec.camera.forEach((k, i) => {
    if (!Number.isFinite(k.t)) errors.push(`camera[${i}] has no time`);
    if (k.focus && !inFrame(k.focus)) errors.push(`camera[${i}].focus is not a rect`);
    if (!k.wide && !k.focus && ![k.cx, k.cy, k.z].every(Number.isFinite)) errors.push(`camera[${i}] is neither wide, a focus nor a view`);
    if (k.ease && !['spring', 'smooth'].includes(k.ease)) errors.push(`camera[${i}].ease is "${k.ease}", not spring or smooth`);
    const tr = k.transition;
    if (tr && tr.type === 'easing' && !(Array.isArray(tr.ease) && tr.ease.length === 4 && tr.ease.every(Number.isFinite))) errors.push(`camera[${i}].transition.ease needs four numbers`);
    if (tr && tr.type !== 'easing' && tr.type !== 'spring') errors.push(`camera[${i}].transition.type is "${tr.type}", not easing or spring`);
    const z = k.wide ? 1 : resolve(k)[2];
    if (z < 1) errors.push(`camera[${i}] zooms out past the frame (z ${z})`);
    if (z > LEAN_Z * 1.1) warnings.push(`camera[${i}] leans in to ${z.toFixed(3)}, past ${LEAN_Z}: text softens and the product loses its context`);
  });
  spec.spots.forEach((s, i) => {
    if (!inFrame(s)) errors.push(`spots[${i}] is not a rect`);
    if (!Number.isFinite(s.in)) errors.push(`spots[${i}] has no "in" time`);
    if (s.ring) warnings.push(`spots[${i}] asks for a ring; the grammar is wash only, so it is ignored`);
  });
  const { cut, end } = spec.source;
  if (cut && !(cut.from < cut.to)) errors.push('source.cut needs from < to');
  if (end !== undefined && !(end > 0)) errors.push('source.end must be a positive time');
  return { errors, warnings };
}
