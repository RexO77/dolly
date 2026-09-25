import { test } from 'node:test';
import assert from 'node:assert/strict';
import { helpers, fraction } from '../engine/input.mjs';
import { ease, seeded } from '../engine/motion.mjs';

/** A page that takes input and draws nothing: enough for the hand. */
function fakePage() {
  const events = [];
  return {
    events,
    mouse: {
      move: async (x, y) => events.push(['move', Math.round(x), Math.round(y)]),
      down: async () => events.push(['down']),
      up: async () => events.push(['up']),
    },
    keyboard: { type: async (ch) => events.push(['type', ch]) },
  };
}

function recording() {
  const page = fakePage();
  const h = helpers(page, { width: 1440, height: 900 });
  h.clock.zero = performance.now();
  return { page, h };
}

test('hand.clickAt marks a beat at the press when it is given one, and returns its time', async () => {
  const { page, h } = recording();
  const hand = h.hand({ seed: 3 });
  const at = await hand.clickAt({ x: 400, y: 300 }, { glide: 20, dwell: 10, beat: 'open' });
  assert.equal(h.take.beats.open, at);
  const down = page.events.findIndex(([kind]) => kind === 'down');
  assert.ok(down > 0 && page.events[down + 1][0] === 'up', 'the press comes after the glide');
});

test('hand.clickAt without a beat marks none', async () => {
  const { h } = recording();
  const at = await h.hand().clickAt({ x: 10, y: 10 }, { glide: 5, dwell: 5 });
  assert.equal(typeof at, 'number');
  assert.deepEqual(h.take.beats, {});
});

test('h.click and h.clickButton take a beat too', async () => {
  const { h } = recording();
  await h.click({ x: 100, y: 100, w: 40, h: 20 }, { glide: 5, dwell: 5, beat: 'press' });
  assert.ok('press' in h.take.beats);
});

test('a repeated beat gets a number', () => {
  const { h } = recording();
  h.beat('step');
  h.beat('step');
  assert.deepEqual(Object.keys(h.take.beats), ['step', 'step#2']);
});

test('a seeded hand repeats its performance', () => {
  const aim = (seed) => recording().h.hand({ seed }).aim({ x: 100, y: 100, w: 200, h: 40 });
  assert.deepEqual(aim(9), aim(9));
  assert.notDeepEqual(aim(9), aim(10));
  assert.equal(seeded(4).next(), seeded(4).next());
});

test('every hand curve runs from 0 to 1', () => {
  for (const curve of [ease.even, ease.cubic, ease.reach(), ease.settle(), ease.land, ease.bezier(0.2, 0, 0.2, 1)]) {
    assert.ok(Math.abs(curve(0)) < 1e-6);
    assert.ok(Math.abs(curve(1) - 1) < 1e-6);
  }
});

test('a box becomes fractions of the viewport, padded', () => {
  assert.deepEqual(fraction({ x: 144, y: 90, w: 288, h: 180 }, { width: 1440, height: 900 }, 0), { x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
  assert.deepEqual(fraction({ x: 150, y: 96, w: 276, h: 168 }, { width: 1440, height: 900 }, 6), { x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
});
