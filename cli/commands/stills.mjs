import { ensureServer } from '../../engine/server.mjs';
import { shootStills } from '../../engine/stills.mjs';

export const usage = 'stills <project> [filter]';
export const summary = "shoot the project's stills (its stills.mjs), failing on any two that come out the same";

export default async function stills({ args: [name, filter], flags, project, log }) {
  const p = await project(name);
  const server = await ensureServer(p, { log });
  try {
    const r = await shootStills(p, { filter, query: flags.query, log });
    const failed = r.results.filter((x) => x.error);
    log(`wrote ${r.results.length - failed.length} still(s) to ${p.workspace.rel(r.outDir)}`);
    r.duplicates.forEach((d) => log(`  DUPLICATE: ${d.join(' and ')} came out byte-identical`));
    if (failed.length || r.duplicates.length) process.exitCode = 1;
  } finally {
    await server.stop();
  }
}
