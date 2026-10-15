/* Launch mode: the camera on a tilted plane, the shots the grammar fills in, the director, the crop, a frame, and the judge. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameraAt, projection, invert, apply } from '../engine/film/camera.mjs';
import { resolveShots, scaleFor, shotAt } from '../engine/film/shots.mjs';
import { directFilm } from '../engine/film/direct.mjs';
import { visibleCrop } from '../engine/film/render.mjs';
import { pyramid, renderFilmFrame } from '../engine/film/frame.mjs';
import { measure, judgeFilm } from '../engine/film/judge.mjs';

const take = {
  viewport: { width: 1440, height: 900, dpr: 4 },
  master: { width: 5760, height: 3600, fps: 60, duration: 14 },
  beats: { filter: 2.4, open: 5.6, done: 10.4 },
  boxes: { chip: { x: 0.365, y: 0.189, w: 0.069, h: 0.036 }, list: { x: 0.19, y: 0.17, w: 0.37, h: 0.26 } },
};
const takes = { t: take };
const still = (over = {}) => ({ length: 3, mag: [3, 3], pitch: [0, 0], yaw: [0, 0], roll: [0, 0], fx: [400, 400], fy: [300, 300], tx: [0, 0], ty: [0, 0], perspective: 1300, ...over });

test('the focal point lands at the centre, magnified, and a tilt sends the top of the plane away', () => {
  const flat = projection(cameraAt(still(), 0), 1920, 1080);
  assert.deepEqual(apply(flat.H, 400, 300).map((v) => +v.toFixed(6)), [960, 540]);
  assert.ok(Math.abs(apply(flat.H, 410, 300)[0] - 990) < 1e-6, 'ten plane pixels are thirty output pixels at 3x');
  const tilted = projection(cameraAt(still({ pitch: [38, 38], roll: [14, 14] }), 0), 1920, 1080);
  const inv = invert(tilted.H);
  const z = ([u, v]) => tilted.depth[0] * u + tilted.depth[1] * v + tilted.depth[2];
  assert.ok(z(apply(inv, 960, 0)) < 0 && z(apply(inv, 960, 1080)) > 0, 'the top recedes, the bottom comes near');
  assert.deepEqual(apply(inv, ...apply(tilted.H, 123, 456)).map((v) => +v.toFixed(6)), [123, 456]);
});

test('the drift arrives and keeps moving: never a stop before the cut', () => {
  const shot = still({ tx: [0, 100], ease: 'arrive' });
  const at = (t) => cameraAt(shot, t).tx;
  assert.equal(at(0), 0);
  assert.ok(Math.abs(at(3) - 100) < 1e-9);
  assert.ok(at(2.9) < at(3) && at(3) - at(2.9) > 1, 'still moving at the end');
});

test('a small subject is an extreme close-up, the diagonal flips each cut, and the wide shot is frontal', () => {
  assert.equal(scaleFor({ w: 99 }).name, 'extreme');
  assert.equal(scaleFor({ w: 530 }).name, 'medium');
  const shots = resolveShots({ take: 't', shots: [
    { at: 1.7, length: 2.4, subject: 'chip' },
    { at: 3.4, length: 3, subject: 'list' },
    { at: 9.9, length: 3.6, subject: { x: 0, y: 0, w: 1, h: 1 }, scale: 'wide' },
  ] }, takes);
  assert.deepEqual(shots.map((s) => s.scale), ['extreme', 'medium', 'wide']);
  assert.equal(Math.sign(shots[0].roll[0]), -Math.sign(shots[1].roll[0]));
  assert.equal(shots[2].roll[0], 0);
  assert.deepEqual(shots.map((s) => s.cut), [0, 2.4, 5.4]);
  const { look } = shotAt(shots[0], 1.2, 1920, 1080);
  assert.ok(look.blur.k > 0 && look.light.along > look.light.across, 'the pool runs along the subject');
});

test('the director cuts in a moment before each beat, and names a missing beat', () => {
  const clip = { name: 't', film: { shots: [{ on: 'filter', subject: 'chip' }, { on: 'done', wide: true }], ending: { copy: 'X.' } } };
  const { film } = directFilm(clip, take);
  assert.equal(film.shots[0].at, 1.8);
  assert.equal(film.shots[1].scale, 'wide');
  assert.equal(film.ending.copy, 'X.');
  assert.throws(() => directFilm({ name: 't', film: { shots: [{ on: 'nope', subject: 'chip' }] } }, take), /beat "nope"/);
});

test('a close-up only needs a crop of the master; looking past the horizon needs all of it', () => {
  const [close] = resolveShots({ take: 't', shots: [{ at: 1.7, length: 2.4, subject: 'chip' }] }, takes);
  const crop = visibleCrop([shotAt(close, 1, 1920, 1080)], take, 1920, 1080);
  assert.ok(crop.w * crop.h < 5760 * 3600 * 0.5, 'a fraction of the frame');
  const steep = { ...close, pitch: [80, 80], mag: [0.5, 0.5] };
  assert.deepEqual(visibleCrop([shotAt(steep, 1, 1920, 1080)], take, 1920, 1080), { x: 0, y: 0, w: 5760, h: 3600 });
});

test('a frame is black off the plane and the picture on it, through a crop', () => {
  const W = 64;
  const H = 40;
  const src = new Uint8Array(W * H * 3).fill(200);
  const cam = cameraAt(still({ mag: [1, 1], fx: [16, 16], fy: [10, 10] }), 0);
  const look = { focus: [16, 10], blur: { k: 0, max: 1 }, light: { x: 16, y: 10, along: 1e6, across: 1e6, angle: 0, coreRatio: 0.0001, keyX: 0, keyY: 0 }, slab: { radius: 0 }, exposure: 1, vignette: 0 };
  const img = renderFilmFrame(pyramid(src, W, H), { dpr: 2, w: 32, h: 20 }, cam, look, 192, 108);
  const at = (x, y) => img[(y * 192 + x) * 3];
  assert.ok(Math.abs(at(96, 54) - 200) < 1, 'the plane at the centre');
  assert.equal(at(2, 2), 0, 'the void around it');
});

test('the judge reads a dark, focused frame as a film still, and catches a bright one and a strobing cut', () => {
  const W = 200;
  const H = 120;
  const dark = new Uint8Array(W * H * 3);
  for (let x = 80; x < 120; x += 2) for (let y = 55; y < 65; y += 1) dark.fill(230, (y * W + x) * 3, (y * W + x) * 3 + 3);
  const m = measure(dark, W, H);
  assert.ok(m.luminance < 0.05 && m.black > 0.9 && m.sharpShare > 0);
  const shots = resolveShots({ take: 't', shots: [
    { at: 1.7, length: 2.4, subject: 'chip' },
    { at: 4.6, length: 2.4, subject: 'chip' },
    { at: 9.9, length: 3.6, subject: { x: 0, y: 0, w: 1, h: 1 }, scale: 'wide' },
  ] }, takes);
  const frames = shots.map(() => ({ frame: dark, width: W, height: H }));
  const notes = judgeFilm(shots, frames, takes).map((n) => n.text).join('\n');
  assert.match(notes, /two short accents in a row/);
  const bright = new Uint8Array(W * H * 3).fill(200);
  assert.match(judgeFilm(shots.slice(0, 1), [{ frame: bright, width: W, height: H }], takes).map((n) => n.text).join('\n'), /too bright/);
});
