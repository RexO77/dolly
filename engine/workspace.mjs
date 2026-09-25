/**
 * A workspace: the folder where someone's clips live, apart from the tool.
 * It holds a dolly.json and, by default:
 *
 *   projects/<product>/   project.json, scenarios/, cameras/   (keep in git)
 *   masters/<product>/    raw takes and their take files        (large, gitignored)
 *   out/<product>/        rendered clips and posters            (gitignored)
 *   .dolly/               scratch: frames, proxies, logs        (gitignored)
 *
 * Dolly finds it the way ESLint finds its config: from the current folder
 * upwards, or from DOLLY_WORKSPACE, or from --workspace.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

export const WORKSPACE_FILE = 'dolly.json';

export const expand = (p) => (p ? resolve(p.replace(/^~(?=$|\/)/, homedir())) : p);

/** The folder holding dolly.json at or above `from`, or null. */
export function findRoot(from = process.cwd()) {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    if (existsSync(join(dir, WORKSPACE_FILE))) return dir;
    if (dirname(dir) === dir) return null;
  }
}

/** Load a workspace; throws with the way out when there is none. */
export function loadWorkspace({ workspace, cwd = process.cwd() } = {}) {
  const explicit = expand(workspace ?? process.env.DOLLY_WORKSPACE);
  const root = explicit ?? findRoot(cwd);
  if (!root || !existsSync(join(root, WORKSPACE_FILE))) {
    throw new Error(explicit
      ? `no ${WORKSPACE_FILE} in ${explicit}`
      : `not inside a Dolly workspace (no ${WORKSPACE_FILE} here or above); run \`dolly init\` to make one, or pass --workspace`);
  }
  const config = JSON.parse(readFileSync(join(root, WORKSPACE_FILE), 'utf8'));
  const at = (key, fallback) => resolve(root, config[key] ?? fallback);
  return {
    root,
    config,
    paths: {
      projects: at('projects', 'projects'),
      masters: at('masters', 'masters'),
      out: at('out', 'out'),
      tmp: at('tmp', '.dolly'),
    },
    /** A path as the workspace sees it, for messages. */
    rel: (p) => (p.startsWith(`${root}/`) ? p.slice(root.length + 1) : p),
  };
}
