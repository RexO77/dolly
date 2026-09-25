/* The Studio's clip model: shot verbs, fixes and framing, without a browser. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Clip, SPRING, SETTLE, LEAN_Z } from '../studio/src/model/clip.js';

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
  c.leanInHere(3);
  const lean = c.shots.find((s) => s.kind === 'lean');
  assert.ok(lean);
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
  const note = c.notes().find((n) => /changing/.test(n.text));
  assert.ok(note);
  note.fix.apply();
  assert.equal(c.notes().filter((n) => /changing/.test(n.text)).length, 0);
});
