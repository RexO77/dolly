/**
 * The site's media, made from the demo workspace's take of wrenly-tour:
 *
 *   take.mp4        the master, scaled to a web proxy the hero plays through the camera live
 *   take.webp       its first frame, shown until the proxy can play
 *   still.webp      one raw frame, for the small demos
 *   directed.mp4    Dolly's own render of the clip, and its poster
 *   shots/*.webp    a frame from the middle of every shot, for the storyboard demo
 *   tour.json       what the hero needs: sizes, beats, boxes, the shots and the camera
 *
 * Record and render the clip first (from examples/demo):
 *
 *   node ../../bin/dolly.mjs record wrenly wrenly-tour
 *   node ../../bin/dolly.mjs render wrenly wrenly-tour
 *
 * then run `npm run media:site` from the repo root. The files it writes are committed.
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

mkdirSync(join(media, 'shots'), { recursive: true });
const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);

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
