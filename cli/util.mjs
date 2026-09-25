/* What every command shares: argument parsing, output, and the workspace and project it runs against. */
import { loadWorkspace } from '../engine/workspace.mjs';
import { loadProject } from '../engine/config.mjs';

/** Flags that take a value; every other --flag is a boolean, and --no-x sets x to false. */
const VALUED = new Set(['takes', 'masters', 'out', 'at', 'port', 'workspace', 'from', 'base', 'alias']);

export function parse(argv) {
  const args = [];
  const flags = { query: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      args.push(a);
      continue;
    }
    const [key, inline] = a.slice(2).split('=', 2);
    const value = () => inline ?? argv[++i];
    if (key === 'query') {
      const [k, v] = value().split('=');
      flags.query[k] = v ?? '';
    } else if (VALUED.has(key)) flags[key] = value();
    else if (key.startsWith('no-')) flags[key.slice(3)] = false;
    else flags[key] = true;
  }
  return { args, flags };
}

export const log = (...m) => console.log(...m);
export const fmt = (s) => `${s.toFixed(2)}s`;

/** A one-line percentage on a terminal, nothing when piped. */
export function progress(label) {
  if (!process.stdout.isTTY) return undefined;
  return (done, total) => {
    process.stdout.write(`\r  ${label} ${Math.min(100, Math.round((done / Math.max(total, 1)) * 100))}%`);
    if (done >= total) process.stdout.write('\r\x1b[K');
  };
}

/** The context a command runs with. The workspace is loaded only when a command asks for it. */
export function context(args, flags) {
  let ws;
  const workspace = () => (ws ??= loadWorkspace({ workspace: flags.workspace }));
  return {
    args,
    flags,
    log,
    workspace,
    rel: (p) => workspace().rel(p),
    async project(name) {
      if (!name) throw new Error('which project? (`dolly list` shows them)');
      return loadProject(workspace(), name, { masters: flags.masters, out: flags.out });
    },
  };
}
