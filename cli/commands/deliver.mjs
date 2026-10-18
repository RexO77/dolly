import { existsSync } from 'node:fs';
import { loadClip, matchClips } from '../../engine/config.mjs';
import { deliver as deliverClip } from '../../engine/stages.mjs';
import { deliverStills } from '../../engine/stills.mjs';
import { displayPath } from '../util.mjs';

export const usage = 'deliver <project> [clip...]';
export const summary = 'Copy renders to the folder they ship from';
export const details = `Each clip goes to the folder its project names under "deliver" (the one
meta.deliver picks, else "default"): a site's public/media, say. Files there
are already shipped, so one that differs is kept and listed until you pass
--yes.`;
export const flags = [
  ['--yes', 'replace delivered files that differ'],
  ['--stills', 'deliver the project\'s stills instead of its clips'],
];
export const examples = ['dolly deliver shop shop-first', 'dolly deliver shop --yes', 'dolly deliver shop --stills'];

export default async function deliver({ args: [name, ...patterns], flags, project, ui }) {
  const p = await project(name);
  const handle = p.alias ?? p.name;
  const done = { copied: [], same: [], held: [] };
  const add = (result) => Object.keys(done).forEach((key) => done[key].push(...result[key]));
  if (flags.stills) {
    const result = await deliverStills(p, { filter: patterns[0], overwrite: flags.yes });
    add(result);
    if (result.missing.length) ui.note(`not shot yet, so not delivered: ${result.missing.join(', ')} (\`dolly stills ${handle}\`)`, null, { indent: 0 });
  } else {
    for (const clipName of matchClips(p, patterns, { recorded: true })) {
      const clip = await loadClip(p, clipName);
      if (existsSync(clip.paths.out)) add(deliverClip(p, clip, { overwrite: flags.yes }));
      else if (patterns.length) ui.info(`${clipName}: not rendered yet, skipped (\`dolly render ${handle} ${clipName}\`)`, null, { indent: 0 });
    }
  }
  if (done.same.length) ui.info(`${done.same.length} file${done.same.length > 1 ? 's were' : ' was'} already up to date`, null, { indent: 0 });
  if (!done.copied.length && !done.same.length && !done.held.length) ui.info('nothing to deliver: render something first', null, { indent: 0 });
  if (done.held.length) {
    const many = done.held.length > 1;
    ui.note(`kept ${done.held.length} delivered file${many ? 's' : ''} that differ${many ? '' : 's'} from the new one${many ? 's' : ''}; pass --yes to replace ${many ? 'them' : 'it'}`, null, { indent: 0 });
    done.held.forEach((file) => ui.line(`  ${displayPath(file)}`));
  }
  ui.summary([
    ['copied', done.copied.map((file) => displayPath(file))],
    ['next', done.held.length ? `dolly deliver ${[handle, ...patterns].join(' ')}${flags.stills ? ' --stills' : ''} --yes` : null],
  ]);
}
