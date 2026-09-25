/**
 * wrenly-filter: one filter, directed. Twelve issues become the two waiting
 * for review, and the rows that go fold away instead of vanishing.
 *
 * The hand reaches the "In review" chip and presses it; the list is what
 * changes. The camera holds wide, leans in on the chips and the list and
 * settles before the press, stays still while the rows fold away, then
 * pulls back and holds on the shorter list in context.
 *
 *   dolly record wrenly wrenly-filter
 *   dolly storyboard wrenly wrenly-filter
 */
import { REST, listRect } from './_wrenly.mjs';

/* ─────────────────────────────────────────────────────────
 * STORYBOARD
 *
 *   0.00s   wide on the project: twelve issues in four groups
 *   1.05s   lean in on LIST, 1 → 1.35 on a spring (1.2s)
 *   1.30s   the hand leaves for the chip
 *   2.10s   the wash comes up on LIST
 *   2.25s   the lean has settled
 *   2.60s   press "In review": the other groups fold away   beat "filter"
 *   3.30s   the list has settled on two rows               beat "done"
 *   4.30s   pull back to wide on a spring, the wash fades
 *   5.50s   wide, held on the filtered list
 *   6.90s   end
 * ───────────────────────────────────────────────────────── */

const TIMING = {
  reach: 1.3, // the hand leaves for the chip
  press: 2.6, // the press, once the lean has settled: beat "filter"
  done: 3.3, // the rows have folded away: beat "done"
};

const CHIP = '.chip[data-filter="review"]'; // the filter the hand presses

const HAND = {
  seed: 7, // one seed, so every retake repeats the same performance
  dwell: 0.2, // the pause on the chip before the press, seconds
};

const SHOT = {
  hold: 1.0, // seconds the camera stays in after "done", before it pulls back
};

export const meta = {
  url: '/',
  leadMs: 700,
  tailMs: 1400,
};

export async function setup(h) {
  await h.waitFor(CHIP);
}

export default async function scenario(h) {
  const hand = h.hand({ seed: HAND.seed, curve: h.ease.settle(0.8) });
  await hand.jump(REST);
  const chip = hand.aim(await h.boxOf(CHIP), { jx: 0.08, jy: 0.1 });

  await h.until(TIMING.reach);
  await hand.glide(chip, (TIMING.press - TIMING.reach - HAND.dwell) * 1000);
  await hand.dwell(HAND.dwell * 1000);
  h.beat('filter');
  await hand.press();

  await h.until(TIMING.done);
  h.beat('done');
  h.boxCss('list', await hand.rectOf(listRect));

  await h.until(TIMING.done + SHOT.hold + h.grammar.SPRING);
}

/* `sync` pins every beat to the first frame where the list really changes after the press. */
export const direction = {
  sync: { beat: 'filter', box: 'list' },
  shots: [{ box: 'list', from: 'filter', to: 'done', hold: SHOT.hold }],
};
