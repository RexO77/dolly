import { loadClip, matchClips } from '../../engine/config.mjs';
import { filmFor, judgeLaunch, renderLaunch } from '../../engine/film/stages.mjs';
import { eachClip } from '../steps.mjs';
import { progress, seconds } from '../util.mjs';

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

function print(log, notes) {
  for (const n of notes) log(`  ${n.level === 'ok' ? 'ok' : 'note'}${n.shot ? `, shot ${n.shot}` : ''}: ${n.text}`);
}

export default async function film({ args: [name, ...patterns], flags, project, log }) {
  const p = await project(name);
  const clips = [];
  for (const clipName of matchClips(p, patterns, { recorded: true })) {
    const clip = await loadClip(p, clipName);
    if (clip.film || patterns.length) clips.push(clip);
  }
  if (!clips.length) {
    log(`${p.name} has no clip with a film yet: export \`film\` from a scenario (see docs/film.md)`);
    return;
  }
  await eachClip(clips, async (clip) => {
    if (flags.judge) {
      const { notes } = await judgeLaunch(p, clip, { film: filmFor(p, clip, { redirect: flags.redirect }).film });
      print(log, notes);
      return;
    }
    const result = await renderLaunch(p, clip, { redirect: flags.redirect, onProgress: progress(clip.name) });
    log(`  rendered ${p.workspace.rel(result.out)} (${seconds(result.duration)}) and its poster`);
    result.warnings.forEach((w) => log(`  warning: ${w}`));
    print(log, result.notes);
  });
}
