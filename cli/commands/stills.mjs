import { shootStills } from '../../engine/stills.mjs';
import { startProduct } from '../steps.mjs';

export const usage = 'stills <project> [name]';
export const summary = "Shoot the project's stills";
export const details = `The shots come from projects/<project>/stills.mjs, and each is written to
out/<project>/stills/<name>.webp. A name shoots only the stills whose names
contain it. The run fails when two stills come out identical, since two
pages that look the same are a mistake to fix. \`dolly deliver --stills\`
copies them where they ship.`;
export const flags = [['--query k=v', 'add a query parameter to every still\'s URL (repeatable)']];
export const examples = ['dolly stills shop', 'dolly stills shop settings'];

/** The engine's line for each still (`  name`, or `  name FAILED: why`) as a step's line. */
const stillLog = (ui) => (text) => {
  const [, still, why] = /^\s*(.+?)(?: FAILED: (.*))?$/s.exec(text);
  if (why) ui.fail(`${still}: ${why}`);
  else ui.ok(still);
};

export default async function stills({ args: [name, filter], flags, project, ui }) {
  const p = await project(name);
  const server = await startProduct(ui, p);
  try {
    const { results, duplicates, outDir } = await shootStills(p, { filter, query: flags.query, log: stillLog(ui) });
    const failed = results.filter((r) => r.error);
    const shot = results.length - failed.length;
    const unnamed = [...new Set(results.filter((r) => r.file && !p.deliver[r.shot.deliver]).map((r) => r.shot.deliver))];
    if (unnamed.length) ui.note(`project.json names no deliver folder ${unnamed.map((key) => `"${key}"`).join(' or ')}, so \`dolly deliver --stills\` has nowhere to put some of them`);
    duplicates.forEach((names) => ui.fail(`${names.join(' and ')} came out identical; check that each points at a different page`));
    if (failed.length || duplicates.length) process.exitCode = 1;
    ui.summary([
      ['made', shot ? ui.pair(`${p.workspace.rel(outDir)}/`, `${shot} still${shot === 1 ? '' : 's'}`) : null],
      ['took', ui.took()],
      ['next', shot && !failed.length && !duplicates.length ? `dolly deliver ${p.alias ?? p.name} --stills` : null],
    ]);
  } finally {
    await server.stop();
  }
}
