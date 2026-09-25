/**
 * Time, curves and chance for the hand: small pure helpers every part of
 * the engine and every scenario (through `h`) can use.
 */

/** Wait `ms` milliseconds. */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A seeded random source (mulberry32), so a retake repeats the same
 * performance: `next()` in [0, 1), `between(lo, hi)`, and `sign()`.
 */
export function seeded(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, between: (lo, hi) => lo + (hi - lo) * next(), sign: () => (next() < 0.5 ? -1 : 1) };
}

const minimumJerk = (u) => u * u * u * (u * (u * 6 - 15) + 10);

/**
 * How a hand moves from 0 to 1. Every curve has zero speed at both ends,
 * so nothing starts or stops with a jolt.
 */
export const ease = {
  /** Minimum jerk: symmetric and even. */
  even: minimumJerk,
  /** Cubic ease-in-out: straight, even strokes. */
  cubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  /** Leaves quickly and slows into the target. `p` above 1 lengthens the slowing. */
  reach: (p = 1.45) => (u) => minimumJerk(1 - (1 - u) ** p),
  /** A short start and a long arrival, the way a hand settles onto a target. `p` below 1 lengthens it. */
  settle: (p = 0.78) => (u) => minimumJerk(u ** p),
  /** Quick to leave, with a long soft landing: 70% of the way at half time. */
  land: (t) => 1 - (1 - t ** 1.6) ** 3,
  /** A CSS cubic-bezier(x1, y1, x2, y2). */
  bezier(x1, y1, x2, y2) {
    const axis = (a, b, s) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
    return (t) => {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 24; i += 1) {
        const mid = (lo + hi) / 2;
        if (axis(x1, x2, mid) < t) lo = mid;
        else hi = mid;
      }
      return axis(y1, y2, (lo + hi) / 2);
    };
  },
};
