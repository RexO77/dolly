import { existsSync, statSync } from 'node:fs';
import { listProjects, loadClip, matchClips } from '../../engine/config.mjs';
import { readJson } from '../../engine/files.mjs';
import { status } from '../../engine/stages.mjs';

export const usage = 'list [project]';
export const summary = 'Show the projects, their clips and where each stands';
export const details = `For each clip: whether it has a take, then its two cuts. The demo: whether it
is rendered (and up to date), and where its camera comes from (its scenario,
the Studio, a camera file of its own, or none, which renders wide). The
launch film: whether it is rendered (and up to date), and where its film
comes from (its scenario, or the Studio).`;

const mtime = (path) => (existsSync(path) ? statSync(path).mtimeMs : null);

/** Where a clip's demo camera comes from, in words. */
function cameraOf(s) {
  if (s.studio) return 'camera from the Studio';
  if (s.directs) return s.camera ? 'camera from its scenario' : 'camera from its scenario, once recorded';
  return s.camera ? 'camera file of its own' : 'no camera, so wide';
}

/** Where a clip's launch film stands: null for a clip with none, else whether it is rendered and where its film comes from. */
function filmOf(clip) {
  const file = mtime(clip.paths.film);
  if (!clip.film && !file) return null;
  let studio = false;
  try {
    studio = Boolean(file) && readJson(clip.paths.film).directed === 'studio';
  } catch {
    /* a film file too broken to read is reported where it is used */
  }
  const out = mtime(clip.paths.launch);
  const master = mtime(clip.paths.master);
  return {
    rendered: Boolean(out),
    stale: Boolean(out && (out < (master ?? 0) || out < (file ?? 0))),
    source: studio ? 'film from the Studio' : clip.film ? 'film from its scenario' : 'film file of its own',
  };
}

/** A render's state in a word, coloured by what it asks of you. */
function rendered(ui, { rendered: done, stale }) {
  if (stale) return ui.amber(`${ui.sym.note} out of date`);
  return done ? ui.wash('rendered') : ui.dim('not rendered');
}

export default async function list({ args, workspace, project, ui }) {
  const names = args.length ? args : listProjects(workspace()).map((p) => p.name);
  if (!names.length) ui.line(ui.code(`no projects in ${workspace().root} yet: \`dolly init <name> --from <repo>\` adds one`));
  const todo = [];
  for (const [i, name] of names.entries()) {
    const p = await project(name);
    const handle = p.alias ?? p.name;
    if (i) ui.line();
    ui.line(`${ui.bold(p.name)}${p.alias ? ui.dim(` (${p.alias})`) : ''}  ${ui.dim(p.base)}`);
    const clips = matchClips(p, [], { recorded: true });
    if (!clips.length) {
      ui.info('no clips yet');
      continue;
    }
    const rows = [['clip', 'take', 'demo', '', 'launch film', '']];
    for (const clipName of clips) {
      const clip = await loadClip(p, clipName);
      const s = status(clip);
      const film = filmOf(clip);
      const take = s.master ? 'recorded' : ui.dim('not recorded');
      /* A clip made for its launch film shows no demo state unless it has a demo of its own. */
      const demo = film && !s.rendered && !s.camera && !s.directs ? [ui.dim(ui.sym.dot), ''] : [rendered(ui, s), ui.dim(cameraOf(s))];
      rows.push([
        s.scenario ? clipName : `${clipName} ${ui.amber('(no scenario)')}`,
        take,
        ...demo,
        ...(film ? [rendered(ui, film), ui.dim(film.source)] : [ui.dim(ui.sym.dot), '']),
      ]);
      if (!s.master) todo.push(`dolly record ${handle} ${clipName}`);
      else if (s.stale) todo.push(`dolly render ${handle} ${clipName}`);
      else if (film?.stale) todo.push(`dolly film ${handle} ${clipName}`);
    }
    ui.line();
    ui.table(rows, { header: true });
  }
  if (todo.length) ui.summary([['next', todo[0]]]);
}
