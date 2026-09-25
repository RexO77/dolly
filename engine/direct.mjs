/**
 * From a take to a camera spec. A scenario either exports `direction`, a
 * declarative list of shots the grammar turns into moves, or a `camera(take,
 * tools)` function for a move the grammar's shots cannot express.
 *
 *   export const direction = {
 *     sync: { beat: 'open', box: 'panel', threshold: 3 },
 *     resync: [{ beat: 'warning', box: 'alert', window: 3 }],
 *     cut: { from: 'qr', fromOffset: -0.05, to: 'qr', toOffset: 0.9, fade: 0.3 },
 *     shots: [{ box: 'panel', from: 'open', to: 'done', hold: 1.2 }],
 *   };
 *
 * `sync` re-times every beat by one real change: the first frame after the
 * beat where its box changes. `resync` pins single beats the same way, for
 * a beat a scenario can only notice late. `cut` takes out a stretch the
 * product really shows but a clip should not dwell on, with a crossfade.
 */
import * as grammar from './camera/grammar.mjs';
import { firstChange, firstPixel } from './retime.mjs';
import { probe } from './ffmpeg.mjs';

const DEFAULT_CUT_FADE = 0.25;
const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Where a moment of the master lands once `cut` has taken out `from` to
 * `to`. Earlier moments keep their time. The crossfade ends at `from`, so a
 * moment inside the cut, at its end or inside the crossfade lands there,
 * and later ones move up by the cut and its fade. Order is always kept.
 */
export function afterCut(t, { from, to, fade }) {
  if (t <= from) return t;
  return Math.max(from, t - (to - from) - fade);
}

/** The helpers a scenario's `camera(take, tools)` receives. */
export function tools(master, take) {
  const { duration, fps } = probe(master);
  return {
    master,
    duration,
    fps,
    grammar,
    firstChange: (box, opts) => firstChange(master, box, opts),
    firstPixel: (point, test, opts) => firstPixel(master, point, test, opts),
    shots: (list, opts) => grammar.shots(list, { boxes: take.boxes, length: duration, ...opts }),
    fromDirection: (direction) => fromDirection(master, take, direction, { duration }),
  };
}

/** A beat's time in the take, or an error that lists the beats there are. */
function beatTime(beats, label) {
  if (!(label in beats)) throw new Error(`the take has no beat "${label}" (it has ${Object.keys(beats).join(', ') || 'none'}); mark it with h.beat('${label}')`);
  return beats[label];
}

/** How far every beat moves so that `sync.beat` lands on the frame where `sync.box` really changes. */
async function syncOffset(master, { beats, boxes }, sync) {
  if (!sync) return 0;
  const estimate = beatTime(beats, sync.beat);
  const found = await firstChange(master, boxes[sync.box], { from: Math.max(0, estimate - 1), threshold: sync.threshold ?? 1.5 });
  if (found < 0) throw new Error(`the sync box "${sync.box}" never changes after beat "${sync.beat}"; measure a box over what changes, or sync on another beat`);
  return found - estimate;
}

/** Beats pinned one by one to the frame where their box changes. */
async function pinBeats(master, { beats, boxes }, resync, offset) {
  const pinned = {};
  for (const pin of resync) {
    const estimate = beatTime(beats, pin.beat) + offset;
    const found = await firstChange(master, boxes[pin.box], { from: Math.max(0, estimate - (pin.window ?? 2.5)), threshold: pin.threshold ?? 2 });
    if (found < 0) throw new Error(`beat "${pin.beat}" never shows in box "${pin.box}"; widen its window, or measure a box over what changes`);
    pinned[pin.beat] = found;
  }
  return pinned;
}

/**
 * A camera spec from a declarative direction. Returns {spec, warnings,
 * beats, offset}, with the beats on the finished clip's clock.
 */
export async function fromDirection(master, take, { sync, resync = [], cut, shots }, { duration = probe(master).duration } = {}) {
  const offset = await syncOffset(master, take, sync);
  const pinned = await pinBeats(master, take, resync, offset);
  const onMaster = (label) => (label in pinned ? pinned[label] : beatTime(take.beats, label) + offset);

  let at = onMaster;
  let length = duration;
  let source;
  if (cut) {
    const trimmed = {
      from: round3(onMaster(cut.from) + (cut.fromOffset ?? 0)),
      to: round3(onMaster(cut.to) + (cut.toOffset ?? 0)),
      fade: cut.fade ?? DEFAULT_CUT_FADE,
    };
    source = { cut: trimmed };
    at = (label) => afterCut(onMaster(label), trimmed);
    length = duration - (trimmed.to - trimmed.from) - trimmed.fade;
  }

  const built = grammar.shots(shots, { at, boxes: take.boxes, length });
  return {
    spec: source ? { ...built.spec, source } : built.spec,
    warnings: built.warnings,
    beats: Object.fromEntries(Object.keys(take.beats).map((label) => [label, round3(at(label))])),
    offset: round3(offset),
  };
}
