import { listProjects, loadClip, matchClips } from '../../engine/config.mjs';
import { status } from '../../engine/stages.mjs';

export const usage = 'list [project]';
export const summary = 'Show the projects, their clips and where each stands';
export const details = `For each clip: whether it has a scenario and a take, where its camera comes
from (its scenario, the Studio, a camera file of its own, or none, which
renders wide), and whether its render is up to date.`;

/** Where a clip's camera comes from, in words. */
function cameraOf(s) {
  if (s.studio) return 'camera saved in the Studio';
  if (s.directs) return s.camera ? 'camera from its scenario' : 'camera from its scenario, once recorded';
  return s.camera ? 'camera file of its own' : 'no camera, so wide';
}

export default async function list({ args, workspace, project, log }) {
  const names = args.length ? args : listProjects(workspace()).map((p) => p.name);
  if (!names.length) log(`no projects in ${workspace().root} yet: \`dolly init <name> --from <repo>\` adds one`);
  for (const name of names) {
    const p = await project(name);
    log(`${p.name}${p.alias ? ` (${p.alias})` : ''}  ${p.base}`);
    const clips = matchClips(p, [], { recorded: true });
    if (!clips.length) log('  no clips yet');
    const width = Math.max(0, ...clips.map((c) => c.length)) + 2;
    for (const clipName of clips) {
      const s = status(await loadClip(p, clipName));
      const marks = [
        s.scenario ? 'scenario' : 'no scenario',
        s.master ? 'recorded' : 'not recorded',
        cameraOf(s),
        s.rendered ? (s.stale ? 'RENDER OUT OF DATE' : 'rendered') : 'not rendered',
      ];
      log(`  ${clipName.padEnd(width)}${marks.join(', ')}`);
    }
  }
}
