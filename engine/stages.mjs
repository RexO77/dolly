/**
 * The stages after a take, each re-runnable on its own from what the last
 * one wrote, so a camera can be re-directed or a clip re-cut without
 * re-recording:
 *
 *   direct   take (masters/)        -> camera spec (projects/<p>/cameras/)
 *   render   master + camera spec   -> clip and poster (out/)
 *   poster   master + camera spec   -> poster from one moment (out/)
 *   deliver  out/                   -> the folder project.json names
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tools, fromDirection } from './direct.mjs';
import { render as renderClip, renderStill } from './render.mjs';
import { writeWebp, probe } from './ffmpeg.mjs';
import { resample } from './camera/resample.mjs';

const WIDE = { camera: [{ t: 0, wide: true }] };
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

function needMaster(project, clip) {
  if (!existsSync(clip.paths.master)) throw new Error(`${clip.name} has no master yet: record it first (${project.workspace.rel(clip.paths.master)})`);
}

/**
 * Rebuild a clip's camera spec from its take. Returns {written, warnings},
 * or null for a clip with no camera. A camera directed in the Studio is kept
 * unless `redirect` says to rebuild it: hand direction is never overwritten
 * silently.
 */
export async function direct(project, clip, { redirect = false } = {}) {
  if (!clip.direction && !clip.camera) return null;
  needMaster(project, clip);
  if (!redirect && existsSync(clip.paths.camera) && readJson(clip.paths.camera).directed === 'studio') {
    return { written: clip.paths.camera, kept: true, warnings: ['kept the camera directed in the Studio; pass --redirect to rebuild it from the scenario'] };
  }
  if (!existsSync(clip.paths.take)) throw new Error(`${clip.name} has a master but no take file, so its camera cannot be rebuilt; edit ${project.workspace.rel(clip.paths.camera)} by hand or re-record`);
  const take = readJson(clip.paths.take);
  const built = clip.direction
    ? await fromDirection(clip.paths.master, take, clip.direction)
    : await clip.camera(take, tools(clip.paths.master, take));
  const spec = built.spec ?? built;
  mkdirSync(project.paths.cameras, { recursive: true });
  writeFileSync(clip.paths.camera, `${JSON.stringify(spec, null, 2)}\n`);
  return { written: clip.paths.camera, warnings: built.warnings ?? [], beats: built.beats };
}

/** The camera spec a clip renders with: its camera file, or wide throughout. */
export function specFor(clip) {
  return existsSync(clip.paths.camera) ? readJson(clip.paths.camera) : WIDE;
}

/** Master pixels per CSS pixel, from the take when there is one. */
function cssScale(clip) {
  if (existsSync(clip.paths.take)) {
    const take = readJson(clip.paths.take);
    if (take.viewport?.dpr) return take.viewport.dpr;
  }
  return probe(clip.paths.master).width / clip.meta.viewport.width;
}

function outputOptions(project, clip) {
  const { poster, ...rest } = { ...project.preset, ...clip.meta.output };
  return { ...rest, posterOpts: { ...project.preset.poster, ...poster } };
}

/** Master + camera spec to out/. */
export async function render(project, clip, { onProgress } = {}) {
  needMaster(project, clip);
  const { posterOpts, ...opts } = outputOptions(project, clip);
  return renderClip({
    master: clip.paths.master,
    spec: specFor(clip),
    out: clip.paths.out,
    ...opts,
    css: cssScale(clip),
    poster: { ...posterOpts, path: clip.paths.poster, at: clip.meta.poster },
    onProgress,
  });
}

/** A poster from one moment (seconds on the clip's clock), without re-rendering the clip. */
export async function poster(project, clip, { at }) {
  needMaster(project, clip);
  const { posterOpts, ...opts } = outputOptions(project, clip);
  const still = await renderStill({ master: clip.paths.master, spec: specFor(clip), t: at, ...opts, css: cssScale(clip) });
  const pw = posterOpts.width ?? 1440;
  const ph = Math.round((pw * still.height) / still.width);
  mkdirSync(project.paths.out, { recursive: true });
  writeWebp(resample(still.frame, still.width, still.height, pw, ph, [0, 0, still.width, still.height]), pw, ph, clip.paths.poster, posterOpts.quality);
  return { poster: clip.paths.poster, t: still.t };
}

const hash = (p) => createHash('sha1').update(readFileSync(p)).digest('hex');

/**
 * Copy a clip's rendered files to the folder its project names for it.
 * Files already there are only replaced with `overwrite`, since delivered
 * files are shipped.
 */
export function deliver(project, clip, { overwrite = false } = {}) {
  const key = clip.meta.deliver;
  const dir = project.deliver[key];
  if (!dir) throw new Error(`${project.name}/project.json has no deliver folder "${key}" for ${clip.name}`);
  const files = [clip.paths.out, clip.paths.poster].filter(existsSync);
  if (!files.length) throw new Error(`${clip.name} has nothing rendered to deliver: render it first`);
  const done = [];
  const held = [];
  for (const file of files) {
    const to = join(dir, file.split('/').pop());
    if (existsSync(to) && hash(to) === hash(file)) continue;
    if (existsSync(to) && !overwrite) {
      held.push(to);
      continue;
    }
    mkdirSync(dir, { recursive: true });
    copyFileSync(file, to);
    done.push(to);
  }
  return { done, held };
}

/** Where a clip stands: what exists, and whether the render is older than what it is made from. */
export function status(clip) {
  const mtime = (p) => (existsSync(p) ? statSync(p).mtimeMs : null);
  const master = mtime(clip.paths.master);
  const camera = mtime(clip.paths.camera);
  const out = mtime(clip.paths.out);
  return {
    scenario: Boolean(clip.file),
    master: Boolean(master),
    take: existsSync(clip.paths.take),
    camera: Boolean(camera),
    directs: Boolean(clip.direction || clip.camera),
    rendered: Boolean(out),
    stale: Boolean(out && (out < master || (camera && out < camera))),
  };
}
