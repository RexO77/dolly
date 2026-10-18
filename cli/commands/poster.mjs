import { loadClip, matchClips } from '../../engine/config.mjs';
import { poster as makePoster } from '../../engine/stages.mjs';
import { numberFlag, seconds } from '../util.mjs';
import { fileRow } from '../steps.mjs';

export const usage = 'poster <project> <clip> --at S';
export const summary = 'Take the poster from one moment of the clip';
export const details = `The next render puts the poster back on the last frame. To keep a moment for
good, set meta.poster in the scenario instead.`;
export const flags = [['--at S', 'the moment, in seconds on the clip\'s clock']];
export const examples = ['dolly poster shop shop-first --at 3.2'];

export default async function poster({ args: [name, clipName], flags, project, ui }) {
  const p = await project(name);
  const at = numberFlag(flags, 'at');
  if (!clipName || at === undefined) throw new Error(`name the clip and the moment, like \`dolly poster ${name} ${clipName ?? `${name}-first`} --at 3.2\``);
  const [match] = matchClips(p, [clipName], { recorded: true });
  const step = ui.step(`taking the poster at ${seconds(at)}`, { indent: 0 });
  const result = await makePoster(p, await loadClip(p, match), { at });
  step.done(`took the poster from ${seconds(result.t)}`);
  ui.summary([
    ['made', fileRow(ui, p, result.poster)],
    ['took', ui.took()],
    ['next', `dolly deliver ${p.alias ?? p.name} ${match}`],
  ]);
}
