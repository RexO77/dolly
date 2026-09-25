import { ensureServer } from '../../engine/server.mjs';
import { shootStills } from '../../engine/stills.mjs';

export const usage = 'stills <project> [name]';
export const summary = "Shoot the project's stills";
export const details = `The shots come from projects/<project>/stills.mjs, and each is written to
out/<project>/stills/<name>.webp. A name shoots only the stills whose names
contain it. The run fails when two stills come out identical, since two
pages that look the same are a mistake to fix. \`dolly deliver --stills\`
copies them where they ship.`;
export const flags = [['--query k=v', 'add a query parameter to every still\'s URL (repeatable)']];
export const examples = ['dolly stills shop', 'dolly stills shop settings'];

export default async function stills({ args: [name, filter], flags, project, log }) {
  const p = await project(name);
  const server = await ensureServer(p, { log });
  try {
    const { results, duplicates, outDir } = await shootStills(p, { filter, query: flags.query, log });
    const failed = results.filter((r) => r.error);
    log(`wrote ${results.length - failed.length} still${results.length - failed.length === 1 ? '' : 's'} to ${p.workspace.rel(outDir)}`);
    const unnamed = [...new Set(results.filter((r) => r.file && !p.deliver[r.shot.deliver]).map((r) => r.shot.deliver))];
    if (unnamed.length) log(`note: project.json names no deliver folder ${unnamed.map((key) => `"${key}"`).join(' or ')}, so \`dolly deliver --stills\` has nowhere to put some of them`);
    duplicates.forEach((names) => log(`  DUPLICATE: ${names.join(' and ')} came out identical; check that each points at a different page`));
    if (failed.length || duplicates.length) process.exitCode = 1;
  } finally {
    await server.stop();
  }
}
