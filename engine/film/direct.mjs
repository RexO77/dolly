/**
 * Directing a launch film from a take: the scenario's `film` says which
 * moments to cut on and what each shot looks at; the grammar does the rest.
 *
 *   export const film = {
 *     shots: [
 *       { on: 'filter', subject: 'chip' },            // a beat, and a box the take measured
 *       { on: 'opened', subject: 'issue', length: 3.4 },
 *       { on: 'done', wide: true },                   // the payoff: the film's one wide shot
 *     ],
 *     ending: { copy: 'Wrenly.', tagline: 'Ship the week.', logo: 'app/mark.svg', name: 'Wrenly' },
 *   };
 *
 * Each shot cuts in a moment before its beat, so the action starts just
 * after the cut, and runs long enough to watch: an accent on a small
 * subject, a longer look at a bigger one.
 */
import { subjectRect, scaleFor } from './shots.mjs';
import { LENGTH } from './grammar.mjs';

const ACCENT = 2.4;
const LOOK = 3.2;
const PAYOFF = 3.6;
const LEAD = 0.6;
const r2 = (n) => Math.round(n * 100) / 100;

/** The film spec for `clip`, from its scenario's `film` and its take. Returns {film, warnings}. */
export function directFilm(clip, take) {
  const plan = clip.film;
  if (!plan?.shots?.length) throw new Error(`${clip.name} has no film to direct; export \`film\` from its scenario, with its shots (see docs/film.md)`);
  const duration = take.master.duration;
  const warnings = [];
  const shots = plan.shots.map((s, i) => {
    const beat = take.beats[s.on];
    if (beat === undefined) throw new Error(`film shot ${i + 1} cuts on beat "${s.on}", which the take does not have (it has ${Object.keys(take.beats).join(', ')})`);
    const subject = s.wide ? { x: 0, y: 0, w: 1, h: 1 } : s.subject;
    const scale = s.wide ? 'wide' : s.scale ?? scaleFor(subjectRect(subject, take)).name;
    const want = s.length ?? (scale === 'wide' ? PAYOFF : scale === 'extreme' ? ACCENT : LOOK);
    const at = Math.max(0, beat - (s.lead ?? LEAD));
    const length = Math.min(want, duration - at - 0.1);
    if (length < LENGTH.punctuation[0]) warnings.push(`shot ${i + 1} on "${s.on}" only has ${length.toFixed(1)}s of take after it; record a longer tail`);
    const out = { at: r2(at), length: r2(length), subject };
    if (s.wide) out.scale = 'wide';
    else if (s.scale) out.scale = s.scale;
    for (const key of ['diagonal', 'rack', 'push', 'turn', 'track', 'light']) if (s[key] !== undefined) out[key] = s[key];
    return out;
  });
  return { film: { take: clip.name, shots, ...(plan.ending ? { ending: plan.ending } : {}) }, warnings };
}
