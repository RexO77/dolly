import { loadClip, matchClips } from '../../engine/config.mjs';
import { directOne, eachClip, fileRow } from '../steps.mjs';

export const usage = 'direct <project> [clip...]';
export const summary = 'Rebuild cameras from saved takes, without recording';
export const details = `Run it after changing a scenario's direction or camera(). A camera saved in
the Studio is kept unless you pass --redirect. Without clip names, every
clip whose scenario directs its camera is rebuilt.`;
export const flags = [['--redirect', 'rebuild cameras saved in the Studio too, discarding what was directed there']];
export const examples = ['dolly direct shop shop-first', 'dolly direct shop --redirect'];

export default async function direct({ args: [name, ...patterns], flags, project, ui }) {
  const p = await project(name);
  const directed = [];
  for (const clipName of matchClips(p, patterns, { recorded: true })) {
    const clip = await loadClip(p, clipName);
    if (clip.direction || clip.camera) directed.push(clip);
    else if (patterns.length) ui.info(`${clipName}: its scenario has no direction or camera(), so there is nothing to direct`, null, { indent: 0 });
  }
  const written = (await eachClip(ui, directed, (clip) => directOne(ui, p, clip, { redirect: flags.redirect }))).filter(Boolean);
  if (!written.length) return;
  const handle = p.alias ?? p.name;
  ui.summary([
    ['made', written.map((file) => fileRow(ui, p, file))],
    ['took', ui.took()],
    ['next', `dolly studio ${handle}${directed.length === 1 ? ` ${directed[0].name}` : ''}`],
  ]);
}
