/**
 * The storyboard server: a local page that plays a clip's master through
 * its camera spec live, so the moves, the wash and the sharpness can be
 * judged and edited before anything is rendered. The page runs the same
 * engine/camera/math.mjs the renderer does.
 *
 * It reads a project's masters and takes, and writes only two things: the
 * clip's camera file (on Save) and the render in out/ (on Render). Proxies
 * and poster frames are scratch, under the workspace's .dolly/.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, renameSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { PACKAGE, loadClip, matchClips } from './config.mjs';
import { probe, ffmpeg, decodeFrames } from './ffmpeg.mjs';
import { normalizeSpec, checkSpec } from './camera/math.mjs';
import { outputSize } from './render.mjs';
import { render, specFor, status } from './stages.mjs';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp4': 'video/mp4', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const STUDIO = join(PACKAGE, 'studio');

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

/** A file, with Range support so the page can seek a video. */
function file(req, res, path) {
  if (!existsSync(path)) return send(res, 404, { error: 'not found' });
  const size = statSync(path).size;
  const type = TYPES[extname(path)] ?? 'application/octet-stream';
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
  if (range) {
    const start = range[1] ? Number(range[1]) : size - Number(range[2]);
    const end = range[1] && range[2] ? Number(range[2]) : size - 1;
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1, 'cache-control': 'no-store' });
    return createReadStream(path, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': 'no-store' });
  return createReadStream(path).pipe(res);
}

/** Serve a file from `dir` only if the request stays inside it. */
function inside(dir, rest) {
  const p = normalize(join(dir, rest));
  return p.startsWith(dir) ? p : null;
}

/**
 * A master re-encoded for scrubbing: full resolution (sharpness must be
 * judged on real pixels) with a keyframe every 6 frames, so a seek decodes
 * a handful of frames instead of hundreds. Built once, rebuilt when the
 * master changes.
 */
function proxy(project, clip) {
  const out = join(project.paths.tmp, 'proxy', `${clip.name}.mp4`);
  if (existsSync(out) && statSync(out).mtimeMs >= statSync(clip.paths.master).mtimeMs) return out;
  mkdirSync(join(out, '..'), { recursive: true });
  ffmpeg(['-i', clip.paths.master, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-g', '6', '-keyint_min', '6', '-sc_threshold', '0',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', `${out}.part.mp4`]);
  renameSync(`${out}.part.mp4`, out);
  return out;
}

/**
 * A still for the clip's card on the home screen. A render that is up to
 * date has its own poster; otherwise a frame of the master, taken once the
 * take has played out (just after its last beat, or 60% in) and kept until
 * the master changes.
 */
function posterFrame(project, clip) {
  const state = status(clip);
  if (state.rendered && !state.stale && existsSync(clip.paths.poster)) return clip.paths.poster;
  if (!state.master) return null;
  const out = join(project.paths.tmp, 'posters', `${clip.name}.jpg`);
  if (existsSync(out) && statSync(out).mtimeMs >= statSync(clip.paths.master).mtimeMs) return out;
  const { duration } = probe(clip.paths.master);
  const beats = existsSync(clip.paths.take) ? Object.values(JSON.parse(readFileSync(clip.paths.take, 'utf8')).beats ?? {}) : [];
  const at = Math.min(duration - 0.1, beats.length ? Math.max(...beats) + 0.3 : duration * 0.6);
  mkdirSync(join(out, '..'), { recursive: true });
  ffmpeg(['-ss', at.toFixed(3), '-i', clip.paths.master, '-frames:v', '1', '-vf', 'scale=960:-2', '-q:v', '3', `${out}.part.jpg`]);
  renameSync(`${out}.part.jpg`, out);
  return out;
}

/** The title a scenario gives its clip in its opening comment (`rec-walk: "Walk down to it": ...`), or null. */
function scenarioTitle(clip) {
  if (!clip.file) return null;
  return /^\/\*\*\s*\*\s*[\w.-]+:\s*"([^"]+)"/.exec(readFileSync(clip.file, 'utf8'))?.[1] ?? null;
}

/** One clip as the home screen lists it: where it stands, how long it runs, and its still. */
async function clipSummary(project, name) {
  const clip = await loadClip(project, name);
  const state = status(clip);
  const spec = state.master ? specFor(clip) : null;
  const directed = state.camera ? JSON.parse(readFileSync(clip.paths.camera, 'utf8')).directed ?? 'scenario' : null;
  return {
    name,
    title: scenarioTitle(clip),
    status: state,
    directedBy: directed,
    duration: state.master ? probe(clip.paths.master).duration : null,
    source: spec?.source ?? {},
    poster: state.master ? `/media/poster/${encodeURIComponent(name)}?v=${Math.round(Math.max(statSync(clip.paths.master).mtimeMs, state.rendered ? statSync(clip.paths.out).mtimeMs : 0))}` : null,
  };
}

/**
 * How much the picture changes at each frame of the master: the mean
 * difference from the frame before, at 160x100 in grey, 0..1 against the
 * clip's own largest change. It is where the product moves, which is where
 * the grammar keeps the camera still.
 */
const activityCache = new Map();
async function activity(clip) {
  const key = `${clip.paths.master}|${statSync(clip.paths.master).mtimeMs}`;
  if (activityCache.has(key)) return activityCache.get(key);
  const W = 160;
  const H = 100;
  const { fps } = probe(clip.paths.master);
  const values = [0];
  let prev = null;
  await decodeFrames(clip.paths.master, { width: W, height: H, scale: true, pixFmt: 'gray' }, (f) => {
    if (prev) {
      let sum = 0;
      for (let i = 0; i < f.length; i += 1) sum += Math.abs(f[i] - prev[i]);
      values.push(sum / f.length);
    }
    prev = f;
  });
  const peak = Math.max(...values, 1e-6);
  const result = { fps, values: values.map((v) => Math.round((v / peak) * 1000) / 1000) };
  activityCache.set(key, result);
  return result;
}

const body = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', (d) => {
    data += d;
  });
  req.on('end', () => resolve(data));
  req.on('error', reject);
});

/** Serve the built Studio, falling back to index.html for its routes. */
function staticStudio(req, res, path) {
  const dist = join(STUDIO, 'dist');
  const p = inside(dist, path === '/' ? 'index.html' : path.slice(1));
  if (p && existsSync(p) && statSync(p).isFile()) return file(req, res, p);
  return file(req, res, join(dist, 'index.html'));
}

/**
 * The Studio in development: Vite serves studio/src with hot reload. Used
 * with --dev, or when there is no build (a checkout that has not run
 * `npm run build:studio`).
 */
async function devStudio(log) {
  try {
    const { createServer } = await import('vite');
    const vite = await createServer({ configFile: join(STUDIO, 'vite.config.mjs'), server: { middlewareMode: true }, appType: 'spa' });
    log('  the Studio is served live from studio/src (dev)');
    return vite;
  } catch (error) {
    throw new Error(`the Studio is not built and Vite is not available to serve it (${error.message}); run \`npm run build:studio\``, { cause: error });
  }
}

export async function startStudio(project, { port = 4800, log = console.log, dev = false } = {}) {
  const vite = dev || !existsSync(join(STUDIO, 'dist', 'index.html')) ? await devStudio(log) : null;
  const renders = new Map();

  async function clipInfo(name) {
    const clip = await loadClip(project, name);
    if (!existsSync(clip.paths.master)) throw new Error(`${name} has no master yet: record it first`);
    const master = probe(clip.paths.master);
    const opts = { ...project.preset, ...clip.meta.output };
    const take = existsSync(clip.paths.take) ? JSON.parse(readFileSync(clip.paths.take, 'utf8')) : null;
    return {
      name,
      title: scenarioTitle(clip),
      spec: normalizeSpec(specFor(clip)),
      hasCamera: existsSync(clip.paths.camera),
      directs: Boolean(clip.direction || clip.camera),
      take,
      master,
      output: outputSize(master, opts),
      css: take?.viewport?.dpr ?? master.width / clip.meta.viewport.width,
      rendered: existsSync(clip.paths.out) ? statSync(clip.paths.out).mtimeMs : null,
      status: status(clip),
    };
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    try {
      if (path === '/api/project') {
        const clips = [];
        for (const name of matchClips(project, [], { recorded: true })) clips.push(await clipSummary(project, name));
        return send(res, 200, { name: project.name, alias: project.alias, workspace: project.workspace.root, clips });
      }
      let m = /^\/media\/(master|out)\/([\w.-]+)\.mp4$/.exec(path);
      if (m) {
        const clip = await loadClip(project, m[2]);
        return file(req, res, m[1] === 'master' ? proxy(project, clip) : clip.paths.out);
      }
      m = /^\/media\/poster\/([\w.-]+)$/.exec(path);
      if (m) {
        const still = posterFrame(project, await loadClip(project, m[1]));
        return still ? file(req, res, still) : send(res, 404, { error: `${m[1]} has no master yet` });
      }
      m = /^\/api\/clip\/([\w.-]+)\/activity$/.exec(path);
      if (m) return send(res, 200, await activity(await loadClip(project, m[1])));
      m = /^\/api\/clip\/([\w.-]+)(\/camera|\/render)?$/.exec(path);
      if (m) {
        const [, name, action] = m;
        if (!action && req.method === 'GET') return send(res, 200, await clipInfo(name));
        if (action === '/camera' && req.method === 'PUT') {
          const spec = normalizeSpec(JSON.parse(await body(req)));
          const { errors, warnings } = checkSpec(spec);
          if (errors.length) return send(res, 422, { errors, warnings });
          const clip = await loadClip(project, name);
          mkdirSync(project.paths.cameras, { recursive: true });
          /* Marked as directed by hand, so a re-record keeps it instead of rebuilding it from the scenario. */
          const clean = { directed: 'studio', camera: spec.camera, spots: spec.spots, ...(Object.keys(spec.source).length ? { source: spec.source } : {}) };
          writeFileSync(clip.paths.camera, `${JSON.stringify(clean, null, 2)}\n`);
          log(`  saved ${project.workspace.rel(clip.paths.camera)}`);
          return send(res, 200, { saved: project.workspace.rel(clip.paths.camera), warnings });
        }
        if (action === '/render' && req.method === 'POST') {
          if (renders.get(name)?.state === 'rendering') return send(res, 409, { error: 'already rendering' });
          const job = { state: 'rendering', done: 0, total: 1 };
          renders.set(name, job);
          const clip = await loadClip(project, name);
          log(`  rendering ${name}`);
          render(project, clip, { onProgress: (done, total) => Object.assign(job, { done, total }) }).then(
            (r) => {
              Object.assign(job, { state: 'done', result: { out: project.workspace.rel(r.out), duration: r.duration, warnings: r.warnings } });
              log(`  rendered ${project.workspace.rel(r.out)}`);
            },
            (error) => Object.assign(job, { state: 'failed', error: error.message }),
          );
          return send(res, 202, job);
        }
        if (action === '/render' && req.method === 'GET') return send(res, 200, renders.get(name) ?? { state: 'idle' });
      }
      if (path.startsWith('/api/') || path.startsWith('/media/')) return send(res, 404, { error: 'not found' });
      if (vite) return vite.middlewares(req, res, () => send(res, 404, { error: 'not found' }));
      return staticStudio(req, res, path);
    } catch (error) {
      return send(res, 500, { error: error.message });
    }
  });

  server.on('close', () => vite?.close());
  return new Promise((resolve, reject) => {
    server.once('error', (error) => {
      vite?.close();
      reject(error);
    });
    server.listen(port, '127.0.0.1', () => resolve({ server, url: `http://localhost:${port}` }));
  });
}
