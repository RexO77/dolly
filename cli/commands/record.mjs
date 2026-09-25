import { loadClip, matchClips } from '../../engine/config.mjs';
import { ensureServer } from '../../engine/server.mjs';
import { record as recordTake } from '../../engine/record.mjs';
import { directOne, eachClip, renderOne } from '../steps.mjs';
import { numberFlag, seconds } from '../util.mjs';

export const usage = 'record <project> <clip...>';
export const summary = 'Record a take and build its camera';
export const details = `Dolly starts the product if it is not running, opens it in a Chrome window
parked off screen, and plays the clip's scenario while it films. The take
goes to masters/ (the one it replaces moves to masters/<project>/.history/),
then the scenario's direction becomes the clip's camera.`;
export const flags = [
  ['--takes N', 'try each clip up to N times in all, for a flaky product (default: meta.takes, else 1)'],
  ['--render', 'render straight after, instead of checking the camera in the Studio first'],
  ['--redirect', 'rebuild the camera even if it was saved in the Studio'],
  ['--query k=v', 'add a query parameter to the page\'s URL (repeatable)'],
];
export const examples = ['dolly record shop shop-first', "dolly record shop 'settings-*' --takes 3"];

export default async function record({ args: [name, ...patterns], flags, project, log }) {
  const p = await project(name);
  if (!patterns.length) throw new Error(`name the clips to record, like \`dolly record ${name} ${name}-first\` or a glob like '${name}-*'`);
  const clips = matchClips(p, patterns);
  const takes = numberFlag(flags, 'takes', { integer: true, min: 1 });
  const server = await ensureServer(p, { log });
  try {
    await eachClip(clips, async (clipName) => {
      const clip = await loadClip(p, clipName);
      log('  recording a take, in real time');
      const take = await recordTake(p, clip, { log, query: flags.query, takes });
      log(`  recorded ${p.workspace.rel(clip.paths.master)} (${take.master.width}x${take.master.height}, ${seconds(take.master.duration)})`);
      await directOne(p, clip, { redirect: flags.redirect });
      if (flags.render) await renderOne(p, clip);
      else log(`  next: dolly studio ${p.alias ?? p.name} ${clipName}`);
    });
  } finally {
    await server.stop();
  }
}
