import { existsSync } from 'node:fs';
import { loadClip, matchClips } from '../../engine/config.mjs';
import { eachClip, renderOne } from '../steps.mjs';

export const usage = 'render <project> [clip...]';
export const summary = 'Render clips and their posters into out/';
export const details = `Every frame of the take goes through the clip's camera and into a web-ready
MP4, with a WebP poster from its last frame (or meta.poster). Without clip
names, every recorded clip renders.`;
export const examples = ['dolly render shop shop-first', 'dolly render shop'];

export default async function render({ args: [name, ...patterns], project, ui }) {
  const p = await project(name);
  const handle = p.alias ?? p.name;
  const clips = matchClips(p, patterns, { recorded: true });
  const recorded = [];
  for (const clipName of clips) {
    const clip = await loadClip(p, clipName);
    if (existsSync(clip.paths.master)) recorded.push(clip);
    else if (patterns.length) ui.info(`${clipName}: not recorded yet, skipped (\`dolly record ${handle} ${clipName}\`)`, null, { indent: 0 });
  }
  if (!recorded.length) {
    if (!patterns.length) ui.line(ui.code(`${p.name} has no recorded clips yet: \`dolly record\` makes one`));
    return;
  }
  const made = await eachClip(ui, recorded, (clip) => renderOne(ui, p, clip));
  if (!made.length) return;
  ui.summary([
    ['made', made.flat()],
    ['took', ui.took()],
    ['next', `dolly deliver ${handle}${made.length === recorded.length && recorded.length === 1 ? ` ${recorded[0].name}` : ''}`],
  ]);
}
