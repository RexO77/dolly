/* Steps several commands share, with their output. */
import { direct, render } from '../engine/stages.mjs';
import { log, progress, seconds } from './util.mjs';

/**
 * Run `step(clip)` for each clip (a name, or a loaded clip), under a line
 * with its name. A clip that fails is reported and the rest still run; the
 * command then exits with 1.
 */
export async function eachClip(clips, step) {
  let failed = 0;
  for (const clip of clips) {
    log(clip.name ?? clip);
    try {
      await step(clip);
    } catch (error) {
      failed += 1;
      log(`  FAILED: ${error.message}`);
    }
  }
  if (failed) {
    log(`\n${failed} of ${clips.length} clip${clips.length > 1 ? 's' : ''} failed.`);
    process.exitCode = 1;
  }
}

export async function renderOne(project, clip) {
  const result = await render(project, clip, { onProgress: progress(clip.name) });
  log(`  rendered ${project.workspace.rel(result.out)} (${result.width}x${result.height}, ${seconds(result.duration)}) and its poster`);
  result.warnings.forEach((w) => log(`  warning: ${w}`));
}

export async function directOne(project, clip, { redirect = false } = {}) {
  const result = await direct(project, clip, { redirect });
  if (!result) return;
  if (result.kept) {
    log(`  kept ${project.workspace.rel(result.written)}: it was saved in the Studio (--redirect rebuilds it from the scenario)`);
    return;
  }
  log(`  directed ${project.workspace.rel(result.written)}`);
  if (result.beats) log(`  beats: ${Object.entries(result.beats).map(([label, t]) => `${label} ${t}`).join(', ')}`);
  result.warnings.forEach((w) => log(`  warning: ${w}`));
}
