/**
 * A seeded hand: glides that bow gently and land softly, a still hand that
 * drifts a pixel, presses as long as real ones, and typing in bursts.
 * Everything random comes from one seed, so a retake repeats the same
 * performance. It shares the mouse position and the clock with `h`.
 */
import { ease, seeded, sleep } from './motion.mjs';

/**
 * Where a bent path's control point sits: given outright, a bow as a share
 * of the distance, or a seeded bow of 4 to 10%, capped at `maxBow` px when
 * given (a third of a row, say, so a reach along a row stays on it).
 */
function controlPoint(from, to, bend, rng, maxBow) {
  if (bend && typeof bend === 'object') return bend;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let bow = bend;
  if (typeof bow !== 'number') {
    bow = rng.between(0.04, 0.1) * rng.sign();
    const distance = Math.hypot(dx, dy) || 1;
    if (maxBow !== undefined) bow = (Math.sign(bow) * Math.min(Math.abs(bow) * distance, maxBow)) / distance;
  }
  return { x: from.x + dx / 2 - dy * bow, y: from.y + dy / 2 + dx * bow };
}

/** `h.hand(options)`: a hand bound to `h`, seeded by `seed`. */
export function hand(h, { seed = 1, curve = ease.reach(), maxBow } = {}) {
  const rng = seeded(seed);
  const { page, mouse } = h;

  /** Glide on a gentle arc. `bend`: a control point, a signed bow as a share of the distance, or seeded. */
  const glide = (to, ms, { bend, curve: glideCurve = curve } = {}) =>
    h.path(to, ms, { ctrl: controlPoint({ ...mouse }, to, bend, rng, maxBow), curve: glideCurve });

  /** Rest for `ms`, drifting a pixel: a real hand is never dead still. */
  const dwell = async (ms) => {
    const from = { ...mouse };
    const to = { x: from.x + rng.between(-1.1, 1.1), y: from.y + rng.between(-0.7, 0.7) };
    const began = performance.now();
    for (;;) {
      const u = Math.min(1, (performance.now() - began) / Math.max(ms, 1));
      const e = ease.even(u);
      await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
      if (u >= 1) break;
      await sleep(16);
    }
    mouse.x = to.x;
    mouse.y = to.y;
  };

  /** A press 62 to 105ms long. */
  const press = () => h.press(rng.between(62, 105));

  return {
    rng,
    now: h.now,
    beat: h.beat,
    glide,
    dwell,
    press,
    /** Move in one pointer event, so nothing on the way hovers. Only for getting into position unseen. */
    jump: (to) => h.move(to.x, to.y),
    /**
     * Glide to a point, settle, press. Returns the clip time of the press;
     * with `beat`, it is also marked as that beat.
     */
    async clickAt(to, { glide: glideMs = 520, dwell: dwellMs = 200, bend, beat } = {}) {
      await glide(to, glideMs, { bend });
      await dwell(dwellMs);
      const at = beat ? h.beat(beat) : h.now();
      await press();
      return at;
    },
    /** Where to aim inside a rect: near the middle, never dead centre. */
    aim: (rect, { dx = 0, dy = 0, jx = 0.12, jy = 0.12 } = {}) => ({
      x: rect.x + rect.w / 2 + dx + rng.between(-jx, jx) * Math.min(rect.w, 80),
      y: rect.y + rect.h / 2 + dy + rng.between(-jy, jy) * Math.min(rect.h, 20),
    }),
    /** The rect a page function returns, or an error that names the function and its arguments. */
    async rectOf(fn, ...args) {
      const rect = await h.evaluate(fn, ...args);
      if (!rect) throw new Error(`nothing on the page for ${fn.name || 'the finder'}(${args.map((a) => JSON.stringify(a)).join(', ')}); check it with dolly inspect`);
      return rect;
    },
    /** Bursty typing: quick inside a word, a beat at spaces, longer at punctuation and before a long word. */
    async type(text) {
      const words = text.split(' ');
      for (let w = 0; w < words.length; w += 1) {
        if (w > 0) {
          await page.keyboard.type(' ');
          await sleep(rng.between(70, 140) + (words[w].length >= 7 && rng.next() < 0.6 ? rng.between(80, 180) : 0));
        }
        for (const ch of words[w]) {
          await page.keyboard.type(ch);
          await sleep(/[?,.!-]/.test(ch) ? rng.between(150, 260) : rng.between(38, 92));
        }
      }
    },
    get pos() {
      return { ...mouse };
    },
  };
}
