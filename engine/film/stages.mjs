/**
 * A launch film's steps, as the CLI and the Studio run them: its film spec
 * (directed from the scenario, or as saved), its render and poster, and the
 * judge's notes on it.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { readJson, writeJson } from '../files.mjs';
import { writeWebp } from '../ffmpeg.mjs';
import { resample } from '../camera/resample.mjs';
import { directFilm } from './direct.mjs';
import { renderFilm, renderFilmStill } from './render.mjs';
import { resolveShots } from './shots.mjs';
import { judgeFilm } from './judge.mjs';

const savedInStudio = (clip) => existsSync(clip.paths.film) && readJson(clip.paths.film).directed === 'studio';

/** The take a launch film is cut from, or a clear error. */
function takeOf(project, clip) {
  if (!existsSync(clip.paths.master) || !existsSync(clip.paths.take)) throw new Error(`${clip.name} has no take yet; record it first (dolly record ${project.alias ?? project.name} ${clip.name})`);
  return readJson(clip.paths.take);
}

/**
 * The clip's film spec: the saved one, or one directed from the scenario's
 * `film` (written to films/). A film saved in the Studio is kept unless
 * `redirect`. Returns {film, written?, kept?, warnings}.
 */
export function filmFor(project, clip, { redirect = false } = {}) {
  const take = takeOf(project, clip);
  if (existsSync(clip.paths.film) && (!clip.film || (savedInStudio(clip) && !redirect))) {
    return { film: readJson(clip.paths.film), kept: savedInStudio(clip), warnings: [] };
  }
  const { film, warnings } = directFilm(clip, take);
  mkdirSync(dirname(clip.paths.film), { recursive: true });
  writeJson(clip.paths.film, film);
  return { film, written: clip.paths.film, warnings };
}

/** Everything a film's shots read: the takes and masters by name, and the ending's logo found from the workspace. */
function sources(project, clip, film) {
  const names = new Set([film.take ?? clip.name, ...film.shots.map((s) => s.take).filter(Boolean)]);
  const takes = {};
  const masters = {};
  for (const name of names) {
    masters[name] = join(project.paths.masters, `${name}.mp4`);
    const file = join(project.paths.masters, `${name}.take.json`);
    if (!existsSync(file)) throw new Error(`the film cuts from ${name}, which has not been recorded`);
    takes[name] = readJson(file);
  }
  const ending = film.ending && { ...film.ending, ...(film.ending.logo && !isAbsolute(film.ending.logo) ? { logo: join(project.workspace.root, film.ending.logo) } : {}) };
  return { takes, masters, film: { take: clip.name, ...film, ending } };
}

/** Each shot's middle frame, and the judge's notes on them. */
export async function judgeLaunch(project, clip, { film } = {}) {
  const spec = film ?? filmFor(project, clip).film;
  const src = sources(project, clip, spec);
  const shots = resolveShots(src.film, src.takes);
  const frames = [];
  for (const shot of shots) frames.push(await renderFilmStill({ ...src, index: shot.index, t: shot.length / 2, width: 960, height: 540 }));
  return { notes: judgeFilm(shots, frames, src.takes), shots, frames };
}

/** Render the clip's launch film and its poster, then judge it. */
export async function renderLaunch(project, clip, { onProgress, redirect = false } = {}) {
  const { film, warnings } = filmFor(project, clip, { redirect });
  const src = sources(project, clip, film);
  mkdirSync(project.paths.out, { recursive: true });
  const result = await renderFilm({ ...src, out: clip.paths.launch, onProgress });
  /* The poster is the payoff, or the middle of the film. */
  const shots = result.shots;
  const best = shots.find((s) => s.scale === 'wide') ?? shots[Math.floor(shots.length / 2)];
  const still = await renderFilmStill({ ...src, index: best.index, t: best.length / 2 });
  const width = 1440;
  const height = Math.round((width * still.height) / still.width);
  writeWebp(resample(still.frame, still.width, still.height, width, height, [0, 0, still.width, still.height]), width, height, clip.paths.launchPoster, 85);
  const judged = await judgeLaunch(project, clip, { film });
  return { out: clip.paths.launch, poster: clip.paths.launchPoster, duration: result.duration, warnings, notes: judged.notes };
}
