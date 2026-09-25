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
import { existsSync, statSync } from 'node:fs';
import { tools, fromDirection } from './direct.mjs';
import { render as renderClip, renderPoster } from './render.mjs';
import { probe } from './ffmpeg.mjs';
import { deliverFiles, readJson, writeJson } from './files.mjs';
import { deliverFolder } from './config.mjs';

/** The camera a clip without a camera file renders with: wide throughout. */
const WIDE = { camera: [{ t: 0, wide: true }] };

function requireMaster(project, clip) {
  if (!existsSync(clip.paths.master)) {
    throw new Error(`${clip.name} has not been recorded yet (no ${project.workspace.rel(clip.paths.master)}); run \`dolly record ${project.name} ${clip.name}\` first`);
  }
}

/** Whether a clip's camera file was saved in the Studio, which a re-direct must not overwrite silently. */
const directedInStudio = (clip) => existsSync(clip.paths.camera) && readJson(clip.paths.camera).directed === 'studio';

/**
 * Rebuild a clip's camera spec from its take. Returns {written, kept?,
 * warnings, beats?}, or null for a clip whose scenario has no camera. A
 * camera saved in the Studio is kept unless `redirect` says to rebuild it.
 */
export async function direct(project, clip, { redirect = false } = {}) {
  if (!clip.direction && !clip.camera) return null;
  requireMaster(project, clip);
  if (!redirect && directedInStudio(clip)) {
    return { written: clip.paths.camera, kept: true, warnings: ['kept the camera saved in the Studio; pass --redirect to rebuild it from the scenario'] };
  }
  if (!existsSync(clip.paths.take)) {
    throw new Error(`${clip.name} has a master but no take file, so its camera cannot be rebuilt; record it again, or edit ${project.workspace.rel(clip.paths.camera)} by hand`);
  }
  const take = readJson(clip.paths.take);
  const built = clip.direction
    ? await fromDirection(clip.paths.master, take, clip.direction)
    : await clip.camera(take, tools(clip.paths.master, take));
  /* The beats as the viewer sees them (synced to the picture, moved by cuts) travel with the camera, so the Studio snaps to what is on screen. */
  const spec = built.spec ?? built;
  writeJson(clip.paths.camera, built.beats ? { ...spec, beats: built.beats } : spec);
  return { written: clip.paths.camera, warnings: built.warnings ?? [], beats: built.beats };
}

/** The camera spec a clip renders with: its camera file, or wide throughout. */
export function specFor(clip) {
  return existsSync(clip.paths.camera) ? readJson(clip.paths.camera) : WIDE;
}

/** Master pixels per CSS pixel, from the take when there is one. */
function cssScale(clip) {
  const dpr = existsSync(clip.paths.take) && readJson(clip.paths.take).viewport?.dpr;
  return dpr || probe(clip.paths.master).width / clip.meta.viewport.width;
}

/** The project's preset with the clip's `meta.output` over it, and the poster's options apart. */
function outputOptions(project, clip) {
  const { poster, ...video } = { ...project.preset, ...clip.meta.output };
  return { video, poster: { ...project.preset.poster, ...poster } };
}

/** Master + camera spec to out/: the clip and its poster. */
export async function render(project, clip, { onProgress } = {}) {
  requireMaster(project, clip);
  const { video, poster } = outputOptions(project, clip);
  return renderClip({
    master: clip.paths.master,
    spec: specFor(clip),
    out: clip.paths.out,
    ...video,
    css: cssScale(clip),
    poster: { ...poster, path: clip.paths.poster, at: clip.meta.poster },
    onProgress,
  });
}

/** A poster from one moment (seconds on the clip's clock), without rendering the clip again. */
export async function poster(project, clip, { at }) {
  requireMaster(project, clip);
  const { video, poster: options } = outputOptions(project, clip);
  return renderPoster({
    master: clip.paths.master,
    spec: specFor(clip),
    t: at,
    width: video.width,
    size: video.size,
    css: cssScale(clip),
    poster: { ...options, path: clip.paths.poster },
  });
}

/**
 * Copy a clip's render and poster to the folder its project names for it
 * (`meta.deliver`). A delivered file that differs is shipped, so it is only
 * replaced with `overwrite`. Returns {copied, same, held}.
 */
export function deliver(project, clip, { overwrite = false } = {}) {
  const dir = deliverFolder(project, clip.meta.deliver, clip.name);
  const files = [clip.paths.out, clip.paths.poster].filter((file) => existsSync(file));
  if (!files.length) throw new Error(`${clip.name} has nothing rendered to deliver; run \`dolly render ${project.name} ${clip.name}\` first`);
  return deliverFiles(files, dir, { overwrite });
}

/**
 * `directedInStudio` for a status line: a camera file too broken to read
 * is reported where it is used, so one bad file never hides a project's clips.
 */
function savedInStudio(clip) {
  try {
    return directedInStudio(clip);
  } catch {
    return false;
  }
}

/** Where a clip stands: what exists, who directed its camera, and whether the render is older than what it is made from. */
export function status(clip) {
  const mtime = (path) => (existsSync(path) ? statSync(path).mtimeMs : null);
  const master = mtime(clip.paths.master);
  const camera = mtime(clip.paths.camera);
  const out = mtime(clip.paths.out);
  return {
    scenario: Boolean(clip.file),
    master: Boolean(master),
    take: existsSync(clip.paths.take),
    camera: Boolean(camera),
    studio: savedInStudio(clip),
    directs: Boolean(clip.direction || clip.camera),
    rendered: Boolean(out),
    stale: Boolean(out && (out < master || (camera && out < camera))),
  };
}
