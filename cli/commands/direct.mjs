import { loadClip, matchClips } from '../../engine/config.mjs';
import { directOne, eachClip } from '../steps.mjs';

export const usage = 'direct <project> [clip...]';
export const summary = 'Rebuild cameras from saved takes, without recording';
export const details = `Run it after changing a scenario's direction or camera(). A camera saved in
the Studio is kept unless you pass --redirect. Without clip names, every
clip whose scenario directs its camera is rebuilt.`;
export const flags = [['--redirect', 'rebuild cameras saved in the Studio too, discarding what was directed there']];
export const examples = ['dolly direct shop shop-first', 'dolly direct shop --redirect'];

export default async function direct({ args: [name, ...patterns], flags, project, log }) {
  const p = await project(name);
  const directed = [];
  for (const clipName of matchClips(p, patterns, { recorded: true })) {
    const clip = await loadClip(p, clipName);
    if (clip.direction || clip.camera) directed.push(clip);
    else if (patterns.length) log(`${clipName}: its scenario has no direction or camera(), so there is nothing to direct`);
  }
  await eachClip(directed, (clip) => directOne(p, clip, { redirect: flags.redirect }));
}
