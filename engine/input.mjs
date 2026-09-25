/**
 * Human-paced, cursor-free input, bound to one page, and the clip's clock.
 *
 * A headless screencast never draws a cursor, so the only trace of the hand
 * is what it lights up and when. That sets the rules: paths bow gently and
 * land softly, glides are held to the wall clock so CDP latency cannot
 * stretch them, a still hand keeps a pixel of drift instead of a dead stop,
 * and typing comes in bursts. Everything random comes from one seed, so a
 * retake repeats the same performance.
 *
 * A scenario imports nothing: everything it needs is on `h`, including
 * `h.ease`, `h.seeded` and `h.grammar`, so it runs from any workspace.
 *
 * The clock: `now()` is seconds on the master's own timeline, measured from
 * its first frame, so a beat marked here lands where the picture shows it
 * (within a frame or two; `retime` reads exact change frames off the master).
 */

import * as grammar from './camera/grammar.mjs';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Small seeded PRNG (mulberry32). */
export function seeded(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, between: (lo, hi) => lo + (hi - lo) * next(), sign: () => (next() < 0.5 ? -1 : 1) };
}

const minimumJerk = (u) => u * u * u * (u * (u * 6 - 15) + 10);

/**
 * How a hand moves from 0 to 1. All have zero speed at both ends, so nothing
 * starts or stops with a jolt.
 */
export const ease = {
  /** Plain minimum-jerk: symmetric, even. */
  even: minimumJerk,
  /** Cubic ease-in-out: the recorder's original, straight and even strokes. */
  cubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  /** Leaves quickly, decelerates into the target. `p` above 1 lengthens the settle. */
  reach: (p = 1.45) => (u) => minimumJerk(1 - (1 - u) ** p),
  /** A short start and a long arrival, the way a hand settles onto a target. `p` below 1 lengthens it. */
  settle: (p = 0.78) => (u) => minimumJerk(u ** p),
  /** Quick to leave, long soft landing: 70% of the way at half time. */
  land: (t) => 1 - (1 - t ** 1.6) ** 3,
  /** A CSS cubic-bezier(x1, y1, x2, y2). */
  bezier(x1, y1, x2, y2) {
    const f = (a, b, s) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
    return (t) => {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 24; i += 1) {
        const mid = (lo + hi) / 2;
        if (f(x1, x2, mid) < t) lo = mid;
        else hi = mid;
      }
      return f(y1, y2, (lo + hi) / 2);
    };
  },
};

/** A rect {x, y, w, h} in CSS px as fractions of the viewport, padded by `pad` px: what the camera takes. */
export function fraction(b, { width, height }, pad = 0) {
  const r = (n) => Math.round(n * 10000) / 10000;
  return { x: r((b.x - pad) / width), y: r((b.y - pad) / height), w: r((b.w + pad * 2) / width), h: r((b.h + pad * 2) / height) };
}

/**
 * Evaluate `fn(...args)` in the page. Playwright passes one argument; this
 * keeps the page functions readable with several. `fn` must be
 * self-contained: it is sent as source.
 */
export function evaluate(page, fn, ...args) {
  return page.evaluate(({ src, args }) => (0, eval)(`(${src})`)(...args), { src: fn.toString(), args });
}

/**
 * Where a bent path's control point sits: explicit, a bow as a share of the
 * distance, or a seeded bow of 4 to 10%, capped at `maxBow` px when given
 * (a third of a row, say, so a reach along a row stays on it).
 */
function control(from, to, bend, rng, maxBow) {
  if (bend && typeof bend === 'object') return bend;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let k = bend;
  if (typeof k !== 'number') {
    k = rng.between(0.04, 0.1) * rng.sign();
    const dist = Math.hypot(dx, dy) || 1;
    if (maxBow !== undefined) k = Math.sign(k) * Math.min(Math.abs(k) * dist, maxBow) / dist;
  }
  return { x: from.x + dx / 2 - dy * k, y: from.y + dy / 2 + dx * k };
}

/**
 * The helpers a scenario receives as `h`. `clock` is set by the recorder
 * when the capture starts; `take` collects beats, boxes and notes.
 */
export function helpers(page, { width, height }, take = { beats: {}, boxes: {}, notes: [] }) {
  const viewport = { width, height };
  const mouse = { x: width / 2, y: height / 2 };
  const clock = { zero: null };

  /** Seconds on the master's timeline. Before the capture starts, time since setup began. */
  const now = () => (performance.now() - (clock.zero ?? clock.setup ?? performance.now())) / 1000;

  /** Move the (invisible) mouse and remember where it is. */
  const move = async (x, y) => {
    await page.mouse.move(x, y);
    mouse.x = x;
    mouse.y = y;
  };

  /** Glide to a point along a path, held to wall-clock time so a 600ms glide takes 600ms. */
  const path = async (to, ms, { ctrl, curve = ease.cubic } = {}) => {
    const from = { ...mouse };
    const c = ctrl ?? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const began = performance.now();
    for (;;) {
      const u = Math.min(1, (performance.now() - began) / Math.max(ms, 1));
      const e = curve(u);
      const a = (1 - e) * (1 - e);
      const b = 2 * (1 - e) * e;
      const d = e * e;
      await page.mouse.move(a * from.x + b * c.x + d * to.x, a * from.y + b * c.y + d * to.y);
      if (u >= 1) break;
      await sleep(8);
    }
    mouse.x = to.x;
    mouse.y = to.y;
  };

  /** A CSS selector, or `text=Exact label`: the smallest visible element whose text or aria-label is exactly that. */
  const find = async (target) => {
    if (typeof target !== 'string') return target;
    if (target.startsWith('text=')) {
      const handle = await page.evaluateHandle((label) => {
        const all = [...document.querySelectorAll('body *')].filter((e) => {
          const t = (e.getAttribute('aria-label') || e.textContent || '').trim();
          const r = e.getBoundingClientRect();
          return t === label && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
        });
        const area = (e) => e.getBoundingClientRect().width * e.getBoundingClientRect().height;
        all.sort((a, b) => area(a) - area(b));
        return all[0] || null;
      }, target.slice(5));
      const el = handle.asElement();
      if (!el) throw new Error(`not found: ${target}`);
      return el;
    }
    const el = await page.waitForSelector(target, { state: 'visible', timeout: 5000 });
    if (!el) throw new Error(`not found: ${target}`);
    return el;
  };

  /** A target's box in CSS px: a selector, `text=`, an element handle, or a rect {x, y, w, h}. */
  const boxOf = async (target) => {
    if (target && typeof target === 'object' && 'w' in target) return target;
    const b = await (await find(target)).boundingBox();
    if (!b) throw new Error(`no box: ${target}`);
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  };

  const center = async (target) => {
    const b = await boxOf(target);
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  };

  /** Poll until `target` is on screen, then return it. */
  const waitFor = async (target, timeout = 15000) => {
    const start = Date.now();
    for (;;) {
      try {
        return await find(target);
      } catch (error) {
        if (Date.now() - start > timeout) throw error;
        await sleep(120);
      }
    }
  };

  /** The centre of a visible, enabled BUTTON labelled exactly `label` (text or aria-label), once there is one. */
  const button = async (label, timeout = 15000) => {
    const start = Date.now();
    for (;;) {
      const at = await page.evaluate((label) => {
        const el = [...document.querySelectorAll('button,[role=button]')].find((e) => {
          const r = e.getBoundingClientRect();
          const t = (e.getAttribute('aria-label') || e.textContent || '').trim();
          return t === label && !e.disabled && r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight;
        });
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, label);
      if (at) return at;
      if (Date.now() - start > timeout) throw new Error(`no button: ${label}`);
      await sleep(120);
    }
  };

  const press = async (ms = 70) => {
    await page.mouse.down();
    await sleep(ms);
    await page.mouse.up();
  };

  const h = {
    page,
    viewport,
    mouse,
    take,
    clock,
    sleep,
    ease,
    seeded,
    grammar,
    now,
    /** Wait until clip time `t` (seconds). */
    until: (t) => sleep(Math.max(0, (t - now()) * 1000)),
    /** Mark a beat on the clip's clock; returns its time. A repeated label gets a #2, #3... */
    beat(label) {
      let key = label;
      for (let n = 2; key in take.beats; n += 1) key = `${label}#${n}`;
      const t = Math.round(now() * 1000) / 1000;
      take.beats[key] = t;
      return t;
    },
    /** Measure a box for the camera now: a selector, `text=`, an element, or a CSS-px rect. */
    async box(label, target, pad = 6) {
      take.boxes[label] = fraction(await boxOf(target), viewport, pad);
      return take.boxes[label];
    },
    /** A fixed region in CSS px, as a box. */
    boxCss(label, rect) {
      take.boxes[label] = fraction(rect, viewport);
      return take.boxes[label];
    },
    /** A note kept in the take file (a measured rect, a count, anything worth reading later). */
    note(what, value) {
      take.notes.push(value === undefined ? what : { [what]: value });
    },
    evaluate: (fn, ...args) => evaluate(page, fn, ...args),
    find,
    boxOf,
    center,
    waitFor,
    button,
    move,
    path,
    press,
    /** Glide on the recorder's even ease-in-out. */
    moveTo: (x, y, ms = 450) => path({ x, y }, ms),
    /** Glide to the target, pause like a person, click. */
    async click(target, { glide = 520, dwell = 200 } = {}) {
      const { x, y } = await center(target);
      await path({ x, y }, glide);
      await sleep(dwell);
      await press();
    },
    async hover(target, glide = 520) {
      await path(await center(target), glide);
    },
    /** Glide to a button by its label, dwell, click it. */
    async clickButton(label, { timeout, glide = 560, dwell = 220 } = {}) {
      await path(await button(label, timeout), glide);
      await sleep(dwell);
      await press();
    },
    /** Press and drag, eased like a hand, for pointer-event drags. */
    async drag(from, to, { ms = 900, hold = 180 } = {}) {
      const a = await center(from);
      const b = typeof to === 'string' ? await center(to) : to;
      await path(a, 520);
      await sleep(hold);
      await page.mouse.down();
      await sleep(hold);
      await path(b, ms);
      await sleep(hold);
      await page.mouse.up();
    },
    /** Type at an even human pace, with a little jitter. */
    async type(text, perChar = 70) {
      for (const ch of text) {
        await page.keyboard.type(ch);
        await sleep(perChar * (0.7 + Math.random() * 0.6));
      }
    },
    /** A key chord: modifiers held around one press, e.g. chord('Alt', 'KeyD'). */
    async chord(...keys) {
      const key = keys.pop();
      for (const k of keys) await page.keyboard.down(k);
      await page.keyboard.press(key);
      for (const k of keys.reverse()) await page.keyboard.up(k);
    },
    /** A target's box as fractions of the viewport, padded by `pad` CSS px. */
    rect: async (target, pad = 6) => fraction(await boxOf(target), viewport, pad),
    /** Park the mouse where no hover state lingers: the bottom-right corner by default. */
    park: (x = width - 30, y = height - 30) => path({ x, y }, 400),
    hand: (opts) => hand(h, opts),
  };
  return h;
}

/**
 * A seeded hand: curved glides, drifting dwells, presses as long as real
 * ones, bursty typing. Shares the page's mouse position and clock with `h`.
 */
export function hand(h, { seed = 1, curve = ease.reach(), maxBow } = {}) {
  const rng = seeded(seed);
  const { page, mouse } = h;

  /** Glide on a gentle arc. `bend`: a control point, a bow as a share of the distance (signed), or seeded. */
  const glide = (to, ms, { bend, curve: c = curve } = {}) => h.path(to, ms, { ctrl: control({ ...mouse }, to, bend, rng, maxBow), curve: c });

  /** A still hand still drifts a pixel. */
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

  const press = () => h.press(rng.between(62, 105));

  return {
    rng,
    now: h.now,
    beat: h.beat,
    glide,
    dwell,
    press,
    /** Move in one pointer event: nothing on the way hovers. Only for getting into position unseen. */
    jump: (to) => h.move(to.x, to.y),
    /** Glide to a point, settle, press. Returns the clip time of the press. */
    async clickAt(to, { glide: ms = 520, dwell: still = 200, bend } = {}) {
      await glide(to, ms, { bend });
      await dwell(still);
      const at = h.now();
      await press();
      return at;
    },
    /** Where to aim inside a rect: near the middle, never dead centre. */
    aim: (r, { dx = 0, dy = 0, jx = 0.12, jy = 0.12 } = {}) => ({
      x: r.x + r.w / 2 + dx + rng.between(-jx, jx) * Math.min(r.w, 80),
      y: r.y + r.h / 2 + dy + rng.between(-jy, jy) * Math.min(r.h, 20),
    }),
    /** The rect a page function returns, or a clear error when it finds nothing. */
    async rectOf(fn, ...args) {
      const r = await h.evaluate(fn, ...args);
      if (!r) throw new Error(`target not found: ${fn.name || 'finder'}(${args.map((a) => JSON.stringify(a)).join(', ')})`);
      return r;
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
