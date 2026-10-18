/**
 * The site's media, made from the demo workspace's take of wrenly-tour:
 *
 *   take.mp4        the master, scaled to a web proxy the hero plays through the camera live
 *   take.webp       its first frame, shown until the proxy can play
 *   still.webp      one raw frame, for the small demos
 *   directed.mp4    Dolly's own render of the clip, and its poster
 *   shots/*.webp    a frame from the middle of every shot, for the storyboard demo
 *   tour.json       what the hero needs: sizes, beats, boxes, the shots and the camera
 *   film.mp4        Wrenly's launch film, cut down for the web, with its foley
 *   film.webp       its poster: a close-up, not the film's own wide poster
 *
 * Record and render the clip and the film first (from examples/demo):
 *
 *   node ../../bin/dolly.mjs record wrenly wrenly-tour wrenly-launch
 *   node ../../bin/dolly.mjs render wrenly wrenly-tour
 *   node ../../bin/dolly.mjs film wrenly wrenly-launch
 *
 * then run `npm run media:site` from the repo root. `npm run media:site -- film`
 * makes only the film's two files. The files it writes are committed.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { probe, writeWebp } from '../../engine/ffmpeg.mjs';
import { fromDirection } from '../../engine/direct.mjs';
import { renderStill } from '../../engine/render.mjs';
import { segments } from '../../engine/storyboard.mjs';
import { resample } from '../../engine/camera/resample.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const ws = join(root, 'examples/demo');
const clip = 'wrenly-tour';
const master = join(ws, 'masters/wrenly', `${clip}.mp4`);
const media = join(root, 'site/public/media');
const PROXY = 1600;
const STILL_AT = 6.9; // seconds into the take: the issue open, before its status changes
const FILM_WIDTH = 1280;
const FILM_POSTER_AT = 9.58; // seconds into the film: the close-up on the issue, just marked done

mkdirSync(join(media, 'shots'), { recursive: true });
const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);

/*
 * The launch film, for the web. Its grain is part of the look, so x264 is
 * tuned to keep it: at CRF 24 the grain smears into blocks in the dark, at
 * CRF 20 with tune grain it holds, and the film is still under 4 MB.
 */
const film = join(ws, 'out/wrenly', 'wrenly-launch-film');
ff(['-i', `${film}.mp4`, '-vf', `scale=${FILM_WIDTH}:-2`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-tune', 'grain', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', join(media, 'film.mp4')]);
/* Beside the demo, the poster should say "launch film" at a glance, so it is a close-up rather than the payoff's wide. */
const filmPoster = join(media, 'film.png');
ff(['-ss', String(FILM_POSTER_AT), '-i', `${film}.mp4`, '-frames:v', '1', '-vf', `scale=${FILM_WIDTH}:-2`, filmPoster]);
execFileSync('cwebp', ['-quiet', '-q', '82', filmPoster, '-o', join(media, 'film.webp')]);
rmSync(filmPoster);
if (process.argv[2] === 'film') {
  console.log(`wrote the film to ${media}`);
  process.exit(0);
}

/* The proxy: every frame a keyframe-near seek away, so scrubbing and looping stay quick. */
ff(['-i', master, '-vf', `scale=${PROXY}:-2`, '-c:v', 'libx264', '-crf', '24', '-g', '6', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(media, 'take.mp4')]);

const webpAt = (t, width, out, quality = 82) => {
  const png = `${out}.png`;
  ff(['-ss', String(t), '-i', master, '-frames:v', '1', '-vf', `scale=${width}:-2`, png]);
  execFileSync('cwebp', ['-quiet', '-q', String(quality), png, '-o', out]);
  rmSync(png);
};
webpAt(0, PROXY, join(media, 'take.webp'));
webpAt(STILL_AT, 1440, join(media, 'still.webp'));

copyFileSync(join(ws, 'out/wrenly', `${clip}.mp4`), join(media, 'directed.mp4'));
copyFileSync(join(ws, 'out/wrenly', `${clip}-poster.webp`), join(media, 'directed.webp'));

const take = JSON.parse(readFileSync(join(ws, 'masters/wrenly', `${clip}.take.json`), 'utf8'));
const spec = JSON.parse(readFileSync(join(ws, 'projects/wrenly/cameras', `${clip}.camera.json`), 'utf8'));
const scenario = await import(pathToFileURL(join(ws, 'projects/wrenly/scenarios', `${clip}.mjs`)).href);
const { beats } = await fromDirection(master, take, scenario.direction);
const info = probe(master);

/* One frame from the middle of each shot, through the camera, as the render would show it. */
const shots = segments(spec.camera, take.boxes).map((s, i) => ({ ...s, n: i + 1, file: `shots/${i + 1}.webp` }));
for (const s of shots) {
  const still = await renderStill({ master, spec, t: (s.t0 + s.t1) / 2, width: 960, css: take.viewport.dpr });
  const w = 480;
  const h = Math.round((w * still.height) / still.width);
  writeWebp(resample(still.frame, still.width, still.height, w, h, [0, 0, still.width, still.height]), w, h, join(media, s.file), 80);
}

const r3 = (n) => Math.round(n * 1000) / 1000;
writeFileSync(join(media, 'tour.json'), `${JSON.stringify({
  clip,
  viewport: take.viewport,
  master: { width: info.width, height: info.height, fps: info.fps, duration: r3(info.duration) },
  proxy: { width: PROXY, height: Math.round((PROXY * info.height) / info.width / 2) * 2 },
  output: { width: 1920, height: 1200 },
  still: { t: STILL_AT },
  beats,
  boxes: take.boxes,
  shots: scenario.direction.shots,
  spec,
  storyboard: shots.map(({ n, t0, t1, kind, what, z, file }) => ({ n, t0: r3(t0), t1: r3(t1), kind, what, z: r3(z), file })),
}, null, 2)}\n`);

console.log(`wrote ${media}`);
