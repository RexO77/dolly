/**
 * A launch film's sound: quiet, tactile foley over near-silence, and no
 * music. Every press the hand made gets a soft click, every keystroke a
 * tick, cut exactly as the picture is cut; under it, a faint room tone; the
 * copy and the logo play over silence. Pure: events in, samples out.
 */
import { seeded } from '../motion.mjs';

export const RATE = 48000;

/* ─────────────────────────────────────────────────────────
 * THE SOUNDS
 *
 *   press   a soft click: a short band of noise at 2.4 kHz over a low thump
 *   key     a tick: a shorter, brighter band of noise, a touch uneven
 *   room    the room: noise far below everything, so silence is not dead
 * ───────────────────────────────────────────────────────── */
const PRESS = { freq: 2400, q: 3, gain: 0.26, decay: 0.016, thump: { freq: 130, gain: 0.18, decay: 0.035 } };
const KEY = { freq: 4200, q: 4, gain: 0.11, decay: 0.008 };
const ROOM = 0.0016;

/** A band-pass biquad (RBJ), run over `x` in place. */
function bandpass(x, freq, q) {
  const w = (2 * Math.PI * freq) / RATE;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const [b0, b2, a1, a2] = [alpha / a0, -alpha / a0, (-2 * Math.cos(w)) / a0, (1 - alpha) / a0];
  let [x1, x2, y1, y2] = [0, 0, 0, 0];
  for (let i = 0; i < x.length; i += 1) {
    const y = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = y;
    x[i] = y;
  }
  return x;
}

/** A burst of filtered noise with an exponential decay, added into `out` at sample `at`. */
function burst(out, at, rng, { freq, q, gain, decay }) {
  const n = Math.round(decay * 6 * RATE);
  const noise = bandpass(Float32Array.from({ length: n }, () => rng.between(-1, 1)), freq, q);
  for (let i = 0; i < n && at + i < out.length; i += 1) if (at + i >= 0) out[at + i] += noise[i] * gain * Math.exp(-i / (decay * RATE)) * 4;
}

function thump(out, at, { freq, gain, decay }) {
  const n = Math.round(decay * 6 * RATE);
  for (let i = 0; i < n && at + i < out.length; i += 1) if (at + i >= 0) out[at + i] += Math.sin((2 * Math.PI * freq * i) / RATE) * gain * Math.exp(-i / (decay * RATE));
}

/**
 * The film's sound, `length` seconds long: each shot's events (from its
 * take, between `from` and `from + length`) placed at the shot's `cut`,
 * room tone under the shots, silence after them. Returns Float32Array samples.
 */
export function foley(shots, takes, length) {
  const out = new Float32Array(Math.ceil(length * RATE));
  const rng = seeded(7);
  const shotsEnd = shots.reduce((t, s) => Math.max(t, s.cut + s.length), 0);
  for (let i = 0; i < Math.min(out.length, shotsEnd * RATE); i += 1) out[i] += rng.between(-1, 1) * ROOM;
  for (const shot of shots) {
    for (const e of takes[shot.take].events ?? []) {
      if (e.t < shot.from || e.t >= shot.from + shot.length) continue;
      const at = Math.round((shot.cut + e.t - shot.from) * RATE);
      if (e.type === 'press') {
        burst(out, at, rng, PRESS);
        thump(out, at, PRESS.thump);
      } else if (e.type === 'key') burst(out, at, rng, { ...KEY, gain: KEY.gain * rng.between(0.8, 1.15) });
    }
  }
  return out;
}

/** Samples as a 16-bit mono WAV file. */
export function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), i * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}
