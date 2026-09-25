import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterCut } from '../engine/direct.mjs';

const cut = { from: 4, to: 7, fade: 0.25 };

test('a cut keeps the beats before it and moves the later ones up by the cut and its fade', () => {
  assert.equal(afterCut(2, cut), 2);
  assert.equal(afterCut(4, cut), 4);
  assert.equal(afterCut(9, cut), 9 - 3 - 0.25);
});

test('a beat inside a cut, at its end or inside its crossfade lands where the join finishes', () => {
  assert.equal(afterCut(5, cut), 4);
  assert.equal(afterCut(7, cut), 4);
  assert.equal(afterCut(7.1, cut), 4);
  assert.equal(afterCut(7.25, cut), 4);
});

test('beats keep their order through a cut', () => {
  let last = -Infinity;
  for (let t = 0; t <= 10; t += 0.05) {
    const moved = afterCut(t, cut);
    assert.ok(moved >= last, `${t.toFixed(2)}s lands at ${moved}, before ${last}`);
    last = moved;
  }
});
