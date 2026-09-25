/* What every command shares: reading its arguments, writing its output, and the workspace and project it runs against. */
import { homedir } from 'node:os';
import { relative } from 'node:path';
import { loadWorkspace } from '../engine/workspace.mjs';
import { loadProject } from '../engine/config.mjs';

/** A flag spec like '--takes N' as its name and whether it takes a value. */
export function flagSpec(spec) {
  const [, name, value] = /^--([\w-]+)(\s+\S+)?/.exec(spec);
  return { name, valued: Boolean(value) };
}

/**
 * Split argv into positional `args` and `flags`. Flags named in `valued`
 * take a value (`--port 4800` or `--port=4800`); `--query k=v` repeats into
 * an object; `--no-x` sets x to false; every other flag is true. `-h` and
 * `-v` are --help and --version.
 */
export function parse(argv, valued = new Set()) {
  const args = [];
  const flags = { query: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h') flags.help = true;
    else if (arg === '-v') flags.version = true;
    else if (!arg.startsWith('--')) args.push(arg);
    else {
      const [key, inline] = arg.slice(2).split(/=(.*)/s, 2);
      if (key === 'query' || valued.has(key)) {
        const value = inline ?? argv[i + 1];
        if (value === undefined || (inline === undefined && value.startsWith('--'))) {
          throw new Error(`--${key} needs a value, like ${key === 'query' ? '--query demo=1' : `--${key} ${placeholder(key)}`}`);
        }
        if (inline === undefined) i += 1;
        if (key === 'query') {
          const [name, ...rest] = value.split('=');
          flags.query[name] = rest.join('=');
        } else flags[key] = value;
      } else if (key.startsWith('no-')) flags[key.slice(3)] = false;
      else flags[key] = true;
    }
  }
  return { args, flags };
}

const placeholder = (key) => ({ takes: '3', port: '4800', at: '2.5' }[key] ?? '<value>');

/** A flag's value as a number, or an error that says what it should be. Undefined when the flag is absent. */
export function numberFlag(flags, name, { integer = false, min = 0 } = {}) {
  if (flags[name] === undefined) return undefined;
  const value = Number(flags[name]);
  if (!Number.isFinite(value) || value < min || (integer && !Number.isInteger(value))) {
    throw new Error(`--${name} takes ${integer ? 'a whole number' : 'a number'}${min > 0 ? ` of ${min} or more` : ''}, not "${flags[name]}"`);
  }
  return value;
}

export const log = (...lines) => console.log(...lines);

/** Seconds as `1.25s`. */
export const seconds = (s) => `${s.toFixed(2)}s`;

/** A path as a person reads it: relative below the current folder, ~ for home, else absolute. */
export function displayPath(path) {
  const rel = relative(process.cwd(), path);
  if (!rel) return 'this folder';
  if (!rel.startsWith('..')) return rel;
  return path.startsWith(`${homedir()}/`) ? `~${path.slice(homedir().length)}` : path;
}

/** A one-line percentage on a terminal; nothing when the output is piped. */
export function progress(label) {
  if (!process.stdout.isTTY) return undefined;
  return (done, total) => {
    process.stdout.write(`\r  ${label} ${Math.min(100, Math.round((done / Math.max(total, 1)) * 100))}%`);
    if (done >= total) process.stdout.write('\r\x1b[K');
  };
}

/** The context a command runs with. The workspace is loaded only when a command asks for it. */
export function context(args, flags) {
  let workspace;
  const loadedWorkspace = () => (workspace ??= loadWorkspace({ workspace: flags.workspace }));
  return {
    args,
    flags,
    log,
    workspace: loadedWorkspace,
    async project(name) {
      if (!name) throw new Error('name a project first; `dolly list` shows them');
      return loadProject(loadedWorkspace(), name, { masters: flags.masters, out: flags.out });
    },
  };
}
