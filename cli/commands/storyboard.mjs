import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { loadClip, matchClips } from '../../engine/config.mjs';
import { specFor } from '../../engine/stages.mjs';
import { storyboard as rows, formatStoryboard } from '../../engine/storyboard.mjs';
import { startStudio } from '../../engine/studio.mjs';

export const usage = 'storyboard <project> [clip]';
export const summary = 'open the storyboard: watch the camera over the real take, direct it, render it';
export const flags = `  --port N       serve on port N (4800)
  --open         open it in the default browser
  --text         print the shot list instead
  --dev          serve the Studio live from its source (working on Dolly itself)`;

export default async function storyboard({ args: [name, ...patterns], flags, project, log }) {
  const p = await project(name);
  if (!flags.text) {
    const { url } = await startStudio(p, { port: Number(flags.port ?? 4800), log, dev: Boolean(flags.dev) });
    const open = patterns[0] ? `${url}/?clip=${encodeURIComponent(patterns[0])}` : url;
    log(`storyboard for ${p.name}: ${open}\n(ctrl-c to stop)`);
    if (flags.open) execFileSync('open', [open]);
    return new Promise(() => {});
  }
  for (const c of matchClips(p, patterns, { recorded: true })) {
    const clip = await loadClip(p, c);
    const take = existsSync(clip.paths.take) ? JSON.parse(readFileSync(clip.paths.take, 'utf8')) : null;
    const spec = specFor(clip);
    const from = existsSync(clip.paths.camera) ? p.workspace.rel(clip.paths.camera) : 'no camera file, wide throughout';
    log(`${c}  (${from}${take ? '' : '; no take, so no beats'})`);
    if (spec.source?.cut) log(`  cut ${spec.source.cut.from}s to ${spec.source.cut.to}s of the master, fade ${spec.source.cut.fade ?? 0.25}s`);
    if (spec.source?.end) log(`  master trimmed at ${spec.source.end}s`);
    log(`${formatStoryboard(rows(spec, take))}\n`);
  }
}
