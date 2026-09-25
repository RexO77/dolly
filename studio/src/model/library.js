/**
 * Every clip the Studio has opened, kept open: leave a clip for the home
 * screen and its edits, its undo history and a render in progress are all
 * still there when you come back.
 */
import { Clip } from './clip.js';
import { loadProject, stageOf } from './project.js';

export class Library {
  constructor() {
    this.project = null;
    this.loading = new Map();
    this.ready = new Map();
    this.listeners = new Set();
    this.version = 0;
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.version += 1;
    for (const fn of this.listeners) fn(this.version);
  }

  /** Read the project again: what is recorded, directed and rendered on disk. */
  async refresh() {
    this.project = await loadProject();
    this.emit();
    return this.project;
  }

  summary(name) {
    return this.project?.clips.find((c) => c.name === name) ?? null;
  }

  /** The clip, loaded once (its take, its activity) and kept. */
  open(name) {
    if (!this.loading.has(name)) {
      const loaded = Clip.load(name).then((clip) => {
        this.ready.set(name, clip);
        clip.on(() => this.emit());
        this.emit();
        return clip;
      });
      loaded.catch(() => this.loading.delete(name));
      this.loading.set(name, loaded);
    }
    return this.loading.get(name);
  }

  /** The clip if it has finished loading, else null. */
  loaded(name) {
    return this.ready.get(name) ?? null;
  }

  /** Where a clip stands, counting what only the Studio knows: its notes, unsaved edits, a render running. */
  stage(name) {
    const clip = this.loaded(name);
    const live = clip ? { notes: clip.notes().length, dirty: clip.dirty, rendering: clip.rendering } : {};
    return stageOf(this.project, this.summary(name), live);
  }

  /** Whether any open clip has edits that are not saved. */
  get dirty() {
    return [...this.ready.values()].some((c) => c.dirty);
  }

  /** Render a clip, then read the project again so its state and poster catch up. */
  async render(name) {
    const clip = await this.open(name);
    const result = await clip.render();
    await this.refresh();
    return result;
  }
}
