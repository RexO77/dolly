/**
 * wrenly-done: an issue marked done. The welcome emails are finished, so
 * the issue goes from In review to Done, and the project notices: the row,
 * the counts and the progress bar all move, and a toast says so.
 *
 * The hand opens AUT-131 from the list (wide: the panel arrives in
 * context), then picks Done from its status menu. The camera leans in on
 * the issue's title and properties and settles before the menu opens,
 * stays still while the status changes, then pulls back so the toast and
 * the updated list are seen with it.
 *
 *   dolly record wrenly wrenly-done
 *   dolly storyboard wrenly wrenly-done
 */
import { REST, statusRect } from './_wrenly.mjs';

/* ─────────────────────────────────────────────────────────
 * STORYBOARD
 *
 *   0.00s   wide on the project
 *   1.30s   the hand leaves for AUT-131
 *   2.20s   press: the issue panel slides in           beat "open"
 *   2.75s   lean in on ISSUE, 1 → 1.35 on a spring (1.2s)
 *   3.30s   the hand leaves for the status button
 *   3.80s   the wash comes up on ISSUE
 *   3.95s   the lean has settled
 *   4.30s   press: the status menu opens               beat "menu"
 *   5.30s   press Done: the status turns green         beat "pick"
 *   6.00s   the change has played out                  beat "done"
 *   7.00s   pull back to wide: the toast, the list, the progress
 *   8.20s   wide, held on the finished state
 *   9.60s   end
 * ───────────────────────────────────────────────────────── */

const TIMING = {
  reachRow: 1.3, // the hand leaves for the row
  open: 2.2, // the row press: beat "open"
  reachStatus: 3.3, // the hand leaves for the status button
  menu: 4.3, // the menu opens, once the lean has settled: beat "menu"
  pick: 5.3, // Done is pressed: beat "pick"
  done: 6.0, // the status, the row and the counts have changed: beat "done"
};

const ROW = '[data-group="review"] .row[data-id="AUT-131"]'; // the issue the hand opens
const STATUS = '#status-btn'; // its status button
const DONE = '.menu-item[data-status="done"]'; // Done, in the status menu

const HAND = {
  seed: 3, // one seed, so every retake repeats the same performance
  dwell: 0.22, // the pause on each target before its press, seconds
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
  await h.waitFor(ROW);
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

  await reach(h, hand, ROW, TIMING.reachRow, TIMING.open, { dx: -120, jx: 0.3 });
  h.beat('open');
  await hand.press();

  await reach(h, hand, STATUS, TIMING.reachStatus, TIMING.menu);
  h.beat('menu');
  await hand.press();

  await h.waitFor(DONE);
  await reach(h, hand, DONE, TIMING.menu + 0.35, TIMING.pick, { dx: -40, jx: 0.2 });
  h.beat('pick');
  await hand.press();

  await h.until(TIMING.done);
  h.beat('done');
  h.boxCss('issue', await hand.rectOf(statusRect));

  await h.until(TIMING.done + SHOT.hold + h.grammar.SPRING);
}

/* `sync` pins every beat to the first frame where the issue's properties change after "menu" (the menu opening). */
export const direction = {
  sync: { beat: 'menu', box: 'issue' },
  shots: [{ box: 'issue', from: 'menu', to: 'done', hold: SHOT.hold }],
};
