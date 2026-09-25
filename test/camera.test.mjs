import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spring, smootherstep, resolve, cameraAt, viewBox, spotAlpha, checkSpec, normalizeSpec } from '../engine/camera/math.mjs';
import { LEAN_Z, shots } from '../engine/camera/grammar.mjs';
import { segments } from '../engine/storyboard.mjs';

test('the spring and smootherstep start at 0, land exactly at 1, and never overshoot', () => {
  for (const f of [spring, smootherstep]) {
    assert.equal(f(0), 0);
    assert.equal(f(1), 1);
    let last = 0;
    for (let u = 0; u <= 1; u += 0.01) {
      assert.ok(f(u) >= last - 1e-12 && f(u) <= 1 + 1e-12);
      last = f(u);
    }
  }
});

test('a focus leans in at LEAN_Z, but backs off so a large rect stays whole', () => {
  assert.deepEqual(resolve({ wide: true }), [0.5, 0.5, 1]);
  assert.equal(resolve({ focus: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } })[2], LEAN_Z);
  const z = resolve({ focus: { x: 0, y: 0, w: 0.9, h: 0.5 } })[2];
  assert.ok(z < LEAN_Z && z >= 1);
});

test('equal neighbours hold, and the view never leaves the frame', () => {
  const keys = [{ t: 0, cx: 0.9, cy: 0.9, z: 2 }, { t: 1, cx: 0.9, cy: 0.9, z: 2 }];
  assert.deepEqual(cameraAt(keys, 0.5), [0.9, 0.9, 2]);
  const v = viewBox(2880, 1800, 1920, 1200, cameraAt(keys, 0.5));
  assert.ok(v.x0 >= 0 && v.y0 >= 0 && v.x0 + v.vw <= 2880 + 1e-9 && v.y0 + v.vh <= 1800 + 1e-9);
});

test('a wash fades in, holds, and fades out quicker than it came', () => {
  const s = { x: 0, y: 0, w: 1, h: 1, in: 1, out: 3, fade: 0.5 };
  assert.equal(spotAlpha(s, 0.9), 0);
  assert.equal(spotAlpha(s, 2), 1);
  assert.equal(spotAlpha(s, 3 + 0.35 + 1e-9), 0);
});

test('checkSpec rejects what would render wrong and warns on what breaks the grammar', () => {
  const bad = checkSpec(normalizeSpec({ camera: [{ t: 0, wide: true }, { t: 1, cx: 0.5, cy: 0.5, z: 0.5 }] }));
  assert.ok(bad.errors.some((e) => /zooms out/.test(e)));
  const tight = checkSpec(normalizeSpec({ camera: [{ t: 0, wide: true }, { t: 1, cx: 0.5, cy: 0.5, z: 2 }] }));
  assert.ok(tight.warnings.length);
});

test('shots follow the grammar: establish, lean, hold through the change, pull back, hold', () => {
  const boxes = { panel: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 } };
  const beats = { open: 3, done: 5 };
  const { spec } = shots([{ box: 'panel', from: 'open', to: 'done', hold: 1 }], { at: (b) => beats[b], boxes, length: 9 });
  const kinds = segments(spec.camera).map((s) => s.kind);
  assert.deepEqual(kinds, ['hold', 'lean', 'hold', 'pull', 'hold']);
  const lean = segments(spec.camera).find((s) => s.kind === 'lean');
  assert.ok(lean.t1 <= beats.open, 'the lean settles before the change starts');
});

test('the spring as a curve stays within 1.1% of the grammar spring and never overshoots; springs land on the move\'s end', async () => {
  const { cubicBezier, bouncySpring, progress } = await import('../engine/camera/math.mjs');
  const { SPRING_CURVE } = await import('../engine/camera/grammar.mjs');
  let worst = 0;
  for (let i = 0; i <= 200; i += 1) {
    const u = i / 200;
    worst = Math.max(worst, Math.abs(cubicBezier(u, SPRING_CURVE) - spring(u)));
    assert.ok(cubicBezier(u, SPRING_CURVE) <= 1);
  }
  assert.ok(worst < 0.011, `the spring curve is ${(worst * 100).toFixed(2)}% off`);
  assert.equal(bouncySpring(1, { bounce: 0.3 }, 1.2), 1);
  assert.equal(progress({ transition: { type: 'easing', ease: [0, 0, 1, 1] } }, 0.25, 1).toFixed(3), '0.250');
  assert.equal(progress({}, 0.4, 1), spring(0.4), 'a keyframe without a transition keeps the grammar spring');
});
