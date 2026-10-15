/**
 * Judging a launch film like a DP: each shot's middle frame against the
 * look (a dark frame, a quarter of it black, one sharp subject the eye finds
 * at once, text sharp at its magnification), and the cut against the edit
 * (the diagonal flips, the wide shot is saved for the payoff, short accents
 * are not stacked into a sizzle reel, something happens in every shot).
 *
 * Pure: frames in, notes out. A demo clip is judged by the demo camera's
 * own notes (storyboard.mjs); this is the launch film's half.
 */
import { JUDGE } from './grammar.mjs';

const luma = (f, i) => (0.2126 * f[i] + 0.7152 * f[i + 1] + 0.0722 * f[i + 2]) / 255;

/** What a frame measures: its mean luminance, its share of black, and where its sharp detail is. */
export function measure(frame, W, H) {
  const step = 2;
  let sum = 0;
  let black = 0;
  let n = 0;
  let sharp = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  for (let y = step; y < H - step; y += step) {
    for (let x = step; x < W - step; x += step) {
      const i = (y * W + x) * 3;
      const l = luma(frame, i);
      sum += l;
      if (l < 0.03) black += 1;
      n += 1;
      /* A Laplacian on luma: high where an edge is in focus, low in bokeh and in the void. */
      const lap = 4 * l - luma(frame, i - 3 * step) - luma(frame, i + 3 * step) - luma(frame, i - W * 3 * step) - luma(frame, i + W * 3 * step);
      if (Math.abs(lap) > 0.22) {
        sharp += 1;
        sx += x;
        sy += y;
        sxx += x * x;
        syy += y * y;
      }
    }
  }
  const mx = sharp ? sx / sharp : W / 2;
  const my = sharp ? sy / sharp : H / 2;
  const spread = sharp ? Math.sqrt(Math.max(0, sxx / sharp - mx * mx) + Math.max(0, syy / sharp - my * my)) / W : 0;
  return { luminance: sum / n, black: black / n, sharpShare: sharp / n, spread, centre: [mx / W, my / H] };
}

const pct = (v) => `${Math.round(v * 100)}%`;

/**
 * Notes on a film: `shots` from resolveShots(), `frames` [{frame, width,
 * height}] at each shot's middle, `takes` the take files. Notes are
 * {level: 'warn' | 'ok', shot?, text}.
 */
export function judgeFilm(shots, frames, takes) {
  const notes = [];
  shots.forEach((shot, i) => {
    const n = i + 1;
    const { frame, width, height } = frames[i];
    const m = measure(frame, width, height);
    const [lo, hi] = JUDGE.luminance;
    if (m.luminance > hi) notes.push({ level: 'warn', shot: n, text: `too bright: the frame averages ${pct(m.luminance)} light (aim for ${pct(lo)} to ${pct(hi)}); tighten the light or lean in closer` });
    if (m.luminance < lo) notes.push({ level: 'warn', shot: n, text: `too dark: the frame averages ${pct(m.luminance)}; widen the light` });
    if (m.black < JUDGE.black && shot.scale !== 'wide') notes.push({ level: 'warn', shot: n, text: `only ${pct(m.black)} of the frame is black (aim for ${pct(JUDGE.black)} or more): crop tighter or tilt further` });
    if (m.sharpShare < JUDGE.sharpShare[0]) notes.push({ level: 'warn', shot: n, text: 'nothing in it is sharp: the subject may be out of the focal band' });
    else if (m.sharpShare > JUDGE.sharpShare[1] && shot.scale !== 'wide') notes.push({ level: 'warn', shot: n, text: 'too much is sharp: it reads as a screenshot; tilt further or lean in' });
    if (m.spread > JUDGE.spread && shot.scale !== 'wide') notes.push({ level: 'warn', shot: n, text: 'the sharp detail is scattered: there should be one subject the eye lands on' });
    /* Text stays sharp while the take has at least this many of its pixels behind each film pixel at the subject. */
    const take = takes[shot.take];
    const texel = (take.viewport.dpr * (1080 / height)) / shot.mag[1];
    if (texel < 0.6) notes.push({ level: 'warn', shot: n, text: `the subject is enlarged ${(1 / texel).toFixed(1)}x past the take's pixels, so its text softens; record with viewport.dpr ${Math.ceil(shot.mag[1] * 0.7)} or lean out` });
    const happens = Object.values(take.beats).some((t) => t >= shot.from - 0.2 && t <= shot.from + shot.length);
    /* The close-up after the payoff holds on the result: it is allowed to be still. */
    const afterPayoff = i > 0 && shots[i - 1].scale === 'wide';
    if (!happens && !afterPayoff) notes.push({ level: 'warn', shot: n, text: 'nothing happens in it: cut in on a beat, so the UI acts while we watch' });
    if (i > 0) {
      const prev = shots[i - 1];
      if (prev.scale === shot.scale && prev.diagonal === shot.diagonal) notes.push({ level: 'warn', shot: n, text: `same scale and diagonal as the shot before it, so the cut reads as a jump; flip its diagonal` });
      if (prev.length < JUDGE.accent && shot.length < JUDGE.accent) notes.push({ level: 'warn', shot: n, text: 'two short accents in a row: let one shot breathe, or the film reads as a sizzle reel' });
    }
  });
  const wides = shots.filter((s) => s.scale === 'wide');
  const total = shots.reduce((t, s) => t + s.length, 0);
  if (wides.length === 0) notes.push({ level: 'warn', text: 'no wide shot: save one for the payoff, so it lands as a release' });
  if (wides.length > 1) notes.push({ level: 'warn', text: `${wides.length} wide shots: keep one, for the payoff` });
  for (const w of wides) if (w.cut < total * 0.5) notes.push({ level: 'warn', shot: w.index + 1, text: 'the wide shot comes early: hold it back for the payoff' });
  if (!notes.length) notes.push({ level: 'ok', text: `${shots.length} shots, ${total.toFixed(1)}s: every frame reads as a film still` });
  return notes;
}
