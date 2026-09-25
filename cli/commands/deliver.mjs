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

export default async function deliver({ args: [name, ...patterns], flags, project, log }) {
  const p = await project(name);
  const done = { copied: [], same: [], held: [] };
  const add = (result) => Object.keys(done).forEach((key) => done[key].push(...result[key]));
  if (flags.stills) {
    const result = await deliverStills(p, { filter: patterns[0], overwrite: flags.yes });
    add(result);
    if (result.missing.length) log(`not shot yet, so not delivered: ${result.missing.join(', ')} (dolly stills ${p.alias ?? p.name})`);
  } else {
    for (const clipName of matchClips(p, patterns, { recorded: true })) {
      const clip = await loadClip(p, clipName);
      if (existsSync(clip.paths.out)) add(deliverClip(p, clip, { overwrite: flags.yes }));
      else if (patterns.length) log(`${clipName}: not rendered yet, skipped (dolly render ${p.alias ?? p.name} ${clipName})`);
    }
  }
  done.copied.forEach((file) => log(`copied ${displayPath(file)}`));
  if (done.same.length) log(`${done.same.length} file${done.same.length > 1 ? 's were' : ' was'} already up to date`);
  if (!done.copied.length && !done.same.length && !done.held.length) log('nothing to deliver: render something first');
  if (done.held.length) {
    log(`\nkept ${done.held.length} delivered file${done.held.length > 1 ? 's' : ''} that differ${done.held.length > 1 ? '' : 's'} from the new one${done.held.length > 1 ? 's' : ''}. Pass --yes to replace ${done.held.length > 1 ? 'them' : 'it'}:`);
    done.held.forEach((file) => log(`  ${displayPath(file)}`));
  }
}
