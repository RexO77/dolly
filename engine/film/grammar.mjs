/**
 * The launch film's grammar: every number behind its look, in one place.
 * A launch film is a sequence of hero shots: steep, oblique close-ups of
 * the real UI floating in black, with a razor-thin focal plane, a slow
 * camera drift and light that falls off into the void, hard-cut on the
 * action, ending on one line of copy and a still logo.
 *
 * Lengths in output pixels are for a 1080-high frame and scale with it.
 */

/** The film itself: 24 frames a second, with a 180 degree shutter's motion blur and fine grain. */
export const FILM = { width: 1920, height: 1080, fps: 24, subframes: 4, shutter: 0.5, grain: 4, crf: 16 };

/*
 * Scales, measured as the UI's magnification at the focal point over its
 * native size. Each has its camera (pitch tilts the plane back, roll lays
 * text on a diagonal, yaw brings one side nearer), its depth of field (how
 * blurred the far edge gets, and the most any point blurs), and its light
 * (the pool's reach along and across the action, as a share of the frame
 * width, and the hot core's size within it).
 */
export const SCALES = {
  extreme: { mag: 5.5, pitch: 42, roll: 16, yaw: 10, perspective: 1200, farBlur: 20, maxBlur: 24, along: 0.36, across: 0.24, core: 0.42 },
  macro: { mag: 3.2, pitch: 38, roll: 14, yaw: 8, perspective: 1300, farBlur: 16, maxBlur: 20, along: 0.44, across: 0.3, core: 0.42 },
  medium: { mag: 2, pitch: 32, roll: 11, yaw: 7, perspective: 1400, farBlur: 11, maxBlur: 14, along: 0.52, across: 0.36, core: 0.46 },
  wide: { mag: 0.95, pitch: 10, roll: 0, yaw: 2, perspective: 2000, farBlur: 4, maxBlur: 6, along: 0.78, across: 0.58, core: 0 },
};

/** How a subject's size picks its scale: the width it should fill, as a share of the frame. */
export const SUBJECT_FILL = 0.42;

/** The drift over a shot: track along the action (share of frame width), push (scale), turn (degrees). */
export const DRIFT = { track: 0.06, push: 0.03, turn: 1.5 };

/** Shot lengths: a process shot is watched, a punctuation shot is an accent. Seconds. */
export const LENGTH = { process: [5, 9], punctuation: [2, 3.5], lead: 0.5, hold: 0.75 };

/** How long the light trails the subject, and how long a rack of focus takes. Seconds. */
export const LIGHT_LAG = 0.4;
export const RACK = 0.6;

/** The grade: in-focus text near 90% white, the frame mostly dark, the lens's vignette in the corners. */
export const GRADE = { exposure: 1.18, vignette: 0.7, bokehDim: 0.28, slabRadius: 14 };

/** The ending: the copy un-blurs onto black, then the still logo. Seconds and output pixels. */
export const ENDING = { out: 0.4, copySize: 90, copyIn: 0.8, copyBlur: 16, copyHold: 3.6, logoSize: 115, logoDissolve: 0, logoHold: 4.5 };

/**
 * What the judge measures each mid-shot frame against: its mean luminance,
 * its share of near-black pixels, its share of in-focus detail and how
 * scattered that detail is. Calibrated on a reference launch film (1weiho's
 * cinematic-shot demo), whose frames average 0.4% to 7% luminance with 70%
 * to 98% of the frame black: darker than such films are usually described.
 * A shot shorter than `accent` seconds is an accent; two in a row strobe.
 */
export const JUDGE = { luminance: [0.008, 0.08], black: 0.6, sharpShare: [0.0005, 0.03], spread: 0.25, accent: 3 };
