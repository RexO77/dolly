/**
 * A clip being directed: its camera spec, every edit to it (with undo and
 * redo), and the shot-level verbs and fixes the Studio offers. The camera
 * maths comes from the engine, the same modules the renderer runs, so what
 * the Studio shows is what renders.
 */
import { cameraAt, resolve, normalizeSpec, checkSpec } from '../../../engine/camera/math.mjs';
import { LEAN_Z, SPRING, SETTLE, ESTABLISH, SPRING_CURVE, SMOOTH_CURVE } from '../../../engine/camera/grammar.mjs';
import { segments, directorsNotes, boxName } from '../../../engine/storyboard.mjs';
import { clipLength } from './project.js';

export { LEAN_Z, SPRING, SETTLE, ESTABLISH, SPRING_CURVE, SMOOTH_CURVE, resolve, boxName };

export const r3 = (n) => Math.round(n * 1000) / 1000;
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-4);
let nextId = 1;
const withId = (k) => (k.id ? k : { ...k, id: nextId++ });
/** The spec as it is saved: no in-memory ids. */
const clean = (spec) => ({ ...spec, camera: spec.camera.map(({ id: _id, ...k }) => k) });

/** How much activity counts as the product changing. */
export const CHANGING = 0.35;

/** A beat's label as words: `machine-learning` reads as "machine learning". */
export const beatWords = (label) => label.replace(/[-_]+/g, ' ');

/** A shot's title, in the words a shot list uses. */
export function shotTitle(s) {
  const on = s.target.kind === 'box' ? ` on ${s.target.name}` : '';
  if (s.kind === 'hold') {
    if (s.target.kind === 'wide') return s.t0 === 0 ? 'Open wide' : 'Hold wide';
    return s.target.kind === 'box' ? `Hold on ${s.target.name}` : 'Hold close';
  }
  if (s.kind === 'lean') return `Lean in${on}`;
  if (s.kind === 'pull') return 'Pull back to wide';
  return `Hop${s.target.kind === 'box' ? ` to ${s.target.name}` : ' across'}`;
}

export class Clip {
  static async list() {
    const res = await fetch('/api/project');
    return res.json();
  }

  static async load(name) {
    const res = await fetch(`/api/clip/${encodeURIComponent(name)}`);
    const info = await res.json();
    if (!res.ok) throw new Error(info.error);
    const activity = await (await fetch(`/api/clip/${encodeURIComponent(name)}/activity`)).json();
    return new Clip(name, info, activity);
  }

  constructor(name, info, activity) {
    this.name = name;
    this.info = info;
    this.activity = activity;
    this.spec = { ...info.spec, camera: info.spec.camera.map(withId), spots: info.spec.spots ?? [] };
    this.holdToEnd();
    this.saved = JSON.stringify(clean(this.spec));
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
    this.version = 0;
    this.liveBase = null;
    /** How far a render has got, 0..1, while one runs; otherwise null. */
    this.rendering = null;
  }

  /**
   * The camera holds its last view to the end of the clip. Say so with a
   * keyframe there, so the last hold is a shot that can be seen and timed
   * (a clip with no camera yet is then one wide shot, not none). The
   * picture is the same either way.
   */
  holdToEnd() {
    const keys = this.spec.camera;
    const last = keys[keys.length - 1];
    const end = r3(this.length);
    if (last.t >= end - 0.05) return;
    const before = keys[keys.length - 2];
    if (before && near(resolve(before), resolve(last))) last.t = end;
    else {
      const { id: _id, ease: _ease, transition: _transition, ...view } = last;
      keys.push(withId({ ...view, t: end }));
    }
  }

  /* ── Reading ── */

  get take() {
    return this.info.take;
  }

  get boxes() {
    return this.info.take?.boxes ?? {};
  }

  get beats() {
    return Object.entries(this.info.take?.beats ?? {}).map(([label, t]) => ({ label, t })).sort((a, b) => a.t - b.t);
  }

  get dirty() {
    return JSON.stringify(clean(this.spec)) !== this.saved;
  }

  get length() {
    return clipLength(this.info.master.duration, this.spec.source);
  }

  /** Whether the camera does anything yet: a clip that only holds wide has not been directed. */
  get hasMoves() {
    return this.shots.some((s) => s.kind !== 'hold');
  }

  /**
   * What of the master is on screen at clip time t. Across a cut, the render
   * crossfades (ffmpeg's xfade, engine/render.mjs): over the `fade` seconds
   * before `cut.from`, the master at `from` fades out as the master at `to`
   * fades in, by `mix` (0..1, linear). Everywhere else there is one moment
   * and `to` is null.
   */
  sourceAt(t) {
    const cut = this.spec.source?.cut;
    if (!cut) return { from: t, to: null, mix: 0 };
    const fade = cut.fade ?? 0.25;
    const start = cut.from - fade;
    const after = cut.to + (t - start);
    if (t < start) return { from: t, to: null, mix: 0 };
    if (t >= cut.from || fade <= 0) return { from: after, to: null, mix: 0 };
    return { from: t, to: after, mix: (t - start) / fade };
  }

  /** The master moment most on screen at clip time t: what the activity is read at. */
  masterTime(t) {
    const s = this.sourceAt(t);
    return s.to !== null && s.mix >= 0.5 ? s.to : s.from;
  }

  view(t) {
    return cameraAt(this.spec.camera, t);
  }

  /** The camera as shots: holds and moves, each with the ids of the keyframes it runs between. */
  get shots() {
    const keys = this.spec.camera;
    return segments(keys, this.boxes).map((s, n) => ({
      ...s,
      n,
      id: keys[s.to].id,
      fromId: keys[s.from].id,
      target: this.targetOf(keys[s.to]),
      z: resolve(keys[s.to])[2],
    }));
  }

  /** What a keyframe frames, in words: wide, a measured box by name, or a frame. */
  targetOf(k) {
    if (k.wide || resolve(k)[2] <= 1.0005) return { kind: 'wide', label: 'Wide' };
    const name = k.focus ? boxName(k.focus, this.boxes) : null;
    if (name) return { kind: 'box', name, label: name };
    return { kind: 'frame', label: `${resolve(k)[2].toFixed(2)}×` };
  }

  shotById(id) {
    return this.shots.find((s) => s.id === id) ?? null;
  }

  shotAt(t) {
    const shots = this.shots;
    return shots.find((s) => t >= s.t0 && t < s.t1) ?? shots[shots.length - 1];
  }

  keyIndex(id) {
    return this.spec.camera.findIndex((k) => k.id === id);
  }

  /** The curve a keyframe arrives on, as a name and a cubic Bezier to draw. */
  curve(id) {
    const k = this.spec.camera[this.keyIndex(id)];
    if (k?.transition?.type === 'easing') return { name: 'custom', ease: k.transition.ease };
    if (k?.ease === 'smooth') return { name: 'smooth', ease: SMOOTH_CURVE };
    return { name: 'spring', ease: SPRING_CURVE };
  }

  activityAt(t) {
    const { values, fps } = this.activity;
    return values[Math.round(this.masterTime(t) * fps)] ?? 0;
  }

  /* ── Change ── */

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.version += 1;
    for (const fn of this.listeners) fn(this.version);
  }

  /**
   * Every change goes through here. A `live` change (a drag in progress)
   * is one undo step from its first frame until `settle()`.
   */
  edit(mutate, { live = false, tidy = false } = {}) {
    const before = JSON.stringify(this.spec);
    if (live) this.liveBase ??= before;
    else {
      this.undoStack.push(before);
      this.redoStack = [];
    }
    mutate(this.spec);
    this.spec.camera = this.spec.camera.map(withId).sort((a, b) => a.t - b.t);
    if (tidy) this.tidy();
    this.emit();
  }

  settle() {
    if (this.liveBase === null) return;
    if (this.liveBase !== JSON.stringify(this.spec)) {
      this.undoStack.push(this.liveBase);
      this.redoStack = [];
    }
    this.liveBase = null;
    this.emit();
  }

  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(JSON.stringify(this.spec));
    this.spec = JSON.parse(this.undoStack.pop());
    this.emit();
  }

  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(JSON.stringify(this.spec));
    this.spec = JSON.parse(this.redoStack.pop());
    this.emit();
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  /** Drop keyframes in the middle of a hold: they change nothing and clutter the shots. */
  tidy() {
    const k = this.spec.camera;
    for (let i = k.length - 2; i > 0; i -= 1) {
      if (near(resolve(k[i - 1]), resolve(k[i])) && near(resolve(k[i]), resolve(k[i + 1]))) k.splice(i, 1);
    }
  }

  /* ── Timing ── */

  /** Move one keyframe in time, kept between its neighbours. */
  setKeyTime(id, t, opts) {
    const keys = this.spec.camera;
    const i = this.keyIndex(id);
    const lo = i > 0 ? keys[i - 1].t + 0.05 : 0;
    const hi = i + 1 < keys.length ? keys[i + 1].t - 0.05 : this.length + 5;
    this.edit((s) => {
      s.camera[i].t = r3(Math.max(lo, Math.min(hi, t)));
    }, opts);
  }

  /** Move a whole move (both its keyframes) by dt, as far as its neighbours allow. */
  shiftShot(shot, dt, opts) {
    const keys = this.spec.camera;
    const a = this.keyIndex(shot.fromId);
    const b = this.keyIndex(shot.id);
    const lo = a > 0 ? keys[a - 1].t + 0.05 - keys[a].t : -keys[a].t;
    const hi = b + 1 < keys.length ? keys[b + 1].t - 0.05 - keys[b].t : this.length - keys[b].t;
    const d = Math.max(lo, Math.min(hi, dt));
    this.edit((s) => {
      s.camera[a].t = r3(s.camera[a].t + d);
      s.camera[b].t = r3(s.camera[b].t + d);
    }, opts);
  }

  /** Times worth snapping to while retiming: the beats, and a lean's settle point before each. */
  snapTimes() {
    return this.beats.flatMap((b) => [{ t: b.t, label: b.label }, { t: b.t - SETTLE, label: `settled before ${b.label}` }]);
  }

  /* ── Framing ── */

  /** Frame a shot: a hold keeps both ends on the view; a move lands on it, and so does the hold after it. */
  frameShot(shot, view, opts) {
    const ids = [shot.id];
    if (shot.kind === 'hold') ids.push(shot.fromId);
    else {
      const next = this.shots.find((s) => s.fromId === shot.id && s.kind === 'hold');
      if (next) ids.push(next.id);
    }
    const [cx, cy, z] = view;
    this.edit((s) => {
      for (const id of ids) {
        const i = s.camera.findIndex((k) => k.id === id);
        const k = s.camera[i];
        const next = z <= 1.0005 ? { t: k.t, wide: true } : { t: k.t, cx: r3(cx), cy: r3(cy), z: r3(Math.min(3, z)) };
        s.camera[i] = { ...next, id: k.id, ...(k.transition ? { transition: k.transition } : {}), ...(k.ease ? { ease: k.ease } : {}) };
      }
    }, opts);
  }

  /** Lean a shot on a box the take measured, at the grammar's zoom. */
  frameOnBox(shot, name) {
    const box = this.boxes[name];
    if (!box) return;
    const ids = [shot.id];
    const next = this.shots.find((s) => s.fromId === shot.id && s.kind === 'hold');
    if (shot.kind === 'hold') ids.push(shot.fromId);
    else if (next) ids.push(next.id);
    this.edit((s) => {
      for (const id of ids) {
        const i = s.camera.findIndex((k) => k.id === id);
        const k = s.camera[i];
        s.camera[i] = { t: k.t, id: k.id, focus: { ...box }, ...(k.transition ? { transition: k.transition } : {}), ...(k.ease ? { ease: k.ease } : {}) };
      }
    });
  }

  setCurve(id, ease, opts) {
    this.edit((s) => {
      const k = s.camera.find((x) => x.id === id);
      delete k.ease;
      delete k.transition;
      if (ease === 'smooth') k.ease = 'smooth';
      else if (Array.isArray(ease)) k.transition = { type: 'easing', ease: ease.map(r3) };
    }, opts);
  }

  /* ── Verbs ── */

  /**
   * Lean in at t: the camera springs from where it is onto a box (or the
   * frame's centre) and settles there. Returns the new move.
   */
  leanInHere(t, boxNameToUse) {
    const from = this.view(t);
    const box = boxNameToUse ? this.boxes[boxNameToUse] : null;
    const land = box ? { focus: { ...box } } : { cx: r3(from[2] > 1.0005 ? from[0] : 0.5), cy: r3(from[2] > 1.0005 ? from[1] : 0.5), z: LEAN_Z };
    return this.insertMove(t, from, land);
  }

  /** Pull back at t: spring out to the wide view and hold. Returns the new move. */
  pullBackHere(t) {
    return this.insertMove(t, this.view(t), { wide: true });
  }

  insertMove(t, from, land) {
    const t0 = r3(Math.max(0, Math.min(t, this.length - 0.1)));
    const t1 = r3(Math.min(this.length, t0 + SPRING));
    const [cx, cy, z] = from;
    const start = z <= 1.0005 ? { t: t0, wide: true } : { t: t0, cx: r3(cx), cy: r3(cy), z: r3(z) };
    this.edit((s) => {
      /* The move replaces whatever the camera did in its span; what comes after starts from where it lands. */
      s.camera = s.camera.filter((k) => k.t < t0 - 0.02 || k.t > t1 + 0.02);
      s.camera.push(start, { t: t1, ...land });
    }, { tidy: true });
    return this.shots.find((sh) => Math.abs(sh.t0 - t0) < 0.01 && sh.kind !== 'hold') ?? null;
  }

  /** Remove a move: the camera stays where it was, so the move becomes part of the hold around it. */
  removeMove(shot) {
    if (shot.kind === 'hold') return;
    this.edit((s) => {
      const from = s.camera.find((k) => k.id === shot.fromId);
      const i = s.camera.findIndex((k) => k.id === shot.id);
      const k = s.camera[i];
      s.camera[i] = { ...from, t: k.t, id: k.id };
      delete s.camera[i].ease;
      delete s.camera[i].transition;
    }, { tidy: true });
  }

  /* ── Washes ── */

  addWash(t, name) {
    const rect = (name && this.boxes[name]) ?? Object.values(this.boxes)[0] ?? { x: 0.3, y: 0.3, w: 0.4, h: 0.3 };
    this.edit((s) => s.spots.push({ ...rect, in: r3(t), out: r3(Math.min(this.length, t + 2)), fade: 0.45 }));
    return this.spec.spots.length - 1;
  }

  setWash(i, patch, opts) {
    this.edit((s) => {
      Object.assign(s.spots[i], patch);
      for (const [k, v] of Object.entries(patch)) if (v === undefined) delete s.spots[i][k];
    }, opts);
  }

  washOnBox(i, name) {
    const box = this.boxes[name];
    if (box) this.setWash(i, { ...box });
  }

  removeWash(i) {
    this.edit((s) => s.spots.splice(i, 1));
  }

  /* ── Notes, each with a fix where one is clear ── */

  /**
   * What needs a look, each in a sentence and, where the fix is clear, with
   * the fix: `{level, text, t?, shot?, fix?: {label, apply}}`. A note with
   * no `shot` is about the clip as a whole.
   */
  notes() {
    const spec = normalizeSpec(clean(this.spec));
    const { errors, warnings } = checkSpec(spec);
    const shots = this.shots;
    const out = errors.map((text) => ({ level: 'error', text }));
    const leanedPast = new Set();
    for (const text of warnings) {
      const past = /^camera\[(\d+)\] leans in to ([\d.]+)/.exec(text);
      if (!past) {
        out.push({ level: 'warn', text: text.replace(/^./, (c) => c.toUpperCase()) });
        continue;
      }
      /* Every keyframe of a close hold is past, but it is the move onto it that leans too far. */
      let shot = shots.find((sh) => sh.id === this.spec.camera[Number(past[1])].id);
      if (shot?.kind === 'hold') shot = shots.find((sh) => sh.id === shot.fromId && sh.kind !== 'hold') ?? shot;
      if (!shot || leanedPast.has(shot.id)) continue;
      leanedPast.add(shot.id);
      const [cx, cy] = resolve(this.spec.camera[this.keyIndex(shot.id)]);
      out.push({
        level: 'warn',
        t: shot.t0,
        shot: shot.id,
        text: `Leans in to ${Number(past[2]).toFixed(2)}×, past ${LEAN_Z}×. Text softens and the product loses its context.`,
        fix: { label: `Ease it to ${LEAN_Z}×`, apply: () => this.frameShot(this.shotById(shot.id), [cx, cy, LEAN_Z]) },
      });
    }
    for (const n of directorsNotes(spec, this.take, { W: this.info.master.width, OW: this.info.output.width, fps: this.info.master.fps })) {
      if (n.level === 'ok') continue;
      const moving = /still moving/.test(n.text);
      const shot = shots.find((s) => n.t > s.t0 && n.t < s.t1 && s.kind !== 'hold');
      const beat = this.beats.find((b) => Math.abs(b.t - n.t) < 1e-6);
      if (moving && shot && beat) {
        const when = beatWords(beat.label);
        out.push({
          level: n.level,
          t: n.t,
          shot: shot.id,
          text: `Still moving when “${when}” happens. The camera should be still by then.`,
          fix: shot.kind === 'pull'
            ? { label: `Pull back after ${when}`, apply: () => this.startAfter(shot, beat.t) }
            : { label: `Settle before ${when}`, apply: () => this.settleBefore(shot, beat.t) },
        });
        continue;
      }
      const last = shots[shots.length - 1];
      if (/final hold/.test(n.text)) {
        out.push({
          level: n.level,
          t: n.t,
          shot: last.id,
          text: `The last hold is ${(last.t1 - last.t0).toFixed(2)}s. Give it ${ESTABLISH}s so the finished state lands.`,
          fix: { label: `Hold for ${ESTABLISH}s`, apply: () => this.setKeyTime(last.id, last.t0 + ESTABLISH) },
        });
        continue;
      }
      const soft = /^soft at ([\d.]+)s: the lean upscales the master ([\d.]+)x/.exec(n.text);
      out.push({
        level: n.level,
        t: n.t,
        shot: soft ? this.shotAt(n.t)?.id : shot?.id,
        text: soft ? `Soft at ${soft[1]}s. This lean enlarges the take ${soft[2]}×, so text blurs.` : n.text.replace(/^./, (c) => c.toUpperCase()),
        fix: soft ? this.softFix() : undefined,
      });
    }
    for (const shot of shots) {
      if (shot.kind === 'hold') continue;
      const onset = this.changeOnset(shot);
      if (onset === null) continue;
      const still = this.changeEnd(onset);
      out.push({
        level: 'warn',
        t: onset,
        shot: shot.id,
        text: 'The product changes during this move. The camera should hold still for that.',
        fix: shot.kind === 'pull'
          ? { label: 'Pull back once it is still', apply: () => this.startAfter(shot, still) }
          : { label: 'Settle before the change', apply: () => this.settleBefore(shot, onset) },
      });
    }
    return out;
  }

  /** The first moment inside a move where the picture changes enough to count, or null. */
  changeOnset(shot) {
    const { values, fps } = this.activity;
    for (let i = Math.ceil(this.masterTime(shot.t0) * fps); i < Math.floor(this.masterTime(shot.t1) * fps); i += 1) {
      if ((values[i] ?? 0) > CHANGING) return i / fps;
    }
    return null;
  }

  /** When the picture goes still again after a change that starts at `t` (clip time). */
  changeEnd(t) {
    const { values, fps } = this.activity;
    let i = Math.round(this.masterTime(t) * fps);
    while (i < values.length && (values[i] ?? 0) > CHANGING * 0.5) i += 1;
    return Math.min(this.length, t + (i - Math.round(this.masterTime(t) * fps)) / fps);
  }

  /** Move a move so it starts just after `t`: a pull back waits for the change to finish. */
  startAfter(shot, t) {
    this.shiftShot(shot, t + 0.1 - shot.t0);
  }

  /** Move a move so it has settled SETTLE before `t`, shortening it if its neighbours leave no room. */
  settleBefore(shot, t) {
    const want = t - SETTLE;
    const dt = want - shot.t1;
    this.shiftShot(shot, dt);
    const after = this.shotById(shot.id);
    if (after && after.t1 > want + 0.01) this.setKeyTime(shot.id, Math.max(after.t0 + 0.3, want));
  }

  /** Bring every lean back to the tightest one the master can fill with real pixels. */
  softFix() {
    const zMax = this.info.master.width / this.info.output.width;
    return {
      label: `Cap the lean at ${zMax.toFixed(2)}×`,
      apply: () => this.edit((s) => {
        for (const k of s.camera) {
          const [, , z] = resolve(k);
          if (z > zMax) {
            if (k.focus) k.z = r3(zMax);
            else if (!k.wide) k.z = r3(zMax);
          }
        }
      }),
    };
  }

  /* ── Saving and rendering ── */

  async save() {
    const res = await fetch(`/api/clip/${encodeURIComponent(this.name)}/camera`, { method: 'PUT', body: JSON.stringify(clean(this.spec)) });
    const r = await res.json();
    if (!res.ok) throw new Error((r.errors ?? [r.error]).join('; '));
    this.saved = JSON.stringify(clean(this.spec));
    this.info.hasCamera = true;
    this.emit();
    return r;
  }

  /**
   * Save if needed, then render on the server and follow it: `rendering`
   * goes 0..1 while it runs (every step emits), and back to null at the end.
   */
  async render() {
    if (this.rendering !== null) return null;
    this.rendering = 0;
    this.emit();
    try {
      if (this.dirty) await this.save();
      const url = `/api/clip/${encodeURIComponent(this.name)}/render`;
      const start = await fetch(url, { method: 'POST' });
      if (!start.ok && start.status !== 409) throw new Error((await start.json()).error);
      for (;;) {
        await new Promise((r) => setTimeout(r, 400));
        const job = await (await fetch(url)).json();
        if (job.state === 'failed') throw new Error(job.error);
        if (job.state !== 'rendering') {
          this.info.rendered = Date.now();
          return { ...job.result, url: this.renderUrl };
        }
        this.rendering = job.done / Math.max(1, job.total);
        this.emit();
      }
    } finally {
      this.rendering = null;
      this.emit();
    }
  }

  /** The rendered file, or null before the first render. */
  get renderUrl() {
    return this.info.rendered ? `/media/out/${encodeURIComponent(this.name)}.mp4?v=${Math.round(this.info.rendered)}` : null;
  }
}
