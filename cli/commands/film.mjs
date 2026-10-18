import { loadClip, matchClips } from '../../engine/config.mjs';
import { filmFor, judgeLaunch, renderLaunch } from '../../engine/film/stages.mjs';
import { measure } from '../../engine/film/judge.mjs';
import { JUDGE } from '../../engine/film/grammar.mjs';
import { eachClip, fileRow } from '../steps.mjs';
import { seconds } from '../util.mjs';
import { columns, duration } from '../ui.mjs';

export const usage = 'film <project> [clip...]';
export const summary = 'Make a clip\'s launch film: hero shots in a black void, cut hard';
export const details = `Launch mode. Each shot is a steep, close look at the real UI floating in
black: a thin band in focus, light falling off into the dark, a slow drift,
cut on the action, ending on one line of copy and a still logo, at 24 fps.

The shots come from the scenario's \`film\` (the beats to cut on and the
boxes to look at), written to films/<clip>.film.json, where you can edit
them; a film saved in the Studio is kept unless --redirect. The film renders
to out/<clip>-film.mp4 with its poster, then the judge reads every shot.
Record launch takes with viewport.dpr 4, colorScheme 'dark' and slow 4.`;
export const flags = [
  ['--judge', 'only judge the film: render each shot\'s middle frame and print the notes'],
  ['--redirect', 'direct the film again from the scenario, even if it was saved in the Studio'],
];
export const examples = ['dolly film shop shop-launch', 'dolly film shop shop-launch --judge'];

const tenths = (s) => `${s.toFixed(1)}s`;
const percent = (v, digits = 0) => `${(v * 100).toFixed(digits)}%`;

/** Where the film spec came from: its file, and whether it was directed now or kept from the Studio. */
function origin(project, clip, directed) {
  const file = project.workspace.rel(clip.paths.film);
  if (directed.kept) return [file, 'saved in the Studio, so kept (--redirect directs it again)'];
  return [file, directed.written ? 'directed from the scenario' : null];
}

/**
 * The judge's report: a row per shot (where it cuts in, its scale and
 * length, and what its middle frame measures, in amber when it is off),
 * each shot's notes under it, the notes on the whole film after it, and
 * the verdict last.
 */
function report(ui, { shots, frames, notes }) {
  const [lo, hi] = JUDGE.luminance;
  const rows = shots.map((shot, i) => {
    const m = measure(frames[i].frame, frames[i].width, frames[i].height);
    const light = percent(m.luminance, 1);
    const black = percent(m.black);
    return [
      String(i + 1),
      tenths(shot.cut),
      shot.scale,
      tenths(shot.length),
      m.luminance < lo || m.luminance > hi ? ui.amber(light) : light,
      m.black < JUDGE.black && shot.scale !== 'wide' ? ui.amber(black) : black,
    ];
  });
  const [head, ...lines] = columns([['shot', 'at', 'scale', 'length', 'light', 'black'], ...rows], { align: ['right', 'right', 'left', 'right', 'right', 'right'] });
  const warnings = notes.filter((n) => n.level !== 'ok');
  const under = { indent: 2 + 'shot'.length + 2 };
  ui.line();
  ui.line(`  ${ui.dim(head)}`);
  lines.forEach((text, i) => {
    ui.line(`  ${text}`);
    warnings.filter((n) => n.shot === i + 1).forEach((n) => ui.note(n.text, null, under));
  });
  warnings.filter((n) => !n.shot).forEach((n) => ui.note(n.text));
  ui.line();
  if (warnings.length) ui.note(`${warnings.length} note${warnings.length > 1 ? 's' : ''} on this cut: change the film in the Studio or in its film file, then judge it again`);
  else notes.forEach((n) => ui.ok(n.text));
  return warnings.length;
}

/** Judge a film without rendering it: a still per shot, then the report. */
async function judgeOnly(ui, p, clip, redirect) {
  const directed = filmFor(p, clip, { redirect });
  ui.ok('film', origin(p, clip, directed));
  directed.warnings.forEach((w) => ui.note(w));
  const run = ui.sequence();
  const judged = await judgeLaunch(p, clip, {
    film: directed.film,
    onStep: (_, { index, shots }) => run.next(`judging shot ${index + 1}/${shots}`, { transient: true }),
  });
  run.end();
  ui.ok(`judged ${judged.shots.length} shots`, ['a still from the middle of each', duration(ui.elapsed())]);
  return { clip, noted: report(ui, judged) };
}

/** Render a film: the spec, a step per shot with the frames to go, the ending, sound and poster, then the judge. */
async function renderOnly(ui, p, clip, redirect) {
  const run = ui.sequence();
  const began = Date.now();
  let frames = 0;
  let shotStart = 0;
  const result = await renderLaunch(p, clip, {
    redirect,
    onProgress(done, total) {
      frames = done;
      run.step?.progress(done, total, { since: began });
    },
    onStep(name, info) {
      if (name === 'film') {
        ui.ok('film', origin(p, clip, info));
        info.warnings.forEach((w) => ui.note(w));
      } else if (name === 'shot') {
        const { index, shots, shot } = info;
        run.next(`shot ${index + 1}/${shots} ${shot.scale}`, {
          done: `shot ${index + 1}/${shots}`,
          detail: (step) => [shot.scale, tenths(shot.length), `${frames - shotStart} frames`, `in ${duration(step.elapsed())}`],
        });
        shotStart = frames;
      } else if (name === 'ending') run.next('setting the ending', { done: 'ending', detail: () => 'the copy and the logo' });
      else if (name === 'sound') run.next('laying the sound', { done: 'sound', detail: () => 'the hand\'s presses and keys' });
      else if (name === 'poster') run.next('taking the poster', { done: 'poster' });
      else if (name === 'judge') {
        const last = info.index + 1 === info.shots;
        run.next(`judging shot ${info.index + 1}/${info.shots}`, last ? { done: `judged ${info.shots} shots` } : { transient: true });
      }
    },
  });
  run.end();
  return { clip, result, noted: report(ui, { shots: result.shots, frames: result.stills, notes: result.notes }) };
}

export default async function film({ args: [name, ...patterns], flags, project, ui }) {
  const p = await project(name);
  const handle = p.alias ?? p.name;
  const clips = [];
  for (const clipName of matchClips(p, patterns, { recorded: true })) {
    const clip = await loadClip(p, clipName);
    if (clip.film || patterns.length) clips.push(clip);
  }
  if (!clips.length) {
    ui.line(ui.code(`${p.name} has no clip with a film yet: export \`film\` from a scenario (see docs/film.md)`));
    return;
  }
  const done = await eachClip(ui, clips, (clip) => (flags.judge ? judgeOnly(ui, p, clip, flags.redirect) : renderOnly(ui, p, clip, flags.redirect)));
  if (!done.length) return;
  const noted = done.find((d) => d.noted);
  const one = (d) => `${handle} ${d.clip.name}`;
  ui.summary([
    ['made', done.filter((d) => d.result).flatMap(({ result }) => [
      fileRow(ui, p, result.out, [seconds(result.duration), `${result.frames} frames`]),
      fileRow(ui, p, result.poster),
    ])],
    ['took', ui.took()],
    ['next', noted ? `dolly studio ${one(noted)}` : flags.judge ? `dolly film ${one(done[0])}` : `dolly studio ${one(done[0])}`],
  ]);
}
