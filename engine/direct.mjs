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
 * product really shows but a clip should not dwell on, with a crossfade;
 * beats after it move up, beats inside it land on the join.
 */
import * as grammar from './camera/grammar.mjs';
import { firstChange, firstPixel } from './retime.mjs';
import { probe } from './ffmpeg.mjs';

const r3 = (n) => Math.round(n * 1000) / 1000;

/** The helpers a scenario's camera(take, tools) receives. */
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
    fromDirection: (direction) => fromDirection(master, take, direction),
  };
}

/** A spec from a declarative direction. Returns {spec, warnings, beats} with beats on the clip's final clock. */
export async function fromDirection(master, take, { sync, resync = [], cut, shots }) {
  const { beats, boxes } = take;
  const { duration } = probe(master);
  const warnings = [];
  const need = (label) => {
    if (!(label in beats)) throw new Error(`no beat "${label}" in the take (it has ${Object.keys(beats).join(', ') || 'none'})`);
    return beats[label];
  };

  let offset = 0;
  if (sync) {
    const est = need(sync.beat);
    const found = await firstChange(master, boxes[sync.box], { from: Math.max(0, est - 1), threshold: sync.threshold ?? 1.5 });
    if (found < 0) throw new Error(`the sync box "${sync.box}" never changes after ${sync.beat}`);
    offset = found - est;
  }
  const pinned = {};
  for (const p of resync) {
    const est = need(p.beat) + offset;
    const found = await firstChange(master, boxes[p.box], { from: Math.max(0, est - (p.window ?? 2.5)), threshold: p.threshold ?? 2 });
    if (found < 0) throw new Error(`${p.beat} never shows in "${p.box}"`);
    pinned[p.beat] = found;
  }
  let at = (label) => (label in pinned ? pinned[label] : need(label) + offset);

  let length = duration;
  const source = {};
  if (cut) {
    const a = r3(at(cut.from) + (cut.fromOffset ?? 0));
    const b = r3(at(cut.to) + (cut.toOffset ?? 0));
    const fade = cut.fade ?? 0.25;
    source.cut = { from: a, to: b, fade };
    const raw = at;
    at = (label) => {
      const t = raw(label);
      if (t <= a) return t;
      if (t < b) return a;
      return t - (b - a) - fade;
    };
    length = duration - (b - a) - fade;
  }

  const built = grammar.shots(shots, { at, boxes, length });
  warnings.push(...built.warnings);
  const spec = { ...built.spec, ...(Object.keys(source).length ? { source } : {}) };
  return { spec, warnings, beats: Object.fromEntries(Object.keys(beats).map((k) => [k, r3(at(k))])), offset: r3(offset) };
}
