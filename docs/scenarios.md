# Scenarios

A scenario is one clip: a module in `projects/<project>/scenarios/<clip>.mjs`. The file name is the clip's name. It says what the hand does in the product, and where the camera should look.

```js
export const meta = { url: '/', leadMs: 700, tailMs: 1400 };   // the page, and the still time either side
export async function setup(h) {}                              // off camera, before the capture starts
export default async function scenario(h) {}                   // the take: what the hand does
export const direction = { shots: [] };                        // the camera, as shots the grammar turns into moves
// or: export function camera(take, tools) {}                  // the camera, as code, for a move the shots cannot say
```

A scenario needs no import from Dolly: everything it uses arrives on `h`, including `h.ease`, `h.seeded` and `h.grammar`, so it runs from any workspace. To share code between one project's scenarios, put it in a module beside them. Files in `scenarios/` whose names start with `_` are not clips.

`dolly init` writes a first scenario from [`templates/scenario.mjs`](../templates/scenario.mjs). Start there.

## The storyboard format

Write a scenario so it reads like a shot list before it reads like code:

1. **A doc comment**: what the clip shows and why, and the command that records it.
2. **A STORYBOARD comment**: every moment on the clip's clock, one line each, times right-aligned, beats named.
3. **A `TIMING` object**: the clip-clock moments the scenario waits for, in seconds, each with a comment. It is the only place those times live.
4. **Config objects** for the rest (`HAND`, `SHOT`): seeds, dwells, holds, padding, each with a comment.
5. **The body**, reading its numbers from those objects.
6. **A declarative `direction`**, unless the move needs code.

```js
/* ─────────────────────────────────────────────────────────
 * STORYBOARD
 *
 *   0.00s   wide on the page: take it in
 *   1.05s   lean in on PANEL, 1 → 1.35 on a spring (1.2s)
 *   2.60s   press: PANEL changes, the camera holds still   beat "change"
 *   4.00s   the change has played out                      beat "done"
 *   4.90s   pull back to wide on a spring
 * ───────────────────────────────────────────────────────── */

const TIMING = {
  reach: 1.4, // the hand leaves for TARGET
  press: 2.6, // the press, once the lean has settled: beat "change"
  done: 4.0, // the change has played out: beat "done"
};
```

The camera's times in the storyboard come from the grammar: a lean starts `h.grammar.SPRING` (1.2s) before it has to have settled, and it settles `h.grammar.SETTLE` (0.35s) before the change. Time the hand so what it lights up lands after the lean has settled.

## meta

| Key | Default | What it does |
| --- | --- | --- |
| `url` | `'/'` | the page, against the project's `base`. A hash route works: `'/#/browser'` |
| `leadMs` | `700` | still time at the start of the take, before the scenario's first move |
| `tailMs` | `1400` | still time after the scenario returns: the final wide hold |
| `takes` | `1` | how many times to try a take before giving up (`dolly record --takes N` overrides it) |
| `viewport` | the project's | `{width, height, dpr}` for this clip |
| `query` | the project's | query parameters, merged over the project's; `false` drops the project's |
| `poster` | the last frame | seconds into the clip to take the poster from |
| `deliver` | `'default'` | which of the project's `deliver` folders the clip goes to |
| `output` | the preset | overrides for the render: `width`, `size` (`'1600x1000'`), `crf`, `x264`, `poster: {width, quality}` |
| `allowReload` | `false` | keep a take even when the page reloads during it |

`meta` is handed to the project's `prepare` hook too, so a project can read its own keys from it (a product with several platforms might read `meta.platform`).

## setup

`setup(h)` runs after the page has loaded and its fonts have settled, and before the capture starts. Use it to put the product in the state the clip opens on: dismiss a banner, open a panel, wait for data. Nothing it does is filmed. After it, Dolly parks the mouse in the bottom-right corner.

```js
export async function setup(h) {
  await h.waitFor('text=Settings');
}
```

## The take

The default export is the take. It receives `h`, bound to the page and to the clip's clock.

**The clock.** `h.now()` is seconds on the master's own timeline, from its first frame. `h.until(t)` waits until clip time `t`. `h.beat(label)` marks a moment and returns its time; the camera is directed from beats. A repeated label becomes `label#2`, `label#3`.

**Boxes.** The camera leans in on boxes. `h.box(label, target, pad = 6)` measures a target now, padded by `pad` CSS px, and keeps it in the take as a fraction of the viewport. `h.boxCss(label, {x, y, w, h})` keeps a fixed CSS-px region. Measure a box where it ends up: the camera frames what the change leaves.

**Targets.** Anything that takes a target takes a CSS selector, `text=Exact label` (the smallest visible element whose text or aria-label is exactly that), an element handle, or a rect `{x, y, w, h}` in CSS px.

### `h`

| Name | What it does |
| --- | --- |
| `h.now()` | seconds on the clip's clock |
| `h.until(t)` | wait until clip time `t` |
| `h.sleep(ms)` | wait |
| `h.beat(label)` | mark a beat; returns its time |
| `h.box(label, target, pad?)` | measure a box for the camera |
| `h.boxCss(label, rect)` | a fixed CSS-px region as a box |
| `h.note(what, value?)` | keep a note in the take file |
| `h.find(target)` | the element (throws when it is not on screen) |
| `h.waitFor(target, timeout?)` | poll until the target is on screen (15s) |
| `h.button(label, timeout?)` | the centre of a visible, enabled button labelled exactly `label`, once there is one |
| `h.boxOf(target)` | a target's box in CSS px |
| `h.center(target)` | a target's centre in CSS px |
| `h.rect(target, pad?)` | a target's box as fractions of the viewport |
| `h.click(target, {glide, dwell})` | glide to it (520ms), pause (200ms), click |
| `h.clickButton(label, {timeout, glide, dwell})` | the same, for a button by its label |
| `h.hover(target, glide?)` | glide onto it |
| `h.drag(from, to, {ms, hold})` | press, drag and release, eased like a hand |
| `h.moveTo(x, y, ms?)` | glide to a point on an even ease |
| `h.path(to, ms, {ctrl, curve})` | glide along a curve through a control point |
| `h.move(x, y)` | move in one event: nothing on the way hovers |
| `h.press(ms?)` | mouse down and up |
| `h.type(text, perChar?)` | type at an even pace with a little jitter |
| `h.chord(...keys)` | modifiers held round one key: `h.chord('Alt', 'KeyD')` |
| `h.park(x?, y?)` | park the mouse where no hover lingers |
| `h.evaluate(fn, ...args)` | run `fn` in the page; `fn` must be self-contained |
| `h.hand(opts)` | a seeded hand (below) |
| `h.page` | the Playwright page, for anything else |
| `h.viewport`, `h.mouse`, `h.meta` | the viewport, the mouse's position, the clip's meta |
| `h.ease`, `h.seeded`, `h.grammar` | curves for the hand, a seeded random source, the camera grammar's numbers |

`h.ease` holds the hand's curves, each from 0 to 1 with no jolt at either end: `even`, `cubic`, `reach(p)`, `settle(p)`, `land`, and `bezier(x1, y1, x2, y2)`.

### The hand

There is no cursor in a Dolly clip, so a hand shows only through what it lights up and when. `h.hand({seed, curve, maxBow})` gives a hand that moves like one: glides bow gently and land softly, a still hand drifts a pixel, presses last as long as real ones, and typing comes in bursts. Everything random comes from `seed`, so a retake repeats the same performance.

| Name | What it does |
| --- | --- |
| `hand.glide(to, ms, {bend, curve})` | glide on an arc; `bend` is a control point, a signed bow as a share of the distance, or seeded |
| `hand.dwell(ms)` | rest, drifting a pixel |
| `hand.press()` | a press 62 to 105ms long |
| `hand.clickAt(to, {glide, dwell, bend})` | glide, settle, press; returns the clip time of the press |
| `hand.aim(rect, {dx, dy, jx, jy})` | where to aim inside a rect: near the middle, never dead centre |
| `hand.rectOf(fn, ...args)` | the rect a page function returns, or a clear error |
| `hand.type(text)` | bursty typing: quick in a word, a beat at spaces, longer at punctuation |
| `hand.jump(to)` | get into position unseen, in one event |
| `hand.pos`, `hand.rng` | where the hand is; its seeded random source |

From a walk down a tree:

```js
const m = h.hand({ curve: h.ease.settle(0.75) });
const glide = (x, y, ms, bend = 0) => m.glide({ x, y }, ms, { bend });

await h.until(WIDE_HOLD + SPRING + SETTLE - 0.2);
await glide(ds.x, ds.y, 560, -0.08);
await h.sleep(140);
await h.press();
h.beat('data-science');
```

A take driven by button labels:

```js
await h.button('Review queue', 12000);
h.beat('waiting');
h.boxCss('foot', { x: 0, y: 540, w: 600, h: 260 });
await h.sleep(2200);
h.beat('open');
await h.clickButton('Open the review queue');
await h.park();
```

## direction

`direction` is the camera as a list of shots. After a take, Dolly turns it into a camera spec with the grammar (see [camera.md](camera.md)): for each shot, lean in on its box so the camera has settled before beat `from`, hold through beat `to` plus `hold`, then pull back. Two shots too close together for a pull back and a new lean become a hop.

```js
export const direction = {
  sync: { beat: 'waiting', box: 'foot' },
  shots: [
    { box: 'foot', from: 'waiting', to: 'waiting', hold: 1.2 },
    { box: 'thread', from: 'open', to: 'ack', hold: 1.2 },
  ],
};
```

| Key | What it does |
| --- | --- |
| `shots` | `[{box, from, to, hold = 0.9, spot = true}]`: lean in on `box` from beat `from` to beat `to`, plus `hold` seconds; `spot: false` leaves the wash off |
| `sync` | `{beat, box, threshold = 1.5}`: re-time every beat by one real change, the first frame after `beat` where `box` changes |
| `resync` | `[{beat, box, window = 2.5, threshold = 2}]`: pin single beats the same way, for a beat the scenario can only notice late |
| `cut` | `{from, fromOffset, to, toOffset, fade = 0.25}`: take out the stretch between two beats (a spinner, a wait) with a crossfade; later beats move up |

A beat marked on the scenario's clock can land a frame or two off what the master shows. `sync` and `resync` read the real frame off the picture, so the camera sits on what the viewer sees.

## camera(take, tools)

For a move the shots cannot express, export `camera(take, tools)` instead of `direction`. It receives the take (its `beats`, `boxes` and `notes`) and returns a camera spec, or `{spec, warnings, beats}`.

| Tool | What it is |
| --- | --- |
| `tools.master`, `tools.duration`, `tools.fps` | the master's path, length and frame rate |
| `tools.grammar` | the grammar's numbers and `shots` |
| `tools.shots(list, opts)` | the grammar over the take's boxes, like `direction.shots` |
| `tools.fromDirection(direction)` | a whole `direction`, as a starting point to adjust |
| `tools.firstChange(box, {from, threshold})` | the first time at or after `from` where `box` changes on the picture; -1 when it never does |
| `tools.firstPixel(point, test, {from})` | the first time the pixel at `point` passes `test(r, g, b)`; -1 when it never does |

From `rec-walk`, a lean anchored top-left, held from a fixed time to a beat:

```js
export function camera(take) {
  const pull = +(take.beats.algorithms + AFTER).toFixed(2);
  const end = +(pull + SPRING + TAIL_MS / 1000).toFixed(2);
  return {
    camera: [
      { t: 0, wide: true },
      { t: WIDE_HOLD, wide: true },
      { t: WIDE_HOLD + SPRING, ...LEAN },
      { t: pull, ...LEAN },
      { t: +(pull + SPRING).toFixed(2), wide: true },
      { t: end, wide: true },
    ],
    spots: [],
  };
}
```

A clip with neither `direction` nor `camera` renders wide throughout until its camera file is written by hand or in the Studio.
