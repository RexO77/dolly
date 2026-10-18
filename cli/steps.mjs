/* Steps several commands share, with their output. */
import { existsSync, statSync } from 'node:fs';
import { direct, render } from '../engine/stages.mjs';
import { ensureServer } from '../engine/server.mjs';
import { seconds } from './util.mjs';
import { bytes, duration } from './ui.mjs';

/**
 * Run `step(clip)` for each clip (a name, or a loaded clip), under a line
 * with its name. A clip that fails is reported and the rest still run; the
 * command then exits with 1. Returns what each clip that worked returned.
 */
export async function eachClip(ui, clips, step) {
  const results = [];
  let failed = 0;
  for (const clip of clips) {
    ui.header(clip.name ?? clip);
    try {
      results.push(await step(clip));
    } catch (error) {
      failed += 1;
      ui.clear();
      ui.fail(error.message);
    }
  }
  if (failed) {
    ui.line();
    ui.fail(`${failed} of ${clips.length} clip${clips.length > 1 ? 's' : ''} failed`, null, { indent: 0 });
    process.exitCode = 1;
  }
  return results;
}

/** A file for a summary: its path in the workspace, then its details, and its size when it is a video or a picture. */
export function fileRow(ui, project, path, detail) {
  const size = /\.(mp4|webp|png)$/.test(path) && existsSync(path) ? bytes(statSync(path).size) : null;
  return ui.pair(project.workspace.rel(path), [detail, size]);
}

/** Lines the engine logs (indented, `warning: ` for a warning), as notes and secondary lines. */
export function engineLog(ui) {
  return (text) => {
    const line = String(text).trim();
    if (line.startsWith('warning: ')) ui.note(line.slice('warning: '.length));
    else ui.info(line);
  };
}

/** Start the product's dev server unless it already answers, as a step. Returns {started, stop()}. */
export async function startProduct(ui, project) {
  let step = null;
  const server = await ensureServer(project, {
    log: () => {
      step = ui.step(`starting ${project.name}`, { indent: 0 });
    },
  });
  step?.done(`started ${project.name}`, [project.start.cmd, duration(step.elapsed())]);
  return server;
}

/** Render a clip as a step with a progress bar. Returns the summary rows for what it made. */
export async function renderOne(ui, project, clip) {
  const step = ui.step('rendering');
  const result = await render(project, clip, { onProgress: (done, total) => step.progress(done, total) });
  step.done('rendered', [`${result.width}x${result.height}`, seconds(result.duration), `${result.frames} frames`, `in ${duration(step.elapsed())}`]);
  result.warnings.forEach((w) => ui.note(w));
  return [fileRow(ui, project, result.out), fileRow(ui, project, result.poster)];
}

/** Rebuild a clip's camera. Returns the camera file it wrote, or null when it kept one or had none to build. */
export async function directOne(ui, project, clip, { redirect = false } = {}) {
  const step = ui.step('directing the camera');
  const result = await direct(project, clip, { redirect });
  if (!result) {
    step.clear();
    return null;
  }
  if (result.kept) {
    step.clear();
    ui.info(`kept the camera saved in the Studio (--redirect rebuilds it from the scenario)`);
    return null;
  }
  const beats = Object.entries(result.beats ?? {}).map(([label, t]) => `${label} ${Number(t).toFixed(2)}`);
  step.done('directed the camera', beats.length ? `beats ${beats.join(', ')}` : null);
  result.warnings.forEach((w) => ui.note(w));
  return result.written;
}
