/**
 * `h`: what a scenario plays the product with. Human-paced input with no
 * cursor, bound to one page, and the clip's clock.
 *
 * The screencast never draws a cursor, so the only trace of the hand is
 * what it lights up and when. That sets the rules: paths bow gently and
 * land softly, glides are held to the wall clock so DevTools latency cannot
 * stretch them, and a press lasts as long as a real one.
 *
 * A scenario imports nothing: everything it needs is on `h`, including
 * `h.ease`, `h.seeded` and `h.grammar`, so it runs from any workspace.
 *
 * The clock: `h.now()` is seconds on the master's own timeline, from its
 * first frame, so a beat marked here lands where the picture shows it
 * (within a frame or two; `direction.sync` reads the exact frame off the master).
 */
import * as grammar from './camera/grammar.mjs';
import { ease, seeded, sleep } from './motion.mjs';
import { hand } from './hand.mjs';

/** A rect {x, y, w, h} in CSS px as fractions of the viewport, padded by `pad` px: the boxes the camera takes. */
export function fraction(rect, { width, height }, pad = 0) {
  const round4 = (n) => Math.round(n * 10000) / 10000;
  return {
    x: round4((rect.x - pad) / width),
    y: round4((rect.y - pad) / height),
    w: round4((rect.w + pad * 2) / width),
    h: round4((rect.h + pad * 2) / height),
  };
}

/**
 * Run `fn(...args)` in the page. Playwright passes a page function one
 * argument; this takes several. `fn` is sent as source, so it must not
 * use anything from the scenario around it.
 */
export function evaluate(page, fn, ...args) {
  return page.evaluate(({ source, args }) => (0, eval)(`(${source})`)(...args), { source: fn.toString(), args });
}

/** Poll `attempt` every 120ms until it returns something, or throw `failure()` after `timeout` ms. */
async function poll(attempt, timeout, failure) {
  const start = Date.now();
  for (;;) {
    const found = await attempt();
    if (found) return found;
    if (Date.now() - start > timeout) throw failure();
    await sleep(120);
  }
}

/**
 * The helpers a scenario receives as `h`, bound to `page`. The recorder
 * sets `h.clock.zero` when the capture starts; `take` collects the beats,
 * boxes and notes the scenario marks.
 */
export function helpers(page, { width, height }, take = { beats: {}, boxes: {}, notes: [] }) {
  const viewport = { width, height };
  const mouse = { x: width / 2, y: height / 2 };
  const clock = { zero: null };

  /** Seconds on the master's timeline. Before the capture starts, seconds since setup began. */
  const now = () => (performance.now() - (clock.zero ?? clock.setup ?? performance.now())) / 1000;

  /** Move the mouse in one event and remember where it is. */
  const move = async (x, y) => {
    await page.mouse.move(x, y);
    mouse.x = x;
    mouse.y = y;
  };

  /** Glide along a curve through `ctrl`, held to the wall clock so a 600ms glide takes 600ms. */
  const path = async (to, ms, { ctrl, curve = ease.cubic } = {}) => {
    const from = { ...mouse };
    const through = ctrl ?? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const began = performance.now();
    for (;;) {
      const u = Math.min(1, (performance.now() - began) / Math.max(ms, 1));
      const e = curve(u);
      const a = (1 - e) * (1 - e);
      const b = 2 * (1 - e) * e;
      const c = e * e;
      await page.mouse.move(a * from.x + b * through.x + c * to.x, a * from.y + b * through.y + c * to.y);
      if (u >= 1) break;
      await sleep(8);
    }
    mouse.x = to.x;
    mouse.y = to.y;
  };

  /** The smallest visible element whose text or aria-label is exactly `label`, or null. */
  const byText = async (label) => {
    const handle = await page.evaluateHandle((wanted) => {
      const matches = [...document.querySelectorAll('body *')].filter((el) => {
        const text = (el.getAttribute('aria-label') || el.textContent || '').trim();
        const r = el.getBoundingClientRect();
        return text === wanted && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
      });
      const area = (el) => el.getBoundingClientRect().width * el.getBoundingClientRect().height;
      matches.sort((a, b) => area(a) - area(b));
      return matches[0] || null;
    }, label);
    return handle.asElement();
  };

  /** A target as an element: a CSS selector, `text=Exact label`, or an element handle (returned as is). */
  const find = async (target) => {
    if (typeof target !== 'string') return target;
    if (target.startsWith('text=')) {
      const el = await byText(target.slice(5));
      if (!el) throw new Error(`nothing visible on the page reads exactly "${target.slice(5)}"; dolly inspect lists what is there`);
      return el;
    }
    const el = await page.waitForSelector(target, { state: 'visible', timeout: 5000 }).catch((error) => {
      if (error.name === 'TimeoutError') return null;
      throw error;
    });
    if (!el) throw new Error(`nothing visible on the page matches ${target} (waited 5s); dolly inspect lists what is there`);
    return el;
  };

  /** A target's box in CSS px: a selector, `text=`, an element handle, or a rect {x, y, w, h}. */
  const boxOf = async (target) => {
    if (target && typeof target === 'object' && 'w' in target) return target;
    const box = await (await find(target)).boundingBox();
    if (!box) throw new Error(`${target} is on the page but has no box (it is hidden or not laid out)`);
    return { x: box.x, y: box.y, w: box.width, h: box.height };
  };

  const center = async (target) => {
    const box = await boxOf(target);
    return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  };

  /** Poll until `target` is on screen, then return it. */
  const waitFor = async (target, timeout = 15000) => {
    let last;
    return poll(
      () => find(target).catch((error) => {
        last = error;
        return null;
      }),
      timeout,
      () => last,
    );
  };

  /** The centre of a visible, enabled button labelled exactly `label` (its text or aria-label), once there is one. */
  const button = (label, timeout = 15000) => poll(
    () => page.evaluate((wanted) => {
      const el = [...document.querySelectorAll('button,[role=button]')].find((e) => {
        const r = e.getBoundingClientRect();
        const text = (e.getAttribute('aria-label') || e.textContent || '').trim();
        return text === wanted && !e.disabled && r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight;
      });
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, label),
    timeout,
    () => new Error(`no visible, enabled button labelled "${label}" after ${timeout / 1000}s; dolly inspect lists the buttons there are`),
  );

  /** Mouse down, hold `ms`, mouse up. */
  const press = async (ms = 70) => {
    await page.mouse.down();
    await sleep(ms);
    await page.mouse.up();
  };

  /** Mark a beat on the clip's clock and return its time. A repeated label becomes label#2, label#3. */
  const beat = (label) => {
    let key = label;
    for (let n = 2; key in take.beats; n += 1) key = `${label}#${n}`;
    const t = Math.round(now() * 1000) / 1000;
    take.beats[key] = t;
    return t;
  };

  /** Settle for `dwell` ms, then press, marking `beat` at the press when given. */
  const settleAndPress = async (dwell, beatLabel) => {
    await sleep(dwell);
    if (beatLabel) beat(beatLabel);
    await press();
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
    beat,
    find,
    boxOf,
    center,
    waitFor,
    button,
    move,
    path,
    press,
    /** Wait until clip time `t` (seconds). */
    until: (t) => sleep(Math.max(0, (t - now()) * 1000)),
    /** Measure a box for the camera now: a selector, `text=`, an element, or a CSS-px rect, padded by `pad` px. */
    async box(label, target, pad = 6) {
      take.boxes[label] = fraction(await boxOf(target), viewport, pad);
      return take.boxes[label];
    },
    /** Keep a fixed region in CSS px as a box. */
    boxCss(label, rect) {
      take.boxes[label] = fraction(rect, viewport);
      return take.boxes[label];
    },
    /** Keep a note in the take file: a measured rect, a count, anything worth reading later. */
    note(what, value) {
      take.notes.push(value === undefined ? what : { [what]: value });
    },
    evaluate: (fn, ...args) => evaluate(page, fn, ...args),
    /** Glide on an even ease-in-out. */
    moveTo: (x, y, ms = 450) => path({ x, y }, ms),
    /** Glide to the target, pause like a person, click. `beat` marks the press. */
    async click(target, { glide = 520, dwell = 200, beat: beatLabel } = {}) {
      await path(await center(target), glide);
      await settleAndPress(dwell, beatLabel);
    },
    async hover(target, glide = 520) {
      await path(await center(target), glide);
    },
    /** Glide to a button by its label, pause, click it. `beat` marks the press. */
    async clickButton(label, { timeout, glide = 560, dwell = 220, beat: beatLabel } = {}) {
      await path(await button(label, timeout), glide);
      await settleAndPress(dwell, beatLabel);
    },
    /** Press and drag, eased like a hand, for pointer-event drags. */
    async drag(from, to, { ms = 900, hold = 180 } = {}) {
      const start = await center(from);
      const end = typeof to === 'string' ? await center(to) : to;
      await path(start, 520);
      await sleep(hold);
      await page.mouse.down();
      await sleep(hold);
      await path(end, ms);
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
    /** A seeded hand (engine/hand.mjs). */
    hand: (options) => hand(h, options),
  };
  return h;
}
