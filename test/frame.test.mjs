/* The frame: the clip as a card on a background, placed by card.mjs and drawn by compose.mjs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFrame, cardAt, cardSource, pushAt } from '../engine/camera/card.mjs';
import { compose, backdrop } from '../engine/camera/compose.mjs';
import { renderFrame } from '../engine/camera/frame.mjs';
import { checkSpec, normalizeSpec } from '../engine/camera/math.mjs';
import { CARD_INSET, LEAN_Z } from '../engine/camera/grammar.mjs';

const keys = [{ t: 0, wide: true }, { t: 1, wide: true }, { t: 2.2, cx: 0.4, cy: 0.4, z: LEAN_Z }, { t: 4, cx: 0.4, cy: 0.4, z: LEAN_Z }];

test('a spec without a frame has no card, and one with an empty frame gets the defaults', () => {
  assert.equal(resolveFrame(undefined), null);
  const f = resolveFrame({});
  assert.equal(f.inset, CARD_INSET);
  assert.equal(f.push, true);
  assert.equal(f.window, false);
  assert.ok(Array.isArray(f.background.from));
});

test('the card sits back while wide, grows on the camera curve as it leans, and fills the clip at the lean', () => {
  const f = resolveFrame({});
  const wide = cardAt(f, keys, 0, 1920, 1200);
  assert.equal(Math.round(wide.w), Math.round(1920 * CARD_INSET));
  assert.ok(wide.radius > 0 && wide.shadow.alpha > 0);
  const mid = cardAt(f, keys, 1.6, 1920, 1200);
  assert.ok(mid.w > wide.w && mid.w < 1920);
  const full = cardAt(f, keys, 3, 1920, 1200);
  assert.deepEqual([full.x, full.y, full.w, full.h, full.radius, full.shadow.alpha], [0, 0, 1920, 1200, 0, 0]);
  assert.equal(pushAt(resolveFrame({ push: false }), keys, 3), 0, 'push off keeps the card still');
});

test('the source for a card maps its whole-pixel rect back onto the camera view', () => {
  const card = cardAt(resolveFrame({}), keys, 0, 1920, 1200);
  const view = { x0: 0, y0: 0, vw: 2880, vh: 1800 };
  const s = cardSource(card, view);
  assert.ok(s.X <= card.x && s.X + s.IW >= card.x + card.w);
  /* The card's own edges land on the view's edges. */
  const sx = (s.box[2] - s.box[0]) / s.IW;
  assert.ok(Math.abs(s.box[0] + (card.x - s.X) * sx - view.x0) < 1e-6);
});

test('with the card filling the clip, a framed frame is the plain frame, pixel for pixel', () => {
  const W = 64;
  const H = 40;
  const src = new Uint8Array(W * H * 3).map((_, i) => (i * 37) % 251);
  const view = { x0: 0, y0: 0, vw: W, vh: H };
  const plain = renderFrame(src, W, H, 32, 20, view);
  const card = cardAt(resolveFrame({}), keys, 3, 32, 20);
  const framed = renderFrame(src, W, H, 32, 20, view, [], 2, { card, source: cardSource(card, view), background: resolveFrame({}).background });
  assert.deepEqual([...framed], [...plain]);
});

test('on the background, the corners are the backdrop and the centre is the picture', () => {
  const W = 200;
  const H = 125;
  const look = resolveFrame({ background: 'paper' });
  const card = cardAt(look, keys, 0, W, H);
  const img = new Uint8Array(Math.ceil(card.w + 1) * Math.ceil(card.h + 1) * 3).fill(10);
  const s = cardSource(card, { x0: 0, y0: 0, vw: W, vh: H });
  const out = compose(img, s.IW, s.IH, s.X, s.Y, card, look.background, W, H);
  const at = (x, y) => [...out.slice((y * W + x) * 3, (y * W + x) * 3 + 3)];
  assert.deepEqual(at(0, 0), [...backdrop(look.background, W, H).slice(0, 3)]);
  assert.deepEqual(at(100, 62), [10, 10, 10]);
});

test('checkSpec catches a bad frame', () => {
  const spec = (frame) => normalizeSpec({ camera: keys, frame });
  assert.equal(checkSpec(spec({ background: 'dusk' })).errors.length, 0);
  assert.match(checkSpec(spec({ background: 'neon' })).errors[0], /frame.background/);
  assert.match(checkSpec(spec({ inset: 0.2 })).errors[0], /frame.inset/);
});
