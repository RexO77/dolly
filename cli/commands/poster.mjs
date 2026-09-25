import { loadClip } from '../../engine/config.mjs';
import { poster as posterAt } from '../../engine/stages.mjs';
import { fmt } from '../util.mjs';

export const usage = 'poster <project> <clip> --at S';
export const summary = 'the poster from S seconds into the clip (the default is its last frame)';

export default async function poster({ args: [name, c], flags, project, log }) {
  const p = await project(name);
  if (!c || flags.at === undefined) throw new Error('usage: dolly poster <project> <clip> --at <seconds>');
  const r = await posterAt(p, await loadClip(p, c), { at: Number(flags.at) });
  log(`wrote ${p.workspace.rel(r.poster)} from ${fmt(r.t)}`);
}
