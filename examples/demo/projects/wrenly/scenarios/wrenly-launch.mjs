/**
 * wrenly-launch: the take Wrenly's launch film is cut from. The same story
 * as the tour (filter to what is in review, open the welcome emails, mark
 * them done), played slower, in dark mode, at four times the pixels, so
 * the film's close-ups can sit at 4 to 6 times magnification and stay sharp,
 * and in slow motion (four times slower, played back at speed), so it has
 * frames enough for a smooth 24 fps film even at that size.
 *
 * It has no demo camera: the film is directed from its beats and boxes.
 *
 *   dolly record wrenly wrenly-launch
 *   dolly film wrenly wrenly
 */
import { REST, listRect, statusRect } from './_wrenly.mjs';

/* ─────────────────────────────────────────────────────────
 * STORYBOARD
 *
 *   0.00s   the project, at rest
 *   2.40s   press "In review": the pill slides, rows fold    beat "filter"
 *   3.40s   the list has settled                             beat "filtered"
 *   5.60s   press AUT-131: the panel slides in               beat "open"
 *   6.40s   the panel has settled                            beat "opened"
 *   8.40s   press the status: the menu opens                 beat "menu"
 *   9.60s   press Done: the status turns green, counts move  beat "pick"
 *  10.40s   the change has played out, the toast is up       beat "done"
 *  13.40s   end
 * ───────────────────────────────────────────────────────── */

const TIMING = {
  reachChip: 1.2,
  filter: 2.4,
  filtered: 3.4,
  reachRow: 4.2,
  open: 5.6,
  opened: 6.4,
  reachStatus: 7.2,
  menu: 8.4,
  pick: 9.6,
  done: 10.4,
  end: 13.4,
};

const CHIP = '.chip[data-filter="review"]';
const ROW = '[data-group="review"] .row[data-id="AUT-131"]';
const STATUS = '#status-btn';
const DONE = '.menu-item[data-status="done"]';

const HAND = { seed: 23, dwell: 0.24 };

export const meta = {
  url: '/',
  viewport: { dpr: 4 },
  colorScheme: 'dark',
  slow: 4,
  leadMs: 600,
  tailMs: 600,
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

/** Mark an element's box by name, for the film to focus on. */
async function mark(h, name, selector) {
  h.boxCss(name, await h.boxOf(selector));
}

export default async function scenario(h) {
  const hand = h.hand({ seed: HAND.seed, curve: h.ease.settle(0.8) });
  await hand.jump(REST);
  await mark(h, 'nav', '.nav-item.is-active');
  await mark(h, 'title', '.project-title');
  await mark(h, 'chips', '.filters');
  await mark(h, 'progress', '.progress-row');

  await reach(h, hand, CHIP, TIMING.reachChip, TIMING.filter, { jx: 0.08 });
  await mark(h, 'chip', CHIP);
  h.beat('filter');
  await hand.press();
  await h.until(TIMING.filtered);
  h.beat('filtered');
  h.boxCss('list', await hand.rectOf(listRect));
  await mark(h, 'row', ROW);

  await reach(h, hand, ROW, TIMING.reachRow, TIMING.open, { dx: -120, jx: 0.3 });
  h.beat('open');
  await hand.press();
  await h.until(TIMING.opened);
  h.beat('opened');
  await mark(h, 'panel', '.panel');
  await mark(h, 'status', STATUS);

  await reach(h, hand, STATUS, TIMING.reachStatus, TIMING.menu);
  h.beat('menu');
  await hand.press();
  await h.waitFor(DONE);
  await mark(h, 'menu', '.menu');

  await reach(h, hand, DONE, TIMING.menu + 0.4, TIMING.pick, { dx: -40, jx: 0.2 });
  h.beat('pick');
  await hand.press();

  await h.until(TIMING.done);
  h.beat('done');
  h.boxCss('issue', await hand.rectOf(statusRect));
  await mark(h, 'toast', '.toast');
  await mark(h, 'progress-after', '.progress-row');
  await hand.jump(REST);

  await h.until(TIMING.end);
}

/* ─────────────────────────────────────────────────────────
 * THE FILM
 *
 *   1  the "In review" pill slides over        extreme   accent
 *   2  the list it leaves, a row is pressed     medium    watched
 *   3  the issue opens; focus racks to status   medium    watched
 *   4  the menu, Done is picked                 macro     watched
 *   5  the whole window as it all lands         wide      the payoff
 *   6  the toast it leaves                      macro     after
 *   then "Wrenly. Ship the week." and the mark
 * ───────────────────────────────────────────────────────── */
export const film = {
  shots: [
    { on: 'filter', subject: 'chip', lead: 0.7 },
    { on: 'open', subject: 'list', lead: 2.2, length: 3 },
    { on: 'opened', subject: 'issue', lead: 0.3, length: 2.8, rack: [{ at: 1.7, to: 'status' }] },
    { on: 'pick', subject: 'menu', lead: 0.8, length: 3 },
    { on: 'done', wide: true, lead: 0.3 },
    { on: 'done', subject: 'toast', lead: -1.2, length: 2.4 },
  ],
  ending: { copy: 'Wrenly.', tagline: 'Ship the week.', logo: 'app/mark.svg', name: 'Wrenly' },
};
