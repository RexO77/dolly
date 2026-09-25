import { loadClip, matchClips } from '../../engine/config.mjs';
import { poster as makePoster } from '../../engine/stages.mjs';
import { numberFlag, seconds } from '../util.mjs';

export const usage = 'poster <project> <clip> --at S';
export const summary = 'Take the poster from one moment of the clip';
export const details = `The next render puts the poster back on the last frame. To keep a moment for
good, set meta.poster in the scenario instead.`;
export const flags = [['--at S', 'the moment, in seconds on the clip\'s clock']];
export const examples = ['dolly poster shop shop-first --at 3.2'];

export default async function poster({ args: [name, clipName], flags, project, log }) {
  const p = await project(name);
  const at = numberFlag(flags, 'at');
  if (!clipName || at === undefined) throw new Error(`name the clip and the moment, like \`dolly poster ${name} ${clipName ?? `${name}-first`} --at 3.2\``);
  const [match] = matchClips(p, [clipName], { recorded: true });
  const result = await makePoster(p, await loadClip(p, match), { at });
  log(`wrote ${p.workspace.rel(result.poster)} from ${seconds(result.t)}`);
}
