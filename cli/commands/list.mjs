import { listProjects, loadClip, matchClips } from '../../engine/config.mjs';
import { status } from '../../engine/stages.mjs';

export const usage = 'list [project]';
export const summary = 'projects, their clips, and where each stands';

export default async function list({ args, workspace, project, log }) {
  const names = args.length ? args : listProjects(workspace()).map((p) => p.name);
  if (!names.length) log(`no projects in ${workspace().root} yet: \`dolly init <name>\` adds one`);
  for (const name of names) {
    const p = await project(name);
    log(`${p.name}${p.alias ? ` (${p.alias})` : ''}  ${p.base}`);
    for (const c of matchClips(p, [], { recorded: true })) {
      const s = status(await loadClip(p, c));
      const marks = [
        s.scenario ? 'scenario' : 'no scenario',
        s.master ? 'recorded' : 'not recorded',
        s.directs ? (s.take ? 'directs' : 'directs, no take') : s.camera ? 'hand camera' : 'wide',
        s.rendered ? (s.stale ? 'STALE render' : 'rendered') : 'not rendered',
      ];
      log(`  ${c.padEnd(30)} ${marks.join(', ')}`);
    }
  }
}
