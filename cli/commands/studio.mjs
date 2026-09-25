import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadClip, matchClips } from '../../engine/config.mjs';
import { specFor } from '../../engine/stages.mjs';
import { storyboard as shotList, formatStoryboard } from '../../engine/storyboard.mjs';
import { readJson } from '../../engine/files.mjs';
import { startStudio } from '../../engine/studio.mjs';
import { numberFlag } from '../util.mjs';

export const usage = 'studio <project> [clip]';
export const summary = 'Watch, direct and render a clip in the Studio';
export const details = `The Studio plays the take through its camera live, with the same code the
render uses, so what you see is what you get. Save writes the clip's camera
file; Render makes the clip. It runs until you press ctrl-c. With --text it
prints each clip's shot list instead, beats and all.`;
export const flags = [
  ['--port N', 'serve on port N (default 4800)'],
  ['--open', 'open it in your browser'],
  ['--text', 'print the shot list instead of opening the Studio'],
  ['--dev', 'serve the Studio from its source, for working on Dolly itself'],
];
export const examples = ['dolly studio shop shop-first --open', 'dolly studio shop --text'];
export const aliases = ['storyboard'];

/** Open a URL in the default browser, on macOS, Windows or Linux. */
function openInBrowser(url, log) {
  const [cmd, ...args] = process.platform === 'darwin' ? ['open', url]
    : process.platform === 'win32' ? ['cmd', '/c', 'start', '', url]
      : ['xdg-open', url];
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
  child.on('error', () => log(`could not open a browser; open ${url} yourself`));
  child.unref();
}

async function printShotLists(p, patterns, log) {
  for (const name of matchClips(p, patterns, { recorded: true })) {
    const clip = await loadClip(p, name);
    const take = existsSync(clip.paths.take) ? readJson(clip.paths.take) : null;
    const spec = specFor(clip);
    const from = existsSync(clip.paths.camera) ? p.workspace.rel(clip.paths.camera) : 'no camera file, so wide throughout';
    log(`${name}  (${from}${take ? '' : '; no take file, so no beats'})`);
    if (spec.source?.cut) log(`  cuts ${spec.source.cut.from}s to ${spec.source.cut.to}s of the master, with a ${spec.source.cut.fade ?? 0.25}s crossfade`);
    if (spec.source?.end) log(`  ends at ${spec.source.end}s of the master`);
    log(`${formatStoryboard(shotList(spec, take))}\n`);
  }
}

export default async function studio({ args: [name, ...patterns], flags, project, log }) {
  const p = await project(name);
  if (flags.text) return printShotLists(p, patterns, log);
  const clip = patterns[0] && matchClips(p, [patterns[0]], { recorded: true })[0];
  const port = numberFlag(flags, 'port', { integer: true, min: 1 }) ?? 4800;
  let url;
  try {
    ({ url } = await startStudio(p, { port, log, dev: Boolean(flags.dev) }));
  } catch (error) {
    if (error.code === 'EADDRINUSE') throw new Error(`port ${port} is taken (another Studio, maybe); stop it, or pass --port ${port + 1}`, { cause: error });
    throw error;
  }
  const address = clip ? `${url}/?clip=${encodeURIComponent(clip)}` : url;
  log(`the Studio for ${p.name} is at ${address}\npress ctrl-c to stop it`);
  if (flags.open) openInBrowser(address, log);
  return new Promise(() => {});
}
