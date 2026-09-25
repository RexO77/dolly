import { existsSync } from 'node:fs';
import { loadClip, matchClips } from '../../engine/config.mjs';
import { renderOne } from '../steps.mjs';

export const usage = 'render <project> [clip...]';
export const summary = 'the master through its camera, to out/: the clip and its poster';
export const flags = `  --out DIR      render somewhere other than the workspace's out/`;

export default async function render({ args: [name, ...patterns], project, log }) {
  const p = await project(name);
  for (const c of matchClips(p, patterns, { recorded: true })) {
    const clip = await loadClip(p, c);
    if (!existsSync(clip.paths.master)) {
      log(`${c}: no master, skipped`);
      continue;
    }
    log(`${c}:`);
    await renderOne(p, clip);
  }
}
