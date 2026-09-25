import { loadClip, matchClips } from '../../engine/config.mjs';
import { ensureServer } from '../../engine/server.mjs';
import { record as recordTake } from '../../engine/record.mjs';
import { directOne, renderOne } from '../steps.mjs';
import { fmt } from '../util.mjs';

export const usage = 'record <project> <clip...>';
export const summary = 'record a take in the real product and rebuild its camera';
export const flags = `  --render       render straight after, instead of reviewing in the storyboard first
  --takes N      retry a rejected take up to N times
  --query k=v    add a query parameter to the page URL (repeatable)
  --masters DIR  write masters somewhere other than the workspace's masters/
  --redirect     rebuild the camera from the scenario even if it was directed in the Studio`;

export default async function record({ args: [name, ...patterns], flags, project, log }) {
  const p = await project(name);
  if (!patterns.length) throw new Error('which clips? name them, or use a glob like \'sb-feat-*\'');
  const clips = matchClips(p, patterns);
  const server = await ensureServer(p, { log });
  let failed = 0;
  try {
    for (const c of clips) {
      const clip = await loadClip(p, c);
      log(`${c}: recording`);
      try {
        const take = await recordTake(p, clip, { log, query: flags.query, takes: flags.takes && Number(flags.takes) });
        log(`  recorded ${p.workspace.rel(clip.paths.master)} (${take.master.width}x${take.master.height}, ${fmt(take.master.duration)})`);
        await directOne(p, clip, { redirect: flags.redirect });
        if (flags.render) await renderOne(p, clip);
        else log(`  next: dolly storyboard ${p.alias ?? p.name} ${c}`);
      } catch (error) {
        failed += 1;
        log(`  FAILED: ${error.message}`);
      }
    }
  } finally {
    await server.stop();
  }
  if (failed) process.exitCode = 1;
}
