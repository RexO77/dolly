/* Steps several commands run, with their output. */
import { direct, render } from '../engine/stages.mjs';
import { fmt, log, progress } from './util.mjs';

export async function renderOne(p, clip) {
  const r = await render(p, clip, { onProgress: progress(clip.name) });
  log(`  rendered ${p.workspace.rel(r.out)} (${r.width}x${r.height}, ${fmt(r.duration)}) and its poster`);
  r.warnings.forEach((w) => log(`  warning: ${w}`));
}

export async function directOne(p, clip, { redirect = false } = {}) {
  const d = await direct(p, clip, { redirect });
  if (!d) return;
  log(`  ${d.kept ? 'kept' : 'directed'} ${p.workspace.rel(d.written)}`);
  if (d.beats) log(`  beats ${Object.entries(d.beats).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  d.warnings.forEach((w) => log(`  warning: ${w}`));
}
