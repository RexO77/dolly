/**
 * The project as the home screen sees it: every clip, where it stands in
 * the three steps (film it, direct it, render it), and the one thing to do
 * next. Pure, apart from the fetch.
 */

/** The three steps, in the words the Studio uses for them. */
export const STEPS = [
  { key: 'film', label: 'Film', text: 'Dolly opens your product in Chrome and plays its scenario. No cursor, no second takes by hand. This part runs in the terminal.' },
  { key: 'direct', label: 'Direct', text: 'Here. Watch the take, then tell the camera where to lean in, where to hold and when to pull back.' },
  { key: 'render', label: 'Render', text: 'One button. You get an MP4 and a poster in out/, the same frames the preview showed.' },
];

export async function loadProject() {
  const res = await fetch('/api/project');
  const project = await res.json();
  if (!res.ok) throw new Error(project.error);
  return project;
}

/** A clip's length on its own clock: the master, less any cut, up to any end. */
export function clipLength(duration, { cut, end } = {}) {
  let d = duration;
  if (cut) d -= cut.to - cut.from + (cut.fade ?? 0.25);
  return Math.min(d, end ?? Infinity);
}

/** The exact command for a step that happens in the terminal. */
export function command(project, verb, clip) {
  return `dolly ${verb} ${project.alias ?? project.name} ${clip}`;
}

/**
 * Where a clip stands, in plain words, and its next step. `live` is what
 * the Studio knows beyond the files on disk: the notes on the loaded clip,
 * unsaved edits, a render in progress (0..1).
 *
 * `step` is how far along the three steps it is: 0 not filmed, 1 filmed,
 * 2 directed, 3 rendered. `next.kind` says where the step happens:
 * `command` in the terminal, `open` in the editor, `render` right here.
 */
export function stageOf(project, clip, { notes = 0, dirty = false, rendering = null } = {}) {
  const s = clip.status;
  const attention = notes > 0 ? `Needs attention: ${notes} ${notes === 1 ? 'note' : 'notes'}` : null;
  if (!s.master) {
    return {
      key: 'unrecorded',
      step: 0,
      label: 'Not recorded yet',
      detail: s.scenario ? 'Record it from the terminal. It shows up here with its first frame.' : 'It has no scenario yet, so there is nothing to record.',
      next: s.scenario ? { kind: 'command', label: 'Record it', command: command(project, 'record', clip.name) } : null,
      attention: null,
    };
  }
  if (rendering !== null) {
    return { key: 'rendering', step: 2, label: `Rendering ${Math.round(rendering * 100)}%`, detail: 'Making the clip. It takes about as long as the clip runs.', next: null, attention };
  }
  if (dirty) {
    return { key: 'dirty', step: 1, label: 'Unsaved changes', detail: 'Changed in the Studio and not saved yet.', next: { kind: 'open', label: 'Keep directing' }, attention };
  }
  if (!s.camera) {
    return {
      key: 'recorded',
      step: 1,
      label: 'Recorded, not directed',
      detail: 'The camera holds wide for the whole take until you give it shots.',
      next: { kind: 'open', label: 'Direct it' },
      attention,
    };
  }
  if (!s.rendered || s.stale) {
    return {
      key: 'directed',
      step: 2,
      label: s.stale ? 'Directed, render out of date' : 'Directed',
      detail: s.stale ? 'It changed after the last render.' : `${clip.directedBy === 'studio' ? 'Directed here' : 'Directed by its scenario'}. One click makes the clip.`,
      next: { kind: 'render', label: s.stale ? 'Render again' : 'Render it' },
      attention,
    };
  }
  return {
    key: 'rendered',
    step: 3,
    label: 'Rendered',
    detail: 'Ready to ship. Deliver copies the clip and its poster to your site.',
    next: { kind: 'command', label: 'Deliver it', command: command(project, 'deliver', clip.name) },
    attention,
  };
}

/** A line for the whole project: how many clips, and how many are done. */
export function summaryOf(stages) {
  const n = stages.length;
  const done = stages.filter((s) => s.key === 'rendered').length;
  const todo = stages.filter((s) => s.key === 'unrecorded').length;
  const parts = [`${n} ${n === 1 ? 'clip' : 'clips'}`];
  if (done) parts.push(`${done} ready to ship`);
  if (todo) parts.push(`${todo} still to record`);
  return parts.join(', ');
}
