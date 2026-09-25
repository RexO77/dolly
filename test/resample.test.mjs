/* The resampler must match Pillow byte for byte: that is what keeps every render identical to the Python renderer Dolly replaced. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resample } from '../engine/camera/resample.mjs';

const fx = JSON.parse(readFileSync(new URL('./fixtures/lanczos.json', import.meta.url), 'utf8'));
const src = new Uint8Array(Buffer.from(fx.src, 'base64'));

for (const c of fx.cases) {
  test(`Lanczos ${fx.W}x${fx.H} box [${c.box.join(', ')}] to ${c.OW}x${c.OH} matches Pillow ${fx.pillow}`, () => {
    const want = Buffer.from(c.out, 'base64');
    const got = Buffer.from(resample(src, fx.W, fx.H, c.OW, c.OH, c.box));
    assert.equal(got.length, want.length);
    assert.ok(got.equals(want), `first difference at byte ${got.findIndex((v, i) => v !== want[i])}`);
  });
}
