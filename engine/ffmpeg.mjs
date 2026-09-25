/**
 * The ffmpeg, ffprobe and cwebp calls every stage shares. Frames move as raw
 * rgb24 through pipes, so nothing is re-encoded between stages.
 */
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { rmSync } from 'node:fs';

/** The error for a tool that is not installed, with the way to get it. */
function missingTool(bin) {
  return new Error(`${bin} is not installed, or not on your PATH. Run \`dolly doctor\`: it prints the command that installs it`);
}

/** Run a tool to completion and return its stdout; its error output becomes the error's message. */
function run(bin, args, options = {}) {
  try {
    return execFileSync(bin, args, { maxBuffer: 1 << 30, stdio: ['pipe', 'pipe', 'pipe'], ...options });
  } catch (error) {
    if (error.code === 'ENOENT') throw missingTool(bin);
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`${bin} failed: ${detail}`, { cause: error });
  }
}

/** Start a long-running tool, and fail clearly when it is not installed. */
async function start(bin, args, options) {
  const child = spawn(bin, args, options);
  try {
    await once(child, 'spawn');
  } catch (error) {
    throw error.code === 'ENOENT' ? missingTool(bin) : error;
  }
  return child;
}

const checked = new Set();

/** Fail early, before any work, when a tool a stage needs is missing. Checked once per process. */
export function requireTools(...bins) {
  for (const bin of bins) {
    if (checked.has(bin)) continue;
    run(bin, ['-version']);
    checked.add(bin);
  }
}

/** Run ffmpeg quietly, overwriting its output. */
export function ffmpeg(args, options = {}) {
  return run('ffmpeg', ['-v', 'error', '-y', ...args], options);
}

/** How many frames a video's first stream holds, from its container. */
export function frameCount(path) {
  return Number(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=nb_frames', '-of', 'csv=p=0', path]).toString());
}

/** Width, height, fps and duration of a video's first stream. */
export function probe(path) {
  const out = run('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate:format=duration',
    '-of', 'json', path,
  ]).toString();
  const { streams, format } = JSON.parse(out);
  if (!streams?.length) throw new Error(`${path} has no video in it`);
  const [num, den] = streams[0].r_frame_rate.split('/').map(Number);
  return { width: streams[0].width, height: streams[0].height, fps: num / den, duration: Number(format.duration) };
}

/**
 * Decode a video to raw frames (rgb24, or gray). `filter` is a
 * -filter_complex graph whose output is labelled [v]; `scale` resizes to
 * `width` x `height` instead; `end` stops the stream at that many seconds.
 * Calls `onFrame(frame, index)` once per frame, in order, awaiting each.
 * Every frame is its own buffer, so it can be kept or handed to a worker.
 */
export async function decodeFrames(path, { width, height, filter, end, scale = false, pixFmt = 'rgb24' }, onFrame) {
  const args = ['-v', 'error', '-i', path];
  if (filter) args.push('-filter_complex', filter, '-map', '[v]');
  else if (scale) args.push('-vf', `scale=${width}:${height}`);
  if (end !== undefined) args.push('-t', end.toFixed(3));
  args.push('-f', 'rawvideo', '-pix_fmt', pixFmt, '-');
  const size = width * height * (pixFmt === 'gray' ? 1 : 3);
  const decoder = await start('ffmpeg', args, { stdio: ['ignore', 'pipe', 'inherit'] });
  const exited = once(decoder, 'close');
  let frame = new Uint8Array(size);
  let filled = 0;
  let index = 0;
  for await (const chunk of decoder.stdout) {
    for (let offset = 0; offset < chunk.length;) {
      const take = Math.min(size - filled, chunk.length - offset);
      frame.set(chunk.subarray(offset, offset + take), filled);
      filled += take;
      offset += take;
      if (filled === size) {
        await onFrame(frame, index);
        index += 1;
        frame = new Uint8Array(size);
        filled = 0;
      }
    }
  }
  const [code] = await exited;
  if (code !== 0) throw new Error(`ffmpeg could not decode ${path}`);
  return index;
}

/** An H.264 encoder fed raw rgb24 frames: web-ready (yuv420p, faststart, no audio). */
export async function encoder(out, { width, height, fps, crf, preset }) {
  const child = await start('ffmpeg', [
    '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${width}x${height}`, '-r', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  const exited = once(child, 'close');
  /* On macOS ffmpeg can read a pipe's buffered byte count as a file size and
     log a "Truncating packet" it then recovers from; render() checks the
     frame count, so that one line is dropped and the rest passes through. */
  let log = '';
  child.stderr.on('data', (d) => {
    log += d;
  });
  let failed = null;
  child.stdin.on('error', (error) => {
    failed = error;
  });
  return {
    async write(frame) {
      if (failed) throw new Error(`ffmpeg stopped taking frames for ${out}: ${failed.message}`);
      if (!child.stdin.write(frame)) await once(child.stdin, 'drain');
    },
    async close() {
      child.stdin.end();
      const [code] = await exited;
      const rest = log.split('\n').filter((line) => line && !/^Truncating packet of size \d+ to \d+$/.test(line));
      if (rest.length) process.stderr.write(`${rest.join('\n')}\n`);
      if (code !== 0) throw new Error(`ffmpeg could not encode ${out}`);
    },
  };
}

/** A PNG file to WebP at `quality`, with cwebp. */
export function pngToWebp(png, out, quality = 85) {
  run('cwebp', ['-quiet', '-q', String(quality), png, '-o', out]);
}

/** A raw rgb24 frame to WebP. ffmpeg often ships without a WebP encoder, so it goes through PNG and cwebp. */
export function writeWebp(frame, width, height, out, quality = 85) {
  const png = `${out}.tmp.png`;
  ffmpeg(['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${width}x${height}`, '-i', '-', '-frames:v', '1', png], { input: frame });
  try {
    pngToWebp(png, out, quality);
  } finally {
    rmSync(png, { force: true });
  }
}
