import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadClip, matchClips } from '../../engine/config.mjs';
import { deliver as deliverClip } from '../../engine/stages.mjs';

export const usage = 'deliver <project> [clip...]';
export const summary = "copy rendered clips into the folder project.json names (a site's public/media, say)";
export const flags = `  --yes          replace delivered files that differ (they are shipped, so this is never the default)
  --stills       deliver the stills instead of the clips`;

export default async function deliver({ args: [name, ...patterns], flags, project, log }) {
  const p = await project(name);
  let held = [];
  if (flags.stills) {
    const mod = await import(pathToFileURL(join(p.dir, 'stills.mjs')).href);
    for (const shot of mod.shots.filter((s) => !patterns.length || patterns.some((q) => s.name.includes(q)))) {
      const from = join(p.paths.out, 'stills', `${shot.name}.webp`);
      const dir = p.deliver[shot.deliver ?? mod.deliver ?? 'default'];
      if (!existsSync(from)) continue;
      const to = join(dir, `${shot.name}.webp`);
      if (existsSync(to) && !flags.yes && readFileSync(to).compare(readFileSync(from)) !== 0) {
        held.push(to);
        continue;
      }
      mkdirSync(dir, { recursive: true });
      copyFileSync(from, to);
      log(`  ${to}`);
    }
  } else {
    for (const c of matchClips(p, patterns, { recorded: true })) {
      const clip = await loadClip(p, c);
      if (!existsSync(clip.paths.out)) continue;
      const r = deliverClip(p, clip, { overwrite: flags.yes });
      r.copied.forEach((f) => log(`  ${f}`));
      held = held.concat(r.held);
    }
  }
  if (held.length) {
    log(`\nkept ${held.length} delivered file(s) that differ; pass --yes to replace them:`);
    held.forEach((f) => log(`  ${f}`));
  }
}
