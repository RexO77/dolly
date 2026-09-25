import { loadClip, matchClips } from '../../engine/config.mjs';
import { directOne } from '../steps.mjs';

export const usage = 'direct <project> [clip...]';
export const summary = 'rebuild camera files from the saved takes, without re-recording';

export const flags = `  --redirect     rebuild cameras directed in the Studio too (they are kept by default)`;

export default async function direct({ args: [name, ...patterns], flags, project, log }) {
  const p = await project(name);
  for (const c of matchClips(p, patterns, { recorded: true })) {
    const clip = await loadClip(p, c);
    if (!clip.direction && !clip.camera) continue;
    log(`${c}:`);
    await directOne(p, clip, { redirect: flags.redirect });
  }
}
