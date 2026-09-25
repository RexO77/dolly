/**
 * __CLIP__: one change, directed. Say here what the clip shows and why it
 * earns a clip, in a sentence a reader of the case study would recognise.
 *
 * The hand reaches TARGET and presses it; PANEL is what changes. The camera
 * holds wide, leans in on PANEL and settles before the press, stays still
 * while the change plays, then pulls back and holds on the finished state.
 * No cursor: the only trace of the hand is what it lights up.
 *
 * Set TARGET and PANEL from `dolly inspect __PROJECT__`, then:
 *
 *   dolly record __PROJECT__ __CLIP__
 *   dolly storyboard __PROJECT__ __CLIP__
 *
 * A scenario imports nothing: everything it needs arrives on `h`.
 */

/* ─────────────────────────────────────────────────────────
 * STORYBOARD
 *
 * Read top to bottom. Times are seconds on the clip's clock;
 * the camera's come from the grammar (h.grammar), so they
 * follow the beats.
 *
 *   0.00s   wide on the page: take it in
 *   1.05s   lean in on PANEL, 1 → 1.35 on a spring (1.2s)
 *   1.40s   the hand leaves for TARGET
 *   2.10s   the wash comes up on PANEL
 *   2.25s   the lean has settled
 *   2.60s   press: PANEL changes, the camera holds still   beat "change"
 *   4.00s   the change has played out                      beat "done"
 *   4.90s   pull back to wide on a spring, the wash fades
 *   6.10s   wide, held on the finished state
 *   7.50s   end (meta.tailMs after the scenario returns)
 * ───────────────────────────────────────────────────────── */

const TIMING = {
  reach: 1.4, // the hand leaves for TARGET
  press: 2.6, // the press, once the lean has settled: beat "change"
  done: 4.0, // the change has played out: beat "done"
};

/* What the clip is about: a CSS selector, or text=Exact label (its text or aria-label). */
const TARGET = 'text=Settings'; // the control the hand presses
const PANEL = 'main'; // the region that changes: the camera leans in on it, the wash falls on it

/* The hand */
const HAND = {
  seed: 1, // one seed, so every retake repeats the same performance
  dwell: 0.2, // the pause on TARGET before the press, seconds
};

/* The shot */
const SHOT = {
  hold: 0.9, // seconds the camera stays in after "done", before it pulls back
  pad: 8, // CSS px of room round PANEL, so the lean never crops its edge
};

export const meta = {
  url: '/', // the page, against the project's base
  leadMs: 700, // wide and still before the scenario starts
  tailMs: 1400, // the final wide hold, after the scenario returns
};

/* Off camera, before the capture starts: the take opens on a ready page. */
export async function setup(h) {
  await h.waitFor(TARGET);
}

export default async function scenario(h) {
  const hand = h.hand({ seed: HAND.seed });
  const at = await h.center(TARGET);

  /* Leave late and glide long, so TARGET's hover lands after the lean has settled. */
  await h.until(TIMING.reach);
  await hand.glide(at, (TIMING.press - TIMING.reach - HAND.dwell) * 1000);
  await hand.dwell(HAND.dwell * 1000);
  h.beat('change');
  await hand.press();
  await h.park();

  await h.until(TIMING.done);
  h.beat('done');
  /* Measure PANEL in its final place: the camera frames what the change left. */
  await h.box('panel', PANEL, SHOT.pad);

  /* Run on through the pull back; meta.tailMs then holds the finished state. */
  await h.until(TIMING.done + SHOT.hold + h.grammar.SPRING);
}

/*
 * The camera, as direction: the grammar turns each shot into a lean, a
 * hold and a pull back. `sync` re-times every beat to the first frame where
 * PANEL really changes after "change", so the camera sits on the picture.
 */
export const direction = {
  sync: { beat: 'change', box: 'panel' },
  shots: [{ box: 'panel', from: 'change', to: 'done', hold: SHOT.hold }],
};
