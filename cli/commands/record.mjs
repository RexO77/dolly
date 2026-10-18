import { existsSync } from 'node:fs';
import { loadClip, matchClips } from '../../engine/config.mjs';
import { readJson } from '../../engine/files.mjs';
import { record as recordTake } from '../../engine/record.mjs';
import { directOne, eachClip, engineLog, fileRow, renderOne, startProduct } from '../steps.mjs';
import { numberFlag, seconds } from '../util.mjs';
import { duration } from '../ui.mjs';

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

/** The page's address as a person reads it: no scheme. */
const address = (url) => url.replace(/^https?:\/\//, '');

/**
 * Record one clip as steps: open the page, film (on the take's clock, out
 * of the last take's length when there was one), stitch, then direct its
 * camera and, with --render, render it. Returns its summary rows.
 */
async function recordOne(ui, p, clip, { flags, takes }) {
  const last = existsSync(clip.paths.take) ? readJson(clip.paths.take).master?.duration : null;
  const run = ui.sequence();
  const log = engineLog(ui);
  let ticking = null;
  let take;
  try {
    take = await recordTake(p, clip, {
      query: flags.query,
      takes,
      log(text) {
        /* A rejected take ends the step it was on; the next try starts again from the page. */
        if (/take \d+ of \d+ rejected/.test(text)) {
          clearInterval(ticking);
          run.fail();
        }
        log(text);
      },
      onStep(name, info) {
        if (name === 'open') run.next('opening the page', { done: 'opened the page', detail: (step) => [address(info.url), duration(step.elapsed())] });
        if (name === 'film') {
          const step = run.next('filming', { done: 'filmed the take' });
          ticking = setInterval(() => step.update(`filming  ${seconds(info.now())}${last ? ui.dim(` of about ${seconds(last)}`) : ''}`), 100);
          ticking.unref();
        }
        if (name === 'stitch') {
          clearInterval(ticking);
          run.next('stitching the master', { done: 'stitched the master', detail: () => [`${take.master.width}x${take.master.height}`, seconds(take.master.duration)] });
        }
      },
    });
  } finally {
    clearInterval(ticking);
  }
  run.end();
  const made = [fileRow(ui, p, clip.paths.master)];
  const camera = await directOne(ui, p, clip, { redirect: flags.redirect });
  if (camera) made.push(fileRow(ui, p, camera));
  if (flags.render) made.push(...(await renderOne(ui, p, clip)));
  return made;
}

export default async function record({ args: [name, ...patterns], flags, project, ui }) {
  const p = await project(name);
  if (!patterns.length) throw new Error(`name the clips to record, like \`dolly record ${name} ${name}-first\` or a glob like '${name}-*'`);
  const clips = matchClips(p, patterns);
  const takes = numberFlag(flags, 'takes', { integer: true, min: 1 });
  const server = await startProduct(ui, p);
  const handle = p.alias ?? p.name;
  try {
    const made = await eachClip(ui, clips, async (clipName) => recordOne(ui, p, await loadClip(p, clipName), { flags, takes }));
    if (!made.length) return;
    const which = clips.length === 1 ? ` ${clips[0]}` : '';
    ui.summary([
      ['made', made.flat()],
      ['took', ui.took()],
      ['next', flags.render ? `dolly deliver ${handle}${which}` : `dolly studio ${handle}${which}`],
    ]);
  } finally {
    await server.stop();
  }
}
