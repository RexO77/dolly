/**
 * The ffmpeg, ffprobe and cwebp calls every stage shares. Frames move as raw
 * rgb24 through pipes, so nothing is re-encoded between stages.
 */
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { rmSync } from 'node:fs';

export function ffmpeg(args, opts = {}) {
  return execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { maxBuffer: 1 << 30, ...opts });
}

/** How many frames a video's first stream holds, from its container. */
export function frameCount(path) {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=nb_frames', '-of', 'csv=p=0', path]).toString());
}

/** Width, height, fps and duration of a video's first stream. */
export function probe(path) {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate:format=duration',
    '-of', 'json', path,
  ]).toString();
  const { streams, format } = JSON.parse(out);
  if (!streams?.length) throw new Error(`no video stream in ${path}`);
  const [num, den] = streams[0].r_frame_rate.split('/').map(Number);
  return { width: streams[0].width, height: streams[0].height, fps: num / den, duration: Number(format.duration) };
}

/**
 * Decode a video to raw frames (rgb24, or gray). `filter` is a
 * -filter_complex graph whose output is labelled [v]; `scale` resizes to
 * `width` x `height` instead; `end` stops the stream at that many seconds.
 * Calls `onFrame(buffer, index)` once per frame, in order, awaiting each.
 */
export async function decodeFrames(path, { width, height, filter, end, scale = false, pixFmt = 'rgb24' }, onFrame) {
  const args = ['-v', 'error', '-i', path];
  if (filter) args.push('-filter_complex', filter, '-map', '[v]');
  else if (scale) args.push('-vf', `scale=${width}:${height}`);
  if (end !== undefined) args.push('-t', end.toFixed(3));
  args.push('-f', 'rawvideo', '-pix_fmt', pixFmt, '-');
  const size = width * height * (pixFmt === 'gray' ? 1 : 3);
  const dec = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'inherit'] });
  let pending = [];
  let have = 0;
  let index = 0;
  for await (const chunk of dec.stdout) {
    pending.push(chunk);
    have += chunk.length;
    while (have >= size) {
      const all = pending.length === 1 ? pending[0] : Buffer.concat(pending, have);
      await onFrame(new Uint8Array(all.buffer.slice(all.byteOffset, all.byteOffset + size)), index);
      index += 1;
      const rest = all.subarray(size);
      pending = rest.length ? [rest] : [];
      have = rest.length;
    }
  }
  const code = await new Promise((resolve) => (dec.exitCode !== null ? resolve(dec.exitCode) : dec.on('close', resolve)));
  if (code !== 0) throw new Error(`ffmpeg could not decode ${path}`);
  return index;
}

/** An H.264 encoder fed raw rgb24 frames: web-ready (yuv420p, faststart, no audio). */
export function encoder(out, { width, height, fps, crf, preset }) {
  const enc = spawn('ffmpeg', [
    '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${width}x${height}`, '-r', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  const closed = new Promise((resolve) => enc.on('close', resolve));
  /* On macOS ffmpeg can read a pipe's buffered byte count as a file size and
     log a "Truncating packet" it then recovers from; render() checks the
     frame count, so that one line is dropped and the rest passes through. */
  let log = '';
  enc.stderr.on('data', (d) => {
    log += d;
  });
  let failed = null;
  enc.stdin.on('error', (error) => {
    failed = error;
  });
  return {
    async write(frame) {
      if (failed) throw new Error(`ffmpeg stopped taking frames for ${out}: ${failed.message}`);
      if (!enc.stdin.write(frame)) await once(enc.stdin, 'drain');
    },
    async close() {
      enc.stdin.end();
      const code = await closed;
      const rest = log.split('\n').filter((l) => l && !/^Truncating packet of size \d+ to \d+$/.test(l));
      if (rest.length) process.stderr.write(`${rest.join('\n')}\n`);
      if (code !== 0) throw new Error(`ffmpeg could not encode ${out}`);
    },
  };
}

/** A raw rgb24 frame to WebP. This ffmpeg has no WebP encoder, so it goes through PNG and cwebp. */
export function writeWebp(frame, width, height, out, quality = 85) {
  const png = `${out}.tmp.png`;
  ffmpeg(['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${width}x${height}`, '-i', '-', '-frames:v', '1', png], { input: frame });
  try {
    execFileSync('cwebp', ['-quiet', '-q', String(quality), png, '-o', out]);
  } finally {
    rmSync(png, { force: true });
  }
}
