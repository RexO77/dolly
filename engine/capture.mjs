/**
 * Frames to master. The DevTools screencast is read directly, at DEVICE
 * pixels (Playwright's own video records at CSS pixels, so a dpr-2 page
 * would come out half size and every delivery file would be an upscale).
 *
 * Chrome only sends a frame when something paints, so each frame keeps its
 * own timestamp and holds until the next one; the stitch then resamples to
 * a constant frame rate. The master is the native-resolution capture the
 * camera crops from, so a lean-in uses real pixels instead of upscaling.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ffmpeg } from './ffmpeg.mjs';
import { sleep } from './motion.mjs';

/**
 * Start the screencast into `dir`. Resolves once the first frame has
 * arrived, with its arrival time (performance.now()): the master's zero.
 */
export async function startCapture(page, { dir, width, height, dpr, quality = 95 }) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  let first;
  const firstFrame = new Promise((resolve) => (first = resolve));
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const file = `f${String(frames.length).padStart(5, '0')}.jpg`;
    writeFileSync(join(dir, file), Buffer.from(data, 'base64'));
    /* `at` is when the frame arrived, on this process's clock, the same
       clock the stop time is read from. Chrome's `metadata.timestamp` is on
       another clock, so the two are never mixed: frames are spaced by
       Chrome's timestamps, which are exact, and only the final hold uses `at`. */
    frames.push({ file, ts: metadata.timestamp, at: performance.now() });
    if (frames.length === 1) first(frames[0].at);
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined);
  });
  const started = performance.now();
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality, maxWidth: width * dpr, maxHeight: height * dpr, everyNthFrame: 1 });
  /* A still page may not paint straight away; the start call is then the best zero there is. */
  const zero = await Promise.race([firstFrame, sleep(2000).then(() => started)]);
  return {
    zero,
    frames,
    async stop() {
      const endAt = performance.now();
      await cdp.send('Page.stopScreencast').catch(() => undefined);
      await sleep(200);
      await cdp.detach().catch(() => undefined);
      return { frames: [...frames], endAt };
    },
  };
}

/**
 * Stitch the frames on their own clock into a constant-rate master. The
 * first frame starts the clip; the last holds until the capture stopped.
 */
export function stitch({ frames, endAt }, dir, out, { fps = 30, crf = 14, x264 = 'medium' } = {}) {
  if (!frames.length) throw new Error('no frames captured');
  const lines = ['ffconcat version 1.0'];
  let total = 0;
  frames.forEach((f, i) => {
    const hold = Math.max(0.001, i + 1 < frames.length ? frames[i + 1].ts - f.ts : Math.max(0.05, (endAt - f.at) / 1000));
    total += hold;
    lines.push(`file '${f.file}'`, `duration ${hold.toFixed(4)}`);
  });
  /* The concat demuxer needs the last file listed twice for its duration to
     count, and then plays that repeat for as long again; `-t` cuts the clip
     at its true length, so the final still holds for the tail and no longer. */
  lines.push(`file '${frames[frames.length - 1].file}'`);
  writeFileSync(join(dir, 'list.ffconcat'), lines.join('\n'));
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', join(dir, 'list.ffconcat'), '-t', total.toFixed(3),
    '-vf', `fps=${fps},format=yuv420p`, '-c:v', 'libx264', '-preset', x264, '-crf', String(crf), '-an', out]);
  return total;
}
