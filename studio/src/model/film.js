/**
 * A launch film being directed: its shots, every edit to them (with undo
 * and redo), and the server's work on it: stills of any moment, rendered by
 * the film renderer itself, so what the Studio shows is what renders; the
 * judge's notes; Save; Render. The shots resolve here with the engine's own
 * module, so their cuts, scales and diagonals update as you edit.
 */
import { resolveShots } from '../../../engine/film/shots.mjs';
import { SCALES } from '../../../engine/film/grammar.mjs';

export { SCALES };

const r2 = (n) => Math.round(n * 100) / 100;
const copy = (film) => JSON.parse(JSON.stringify(film));
/** What is saved: the film without the Studio's own marks. */
const clean = ({ directed: _directed, ...film }) => film;

export class Film {
  static async load(name) {
    const res = await fetch(`/api/clip/${encodeURIComponent(name)}/film`);
    if (!res.ok) throw new Error((await res.json()).error ?? `could not open ${name}'s film`);
    const { film, take, rendered } = await res.json();
    return new Film(name, film, take, rendered);
  }

  constructor(name, film, take, rendered) {
    this.name = name;
    this.spec = clean(film);
    this.take = take;
    this.rendered = rendered;
    this.saved = JSON.stringify(this.spec);
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
    this.version = 0;
    this.notes = null;
    this.rendering = null;
    this.stillUrls = new Map();
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.version += 1;
    for (const fn of this.listeners) fn(this.version);
  }

  get dirty() {
    return JSON.stringify(this.spec) !== this.saved;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  /** The shots with everything the grammar fills in: cut, scale, diagonal, magnification. */
  get shots() {
    return resolveShots({ take: this.name, ...this.spec }, { [this.name]: this.take });
  }

  get length() {
    return this.shots.reduce((t, s) => t + s.length, 0);
  }

  /** The take's boxes by name, for a shot's subject. */
  get boxes() {
    return Object.keys(this.take.boxes ?? {});
  }

  /** The take's beats, sorted, for when a shot cuts in. */
  get beats() {
    return Object.entries(this.take.beats ?? {}).map(([label, t]) => ({ label, t })).sort((a, b) => a.t - b.t);
  }

  /** Change the film; one undo step per edit. The judge's notes no longer hold. */
  edit(mutate) {
    this.undoStack.push(copy(this.spec));
    this.redoStack = [];
    mutate(this.spec);
    this.notes = null;
    this.emit();
  }

  undo() {
    if (!this.canUndo) return;
    this.redoStack.push(copy(this.spec));
    this.spec = this.undoStack.pop();
    this.notes = null;
    this.emit();
  }

  redo() {
    if (!this.canRedo) return;
    this.undoStack.push(copy(this.spec));
    this.spec = this.redoStack.pop();
    this.notes = null;
    this.emit();
  }

  /** Set fields of shot `i`. `undefined` removes one, so the grammar decides it again. */
  setShot(i, patch) {
    this.edit((f) => {
      const s = f.shots[i];
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete s[k];
        else s[k] = typeof v === 'number' ? r2(v) : v;
      }
    });
  }

  /** Cut shot `i` in on a beat, a moment before it so the action starts just after the cut. */
  cutOn(i, label, lead = 0.6) {
    this.setShot(i, { at: Math.max(0, (this.take.beats[label] ?? 0) - lead) });
  }

  /** Flip the way shot `i`'s text runs across the frame. */
  flipDiagonal(i) {
    const shot = this.shots[i];
    this.setShot(i, { diagonal: shot.diagonal ? -shot.diagonal : 1 });
  }

  move(i, by) {
    const j = i + by;
    if (j < 0 || j >= this.spec.shots.length) return;
    this.edit((f) => {
      [f.shots[i], f.shots[j]] = [f.shots[j], f.shots[i]];
    });
  }

  /** A new shot after shot `i`, on the same subject, cutting in where that one ends. */
  addAfter(i) {
    this.edit((f) => {
      const s = f.shots[i];
      f.shots.splice(i + 1, 0, { at: r2(Math.min(this.take.master.duration - 2.5, s.at + s.length)), length: 3.2, subject: s.subject });
    });
  }

  remove(i) {
    if (this.spec.shots.length <= 1) return;
    this.edit((f) => {
      f.shots.splice(i, 1);
    });
  }

  setEnding(patch) {
    this.edit((f) => {
      f.ending = { ...(f.ending ?? {}), ...patch };
    });
  }

  /** A still of shot `i` at shot time `t`: the film renderer's own frame, of the film as it is now. Resolves to an image URL. */
  async still(i, t, width = 960) {
    const body = JSON.stringify({ film: { take: this.name, ...this.spec }, shot: i, t, width });
    if (this.stillUrls.has(body)) return this.stillUrls.get(body);
    const res = await fetch(`/api/clip/${encodeURIComponent(this.name)}/film/still`, { method: 'POST', body });
    if (!res.ok) throw new Error((await res.json()).error ?? 'the still could not be rendered');
    const url = URL.createObjectURL(await res.blob());
    this.stillUrls.set(body, url);
    return url;
  }

  /** The judge's notes on the film as it is now. */
  async judge() {
    const res = await fetch(`/api/clip/${encodeURIComponent(this.name)}/film/judge`, { method: 'POST', body: JSON.stringify({ film: { take: this.name, ...this.spec } }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'the judge could not read the film');
    this.notes = data.notes;
    this.emit();
    return this.notes;
  }

  async save() {
    const res = await fetch(`/api/clip/${encodeURIComponent(this.name)}/film`, { method: 'PUT', body: JSON.stringify(this.spec) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'not saved');
    this.saved = JSON.stringify(this.spec);
    this.emit();
    return data;
  }

  /** Save, then render the film, reporting progress 0..1. Resolves with the result and the judge's notes. */
  async render(onProgress) {
    if (this.dirty) await this.save();
    const url = `/api/clip/${encodeURIComponent(this.name)}/film/render`;
    const start = await fetch(url, { method: 'POST' });
    if (!start.ok && start.status !== 409) throw new Error((await start.json()).error);
    this.rendering = 0;
    this.emit();
    try {
      for (;;) {
        await new Promise((r) => setTimeout(r, 700));
        const job = await (await fetch(url)).json();
        this.rendering = job.total ? job.done / job.total : 0;
        onProgress?.(this.rendering);
        this.emit();
        if (job.state === 'done') {
          this.rendered = Date.now();
          this.notes = job.result.notes;
          return job.result;
        }
        if (job.state === 'failed') throw new Error(job.error);
      }
    } finally {
      this.rendering = null;
      this.emit();
    }
  }

  get renderUrl() {
    return this.rendered ? `/media/film/${encodeURIComponent(this.name)}.mp4?v=${this.rendered}` : null;
  }
}
