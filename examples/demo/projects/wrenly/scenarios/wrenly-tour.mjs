/**
 * wrenly-tour: the two changes in one take, for Dolly's own site, where a
 * visitor re-directs it live. Filter the list down to what is waiting for
 * review, open the welcome emails and mark them done.
 *
 * Two leans with a pull back between them: the list while it filters, then
 * the issue while its status changes. The panel opens wide, between the
 * two, so it arrives in context.
 *
 *   dolly record wrenly wrenly-tour
 *   dolly storyboard wrenly wrenly-tour
 */
import { REST, listRect, statusRect } from './_wrenly.mjs';

/* ─────────────────────────────────────────────────────────
 * STORYBOARD
 *
 *   0.00s   wide on the project
 *   0.95s   lean in on LIST (1.2s)
 *   2.15s   the lean has settled
 *   2.50s   press "In review": the list folds to two rows   beat "filter"
 *   3.20s   the list has settled                            beat "filtered"
 *   4.00s   pull back to wide
 *   5.50s   press AUT-131: the panel slides in, wide        beat "open"
 *   6.00s   lean in on ISSUE (1.2s)
 *   7.20s   the lean has settled
 *   7.55s   press: the status menu opens                    beat "menu"
 *   8.35s   press Done: the status turns green              beat "pick"
 *   8.95s   the change has played out                       beat "done"
 *   9.75s   pull back to wide: the toast, the counts
 *  10.95s   wide, held on the finished state
 *  12.15s   end
 * ───────────────────────────────────────────────────────── */

const TIMING = {
  reachChip: 1.25, // the hand leaves for the chip
  filter: 2.5, // "In review" is pressed: beat "filter"
  filtered: 3.2, // the rows have folded away: beat "filtered"
  reachRow: 4.6, // the hand leaves for the row, once the pull back is under way
  open: 5.5, // the row press, with the camera wide and still: beat "open"
  reachStatus: 6.6, // the hand leaves for the status button
  menu: 7.55, // the menu opens, once the second lean has settled: beat "menu"
  pick: 8.35, // Done is pressed: beat "pick"
  done: 8.95, // the status and the counts have changed: beat "done"
};

const CHIP = '.chip[data-filter="review"]';
const ROW = '[data-group="review"] .row[data-id="AUT-131"]';
const STATUS = '#status-btn';
const DONE = '.menu-item[data-status="done"]';

const HAND = {
  seed: 11, // one seed, so every retake repeats the same performance
  dwell: 0.2, // the pause on each target before its press, seconds
};

const SHOT = {
  hold: 0.8, // seconds each lean stays in after its change, before it pulls back
};

export const meta = {
  url: '/',
  leadMs: 700,
  tailMs: 1200,
};

export async function setup(h) {
  await h.waitFor(CHIP);
}

async function reach(h, hand, target, leave, press, opts = {}) {
  await h.until(leave);
  const to = hand.aim(await h.boxOf(target), opts);
  await hand.glide(to, (press - leave - HAND.dwell) * 1000);
  await hand.dwell(HAND.dwell * 1000);
}

export default async function scenario(h) {
  const hand = h.hand({ seed: HAND.seed, curve: h.ease.settle(0.8) });
  await hand.jump(REST);

  await reach(h, hand, CHIP, TIMING.reachChip, TIMING.filter, { jx: 0.08 });
  h.beat('filter');
  await hand.press();
  await h.until(TIMING.filtered);
  h.beat('filtered');
  h.boxCss('list', await hand.rectOf(listRect));

  await reach(h, hand, ROW, TIMING.reachRow, TIMING.open, { dx: -120, jx: 0.3 });
  h.beat('open');
  await hand.press();

  await reach(h, hand, STATUS, TIMING.reachStatus, TIMING.menu);
  h.beat('menu');
  await hand.press();

  await h.waitFor(DONE);
  await reach(h, hand, DONE, TIMING.menu + 0.3, TIMING.pick, { dx: -40, jx: 0.2 });
  h.beat('pick');
  await hand.press();

  await h.until(TIMING.done);
  h.beat('done');
  h.boxCss('issue', await hand.rectOf(statusRect));

  await h.until(TIMING.done + SHOT.hold + h.grammar.SPRING);
}

export const direction = {
  sync: { beat: 'filter', box: 'list' },
  resync: [{ beat: 'menu', box: 'issue', window: 1 }],
  shots: [
    { box: 'list', from: 'filter', to: 'filtered', hold: SHOT.hold },
    { box: 'issue', from: 'menu', to: 'done', hold: SHOT.hold },
  ],
};
