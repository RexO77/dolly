/* The Studio's model: clip stages, shot verbs, fixes and framing, without a browser. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Clip, SPRING, SETTLE, LEAN_Z, ESTABLISH, shotTitle } from '../studio/src/model/clip.js';
import { stageOf, summaryOf, clipLength, command } from '../studio/src/model/project.js';

const W = 2880;
function clip(camera, { beats = {}, boxes = {}, activity = [] } = {}) {
  const info = {
    spec: { camera, spots: [], source: {} },
    take: { beats, boxes },
    master: { width: W, height: 1800, fps: 30, duration: 10 },
    output: { width: 1920, height: 1200 },
    css: 2,
  };
  return new Clip('t', info, { fps: 30, values: activity.length ? activity : new Array(300).fill(0) });
}

const walk = () => clip([
  { t: 0, wide: true }, { t: 1, wide: true },
  { t: 2.2, cx: 0.36, cy: 0.36, z: 1.385 }, { t: 6, cx: 0.36, cy: 0.36, z: 1.385 },
  { t: 7.2, wide: true }, { t: 9, wide: true },
], { beats: { algorithms: 5.3, parked: 6.4 }, boxes: { trail: { x: 0.29, y: 0.08, w: 0.38, h: 0.05 } } });

test('shots read as holds and moves, with stable ids across edits', () => {
  const c = walk();
  assert.deepEqual(c.shots.map((s) => s.kind), ['hold', 'lean', 'hold', 'pull', 'hold']);
  const lean = c.shots[1];
  c.setKeyTime(lean.id, 2.4);
  assert.equal(c.shotById(lean.id).t1, 2.4, 'the same shot, found by its id after it moved');
});

test('undo and redo walk the edits, and a live drag is one step', () => {
  const c = walk();
  const lean = c.shots[1];
  for (const t of [2.3, 2.4, 2.5]) c.setKeyTime(lean.id, t, { live: true });
  c.settle();
  assert.equal(c.undoStack.length, 1);
  c.undo();
  assert.equal(c.shotById(lean.id).t1, 2.2);
  c.redo();
  assert.equal(c.shotById(lean.id).t1, 2.5);
});

test('framing a hold keeps it a hold, and the lean before it lands on the new frame', () => {
  const c = walk();
  const hold = c.shots[2];
  c.frameShot(hold, [0.5, 0.4, 1.3]);
  const [lean, held] = [c.shots[1], c.shots[2]];
  assert.equal(held.kind, 'hold');
  assert.deepEqual(c.view(held.t0 + 0.5).map((v) => +v.toFixed(3)), [0.5, 0.4, 1.3]);
  assert.equal(lean.kind, 'lean');
});

test('a lean on a measured box frames it at the grammar zoom', () => {
  const c = walk();
  c.frameOnBox(c.shots[1], 'trail');
  assert.equal(c.shots[1].target.name, 'trail');
  assert.ok(c.shots[1].z <= LEAN_Z + 1e-9);
});

test('lean in here adds a spring-long move that lands, and remove turns it back into a hold', () => {
  const c = clip([{ t: 0, wide: true }, { t: 9, wide: true }]);
  assert.equal(c.hasMoves, false);
  const lean = c.leanInHere(3);
  assert.equal(lean.kind, 'lean', 'the verb hands back the move it added');
  assert.equal(c.hasMoves, true);
  assert.equal(+(lean.t1 - lean.t0).toFixed(3), SPRING);
  c.removeMove(lean);
  assert.deepEqual(c.shots.map((s) => s.kind), ['hold'], 'no stray keyframes left in the hold');
});

test('a move running through a beat gets a fix that settles it first; a pull back waits instead', () => {
  const c = walk();
  const lean = c.shots[1];
  c.setKeyTime(lean.id, 2.2);
  c.edit((s) => {
    s.camera[1].t = 4.5;
    s.camera[2].t = 5.7;
  });
  const note = c.notes().find((n) => n.shot === c.shots[1].id && n.fix);
  assert.match(note.fix.label, /Settle before algorithms/);
  note.fix.apply();
  assert.ok(Math.abs(c.shots[1].t1 - (5.3 - SETTLE)) < 1e-6, 'the lean now settles before the beat');

  const pullNote = c.notes().find((n) => n.fix && /Pull back after parked/.test(n.fix.label));
  assert.ok(pullNote, 'the pull back through "parked" is offered a wait, not an earlier start');
  pullNote.fix.apply();
  assert.ok(c.shots.find((s) => s.kind === 'pull').t0 > 6.4);
});

test('a move through on-screen change is caught from the activity alone', () => {
  const activity = new Array(300).fill(0);
  for (let i = 120; i < 140; i += 1) activity[i] = 0.9;
  const c = clip([{ t: 0, wide: true }, { t: 3.8, wide: true }, { t: 5, cx: 0.5, cy: 0.5, z: 1.35 }, { t: 9, cx: 0.5, cy: 0.5, z: 1.35 }], { activity });
  const note = c.notes().find((n) => /changes during/.test(n.text));
  assert.ok(note);
  note.fix.apply();
  assert.equal(c.notes().filter((n) => /changes during/.test(n.text)).length, 0);
});

test('a clip with no camera yet is one wide shot, and the last hold runs to the end', () => {
  const bare = clip([{ t: 0, wide: true }]);
  assert.deepEqual(bare.shots.map((s) => [s.kind, s.t0, s.t1]), [['hold', 0, 10]]);
  assert.equal(bare.dirty, false, 'saying where the camera already is is not an edit');
  const c = walk();
  assert.equal(c.shots.length, 5, 'the last hold is stretched, not doubled');
  assert.equal(c.shots[4].t1, 10);
});

test('shots are titled in plain words', () => {
  const c = walk();
  assert.deepEqual(c.shots.map(shotTitle), ['Open wide', 'Lean in', 'Hold close', 'Pull back to wide', 'Hold wide']);
  c.frameOnBox(c.shots[1], 'trail');
  assert.equal(shotTitle(c.shots[1]), 'Lean in on trail');
  assert.equal(shotTitle(c.shots[2]), 'Hold on trail');
});

test('a lean past the grammar zoom is caught once, on the move, and eased back', () => {
  const c = walk();
  c.frameShot(c.shots[2], [0.4, 0.4, 1.7]);
  const past = c.notes().filter((n) => /past/.test(n.text));
  assert.equal(past.length, 1, 'one note for the lean, not one per keyframe of the hold');
  assert.equal(past[0].shot, c.shots[1].id);
  past[0].fix.apply();
  assert.equal(c.shots[2].z, LEAN_Z);
  assert.equal(c.notes().filter((n) => /past/.test(n.text)).length, 0);
});

test('a last hold that is too short is offered a longer one', () => {
  const c = walk();
  c.setKeyTime(c.shots[4].id, 7.5);
  const note = c.notes().find((n) => /last hold/.test(n.text));
  assert.ok(note);
  note.fix.apply();
  assert.ok(Math.abs(c.shots[4].t1 - c.shots[4].t0 - ESTABLISH) < 1e-6);
});

test('a cut and an end shorten the clip', () => {
  assert.equal(clipLength(10), 10);
  assert.equal(clipLength(10, { cut: { from: 2, to: 4, fade: 0 } }), 8);
  assert.equal(clipLength(10, { cut: { from: 2, to: 4 } }), 7.75);
  assert.equal(clipLength(10, { end: 6 }), 6);
});

const project = { name: 'question-library', alias: 'ql' };
const summary = (status, extra) => ({ name: 'rec-walk', status: { scenario: true, master: false, take: false, camera: false, rendered: false, stale: false, ...status }, ...extra });

test('each clip has one plain state and one next step', () => {
  const unrecorded = stageOf(project, summary({}));
  assert.equal(unrecorded.label, 'Not recorded yet');
  assert.deepEqual(unrecorded.next, { kind: 'command', label: 'Record it', command: 'dolly record ql rec-walk' });

  assert.equal(stageOf(project, summary({ scenario: false })).next, null, 'nothing to record without a scenario');

  const recorded = stageOf(project, summary({ master: true }));
  assert.equal(recorded.label, 'Recorded, not directed');
  assert.equal(recorded.next.kind, 'open');

  const directed = stageOf(project, summary({ master: true, camera: true }, { directedBy: 'studio' }));
  assert.equal(directed.label, 'Directed');
  assert.match(directed.detail, /^Directed here/);
  assert.equal(directed.next.kind, 'render');

  const stale = stageOf(project, summary({ master: true, camera: true, rendered: true, stale: true }));
  assert.equal(stale.next.label, 'Render again');

  const rendered = stageOf(project, summary({ master: true, camera: true, rendered: true }));
  assert.equal(rendered.label, 'Rendered');
  assert.equal(rendered.step, 3);
  assert.equal(rendered.next.command, command(project, 'deliver', 'rec-walk'));
});

test('what only the Studio knows comes first: a render running, unsaved edits, notes', () => {
  const done = summary({ master: true, camera: true, rendered: true });
  assert.equal(stageOf(project, done, { rendering: 0.4 }).label, 'Rendering 40%');
  assert.equal(stageOf(project, done, { dirty: true }).label, 'Unsaved changes');
  assert.equal(stageOf(project, done, { notes: 2 }).attention, 'Needs attention: 2 notes');
  assert.equal(stageOf(project, done).attention, null);
});

test('the project reads as one line', () => {
  const stages = [{ key: 'rendered' }, { key: 'directed' }, { key: 'unrecorded' }];
  assert.equal(summaryOf(stages), '3 clips, 1 ready to ship, 1 still to record');
  assert.equal(summaryOf([{ key: 'directed' }]), '1 clip');
});

test('across a cut the preview crossfades over the fade, the way the render does', () => {
  const c = walk();
  c.spec.source = { cut: { from: 4, to: 6, fade: 0.5 } };
  assert.deepEqual(c.sourceAt(3), { from: 3, to: null, mix: 0 }, 'before the fade, the master as it is');
  const mid = c.sourceAt(3.75);
  assert.equal(mid.from, 3.75);
  assert.equal(mid.to, 6.25);
  assert.equal(mid.mix, 0.5, 'halfway through the fade, half of each');
  assert.deepEqual(c.sourceAt(4), { from: 6.5, to: null, mix: 0 }, 'after it, only the far side');
  assert.equal(c.sourceAt(c.length).from, 10, 'the clip ends where the master does');
  assert.equal(c.masterTime(3.6), 3.6);
  assert.equal(c.masterTime(3.9), 6.4);
});
