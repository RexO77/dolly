/**
 * The site's frames of the real thing, from the demo workspace:
 *
 *   raw.webp          one frame of the take of wrenly-tour, as recorded
 *   finished.webp     the same moment through Dolly's camera: leaned in, the wash on
 *   studio-home.webp  the Studio's home screen: every clip, its state, its next step
 *   studio-shot.webp  the Studio with a shot open and the lens barrel showing
 *
 * It starts the Studio on examples/demo, shoots it in headless Chrome and
 * stops it again. Record and render the demo's clips first (see media.mjs),
 * then run `npm run frames:site` from the repo root. The files it writes are
 * committed.
 */
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { writeWebp } from '../../engine/ffmpeg.mjs';
import { renderStill } from '../../engine/render.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const ws = join(root, 'examples/demo');
const media = join(root, 'site/public/media');
const clip = 'wrenly-tour';
const master = join(ws, 'masters/wrenly', `${clip}.mp4`);
const AT = 9.3; // seconds in: leaned in on the issue, just marked done, the wash on
const PORT = 4843;
const WIDTH = 1600; // the Studio's frames, downscaled from 2880 for the page

/* ── The take, raw and finished, at one moment ── */

const png = join(media, 'raw.tmp.png');
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(AT), '-i', master, '-frames:v', '1', '-vf', 'scale=1440:-2', png]);
execFileSync('cwebp', ['-quiet', '-q', '80', png, '-o', join(media, 'raw.webp')]);
rmSync(png);

const spec = JSON.parse(readFileSync(join(ws, 'projects/wrenly/cameras', `${clip}.camera.json`), 'utf8'));
const still = await renderStill({ master, spec, t: AT, width: 1440, css: 2 });
writeWebp(still.frame, still.width, still.height, join(media, 'finished.webp'), 80);

/* ── The Studio ── */

const studio = spawn(process.execPath, [join(root, 'bin/dolly.mjs'), 'studio', 'wrenly', '--port', String(PORT), '--workspace', ws], { stdio: 'ignore' });
const until = Date.now() + 20000;
while (true) {
  try {
    if ((await fetch(`http://localhost:${PORT}/api/project`)).ok) break;
  } catch {
    if (Date.now() > until) throw new Error('the Studio did not start');
    await new Promise((r) => setTimeout(r, 250));
  }
}

const browser = await chromium.launch({ channel: process.env.DOLLY_CHROME ? undefined : 'chrome', executablePath: process.env.DOLLY_CHROME });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  const shoot = async (name, width = WIDTH) => {
    const tmp = join(media, `${name}.tmp.png`);
    await page.screenshot({ path: tmp });
    execFileSync('cwebp', ['-quiet', '-q', '78', '-resize', String(width), '0', tmp, '-o', join(media, `${name}.webp`)]);
    rmSync(tmp);
  };

  /* The home screen is a column: shoot it at a width that keeps it, not the margins around it. */
  await page.setViewportSize({ width: 1040, height: 880 });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('.clip-poster img');
  await page.waitForTimeout(1500);
  /* The workspace line names a folder on this machine: show where a reader's would be. */
  await page.evaluate(() => {
    const code = document.querySelector('.home-foot code');
    if (code) code.textContent = '~/clips';
  });
  await shoot('studio-home', 1560);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.click(`[aria-label="Open ${clip}"]`);
  await page.waitForSelector('.shot-summary');
  await page.click('.shot-summary:has-text("Lean in on issue")');
  await page.waitForSelector('.lens-barrel');
  /* Let the shot open and its take load before moving the playhead into the lean. */
  await page.waitForTimeout(2500);
  const ruler = await page.locator('.strip-ruler').first().boundingBox();
  await page.mouse.click(ruler.x + ruler.width * (9.5 / spec.camera.at(-1).t), ruler.y + ruler.height / 2);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(1500);
  await shoot('studio-shot');
} finally {
  await browser.close();
  studio.kill();
}
