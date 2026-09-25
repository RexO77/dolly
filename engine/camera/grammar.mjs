/**
 * THE GRAMMAR. The owner's direction for every change a clip shows, and the
 * one place its numbers live:
 *
 *   1. establish: hold the wide view long enough to take it in;
 *   2. lean in: spring to LEAN_Z on the spot where the change will happen,
 *      and SETTLE there before it starts;
 *   3. the change plays with the camera still (never zoom while the product
 *      is changing);
 *   4. pull back: spring out to the wide view once it is done, and hold, so
 *      the finished state is seen in context.
 *
 * No cursor. A spotlight is the wash alone (a fixed warm paper colour laid
 * over everything but the subject), never a drawn ring. It may ride a
 * lean-in and fade as the camera pulls back.
 */

/** How far a lean goes in. Past it, text softens and the product loses its context. */
export const LEAN_Z = 1.35;
/** A lean or a pull back, in seconds. */
export const SPRING = 1.2;
/** A quick hop between two nearby subjects, in seconds. */
export const HOP = 0.6;
/** How long a lean has come to rest before the change it leans in for. */
export const SETTLE = 0.35;
/** The shortest wide hold that reads as "show everything". */
export const ESTABLISH = 0.8;
/** A critically damped spring is ~99% settled at a*t = 6.6. */
export const SPRING_A = 6.6;
/**
 * The same spring as a cubic Bezier, for editors that speak curves (the
 * Studio's curve editor): within 1.1% of it everywhere, monotonic, and
 * never past 1. A move keeps the exact spring until its curve is edited.
 */
export const SPRING_CURVE = [0.2, 0.11, 0.18, 1];
/** Smootherstep as a cubic Bezier, the same way (within 1% of it). */
export const SMOOTH_CURVE = [0.65, 0, 0.35, 1];
/** A focus rect fills at most this share of the view, so its edges never touch the frame. */
export const FOCUS_FILL = 0.92;

/** The spotlight: a fixed warm paper colour, rgb(245, 239, 230), at 72% over everything but the subject. */
export const WASH = [245, 239, 230];
export const WASH_ALPHA = 0.72;
/** The spotlight's corner radius, in CSS px. */
export const SPOT_RADIUS = 6;

const r3 = (n) => Math.round(n * 1000) / 1000;

/**
 * A camera spec in the grammar, from a take's beats and boxes.
 *
 * Each shot `{box, from, to, hold, spot}` leans in on `box` so it has
 * settled SETTLE before beat `from`, stays through beat `to` plus `hold`,
 * then pulls back. When there is no room to pull back and lean in again
 * before the next shot, the camera hops straight across instead, and the
 * light crossfades with it so the wash never lifts between two subjects.
 *
 * `at(label)` turns a beat into clip seconds; `boxes` maps a label to a
 * rect; `length` is the clip's duration. Returns {spec, warnings}.
 */
export function shots(list, { at, boxes, length }) {
  const warnings = [];
  const camera = [{ t: 0, wide: true }];
  const spots = [];
  let prev = null;
  for (const s of list) {
    const focus = boxes[s.box];
    if (!focus) throw new Error(`no box "${s.box}"`);
    const settled = at(s.from) - SETTLE;
    const holdTo = at(s.to) + (s.hold ?? 0.9);
    let hopAt = null;
    if (prev && settled - prev.holdTo < SPRING * 2 + 0.4) {
      const move = Math.min(SPRING, Math.max(HOP, settled - prev.holdTo));
      const leave = Math.max(prev.holdTo, settled - move);
      if (leave + move > settled + 0.01) warnings.push(`the hop onto ${s.box} lands after ${s.from} starts`);
      camera.push({ t: r3(leave), focus: prev.focus });
      camera.push({ t: r3(leave + move), focus });
      hopAt = leave;
    } else {
      if (prev) {
        camera.push({ t: r3(prev.holdTo), focus: prev.focus });
        camera.push({ t: r3(prev.holdTo + SPRING), wide: true });
      }
      const leanAt = Math.max(camera[camera.length - 1].t + ESTABLISH, settled - SPRING);
      camera.push({ t: r3(leanAt), wide: true });
      camera.push({ t: r3(leanAt + SPRING), focus });
    }
    if (s.spot !== false) {
      const last = spots[spots.length - 1];
      if (hopAt !== null && last) {
        last.out = r3(hopAt + 0.1);
        spots.push({ ...focus, in: r3(hopAt), out: r3(holdTo), fade: 0.5 });
      } else {
        spots.push({ ...focus, in: r3(settled - 0.15), out: r3(holdTo), fade: 0.45 });
      }
    }
    prev = { focus, holdTo };
  }
  if (prev) {
    camera.push({ t: r3(prev.holdTo), focus: prev.focus });
    camera.push({ t: r3(prev.holdTo + SPRING), wide: true });
  }
  const last = camera[camera.length - 1].t;
  if (last + ESTABLISH > length) warnings.push(`the clip ends ${(last + ESTABLISH - length).toFixed(2)}s before the pull back settles; record a longer tail`);
  camera.push({ t: r3(Math.max(length, last + 0.5)), wide: true });
  return { spec: { camera, spots }, warnings };
}
