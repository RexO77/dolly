/**
 * A clip's storyboard, read off what was actually shot: the take's beats,
 * the camera's moves and the spotlights, on one timeline. Pure, so both
 * `dolly storyboard --text` and the storyboard page use it.
 *
 *    0.00  camera  hold wide                              1.00s
 *    1.00  camera  lean in on trail, z 1.385              spring 1.20s
 *    2.25  beat    data-science
 */
import { resolve, cameraAt } from './camera/math.mjs';

const same = (a, b) => ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) < 1e-6);
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-4);

/** The take's name for a rect, if it measured one like it. */
export function boxName(rect, boxes = {}) {
  return Object.entries(boxes).find(([, b]) => same(b, rect))?.[0] ?? null;
}

/** What a keyframe looks at, in words: wide, a named box, or a view. */
export function subject(k, boxes = {}) {
  if (k.wide) return 'wide';
  if (k.focus) return boxName(k.focus, boxes) ?? `(${k.focus.x.toFixed(2)}, ${k.focus.y.toFixed(2)})`;
  return `(${k.cx.toFixed(2)}, ${k.cy.toFixed(2)})`;
}

/**
 * The camera as shots: every span between two keyframes is a hold (the
 * view stays put) or a move (lean in, pull back, hop).
 */
export function segments(camera, boxes = {}) {
  const keys = [...camera].sort((a, b) => a.t - b.t);
  const out = [];
  for (let i = 0; i + 1 < keys.length; i += 1) {
    const a = keys[i];
    const b = keys[i + 1];
    if (b.t - a.t <= 0) continue;
    const va = resolve(a);
    const vb = resolve(b);
    let kind = 'hold';
    if (!near(va, vb)) kind = b.wide || vb[2] === 1 ? 'pull' : vb[2] > va[2] + 1e-4 ? 'lean' : 'hop';
    const what = kind === 'hold' ? `hold ${subject(a, boxes)}` : kind === 'pull' ? 'pull back to wide' : `${kind === 'lean' ? 'lean in on' : 'hop to'} ${subject(b, boxes)}`;
    out.push({ t0: a.t, t1: b.t, kind, what, z: vb[2], ease: b.ease === 'smooth' ? 'smooth' : 'spring', from: i, to: i + 1 });
  }
  return out;
}

/** Storyboard rows, sorted by time: {t, lane, what, note}. */
export function storyboard(spec, take = null) {
  const boxes = take?.boxes ?? {};
  const rows = segments(spec.camera, boxes).map((s) => ({
    t: s.t0,
    lane: 'camera',
    what: s.kind === 'hold' || s.kind === 'pull' ? s.what : `${s.what}, z ${s.z.toFixed(3).replace(/\.?0+$/, '')}`,
    note: s.kind === 'hold' ? `${(s.t1 - s.t0).toFixed(2)}s` : `${s.ease} ${(s.t1 - s.t0).toFixed(2)}s`,
  }));
  for (const [label, t] of Object.entries(take?.beats ?? {})) rows.push({ t, lane: 'beat', what: label });
  for (const s of spec.spots ?? []) {
    const name = boxName(s, boxes) ?? 'rect';
    rows.push({ t: s.in, lane: 'wash', what: `on ${name}`, note: `fade ${(s.fade ?? 0.5).toFixed(2)}s` });
    if (s.out !== undefined) rows.push({ t: s.out, lane: 'wash', what: `off ${name}` });
  }
  rows.push({ t: Math.max(...spec.camera.map((k) => k.t)), lane: 'end', what: '' });
  const order = { camera: 0, wash: 1, beat: 2, end: 3 };
  return rows.sort((a, b) => a.t - b.t || order[a.lane] - order[b.lane]);
}

/** The rows as aligned text. */
export function formatStoryboard(rows) {
  const width = Math.max(...rows.map((r) => r.what.length), 20);
  return rows
    .map((r) => `${r.t.toFixed(2).padStart(7)}  ${r.lane.padEnd(6)}  ${r.what.padEnd(width)}  ${r.note ?? ''}`.trimEnd())
    .join('\n');
}

/**
 * Where the camera breaks the grammar or the picture: moving while a beat
 * plays, no hold after the last pull back, and leans that upscale the master
 * (the delivered frame then has fewer real pixels than it shows: soft).
 * `W` and `OW` are the master's and the delivery's widths.
 */
export function directorsNotes(spec, take, { W, OW, fps = 30 }) {
  const notes = [];
  const segs = segments(spec.camera, take?.boxes);
  for (const [label, t] of Object.entries(take?.beats ?? {})) {
    const moving = segs.find((s) => s.kind !== 'hold' && s.t0 < t && t < s.t1);
    if (moving) notes.push({ level: 'warn', t, text: `the camera is still moving (${moving.what}) at beat "${label}"; the grammar keeps it still while the product changes` });
  }
  const last = segs[segs.length - 1];
  if (last && last.kind === 'hold' && segs.some((s) => s.kind === 'pull') && last.t1 - last.t0 < 0.8) {
    notes.push({ level: 'warn', t: last.t0, text: `the final hold is ${(last.t1 - last.t0).toFixed(2)}s; hold at least 0.8s so the finished state is seen` });
  }
  const keys = [...spec.camera].sort((a, b) => a.t - b.t);
  const end = keys[keys.length - 1].t;
  let worst = { ratio: Infinity, t: 0 };
  for (let i = 0; i <= Math.round(end * fps); i += 1) {
    const t = i / fps;
    const z = Math.max(1, cameraAt(keys, t)[2]);
    const ratio = W / z / OW;
    if (ratio < worst.ratio) worst = { ratio, t };
  }
  if (worst.ratio < 1) notes.push({ level: 'warn', t: worst.t, text: `soft at ${worst.t.toFixed(2)}s: the lean upscales the master ${(1 / worst.ratio).toFixed(2)}x` });
  else if (Number.isFinite(worst.ratio)) notes.push({ level: 'ok', t: worst.t, text: `sharp throughout: at the tightest lean, ${worst.ratio.toFixed(2)} master pixels per delivered pixel` });
  return notes;
}

