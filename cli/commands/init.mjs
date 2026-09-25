/**
 * `dolly init` makes a workspace; `dolly init <project>` adds a product to
 * one. Everything about the product is read from its package.json and
 * lockfile (the product's repo is only ever read), printed back as what was
 * inferred and why, and asked for on a terminal when it cannot be inferred.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { PACKAGE, listProjects } from '../../engine/config.mjs';
import { WORKSPACE_FILE, expand, findRoot, loadWorkspace } from '../../engine/workspace.mjs';
import { readJson, writeJson } from '../../engine/files.mjs';
import { DEV_SCRIPTS, FRAMEWORKS, aliasFor, configPort, framework, localPort, packageManager, scriptPort, startCommand } from '../product.mjs';
import { displayPath } from '../util.mjs';

export const usage = 'init [project]';
export const summary = 'Make a workspace, or add a product to it';
export const details = `Without a project name, the current folder becomes a workspace: where your
clips live, beside your products and never inside one. With one, Dolly reads
the product's package.json for its dev script, framework and port, then
writes projects/<project>/ with a project.json and a first scenario.`;
export const flags = [
  ['--from DIR', "the product's repo, read (never written) for its dev script, framework and port"],
  ['--base URL', 'where the product answers, for one that already runs somewhere'],
  ['--port N', 'the port to pin its dev server to, instead of the one inferred'],
  ['--alias NAME', 'a short name for the project (default: the initials of a hyphenated name, or the first three letters of a longer one)'],
];
export const examples = ['dolly init', 'dolly init shop --from ~/code/shop', 'dolly init docs --base https://docs.example.com'];

const IGNORE = ['masters/', 'out/', '.dolly/'];
const NAME = /^[\w][\w.-]*$/;
const tilde = (path) => (path.startsWith(`${homedir()}/`) ? `~${path.slice(homedir().length)}` : path);

/** Make `dir` a workspace: dolly.json, projects/, and .gitignore lines for what is rebuilt. */
function makeWorkspace(dir, log) {
  const inside = findRoot(dir);
  if (inside) {
    const where = inside === dir ? `${displayPath(dir)} is already a Dolly workspace` : `${displayPath(dir)} is inside the workspace at ${displayPath(inside)}`;
    throw new Error(`${where}; \`dolly init <project> --from <repo>\` adds a product to it`);
  }
  mkdirSync(join(dir, 'projects'), { recursive: true });
  writeJson(join(dir, WORKSPACE_FILE), { projects: 'projects', masters: 'masters', out: 'out' });
  const gitignore = join(dir, '.gitignore');
  const had = existsSync(gitignore) ? readFileSync(gitignore, 'utf8') : '';
  const missing = IGNORE.filter((line) => !had.split('\n').includes(line));
  if (missing.length) {
    const head = had ? `${had.replace(/\n?$/, '\n')}\n` : '';
    writeFileSync(gitignore, `${head}# Takes and renders are large and rebuilt from projects/; projects/ is what to keep.\n${missing.join('\n')}\n`);
  }
  if (existsSync(join(dir, 'package.json')) && dir !== PACKAGE.replace(/\/$/, '')) {
    log('note: this folder has a package.json. A workspace usually sits beside the product it records, not inside it.');
  }
  log(`made a Dolly workspace in ${displayPath(dir)}: ${WORKSPACE_FILE}, projects/, and a .gitignore for ${IGNORE.join(' ')}`);
}

export default async function init({ args, flags: options, log }) {
  const tty = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const rl = tty ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  const ask = async (question, fallback = '') => {
    const answer = (await rl.question(`${question}${fallback ? ` (${fallback})` : ''}: `)).trim();
    return answer || fallback;
  };
  try {
    if (!args.length && !options.from && !options.base) return makeWorkspace(resolve(expand(options.workspace) ?? process.cwd()), log);
    await addProject({ name: args[0], options, tty, ask, log });
  } finally {
    rl?.close();
  }
}

/** Find the workspace to add to, offering to make the current folder one on a terminal. */
async function workspaceFor(options, tty, ask, log) {
  if (!findRoot() && !options.workspace && !process.env.DOLLY_WORKSPACE) {
    const here = process.cwd();
    if (!tty || !/^y/i.test(await ask(`there is no Dolly workspace here or above; make ${displayPath(here)} one?`, 'y'))) {
      throw new Error('this folder is not in a Dolly workspace. Run `dolly init` in the folder that should hold your clips (beside the product, not in it), then `dolly init <project> --from <repo>` there');
    }
    makeWorkspace(here, log);
  }
  return loadWorkspace({ workspace: options.workspace });
}

/** Where the product is: its repo (`--from`), or a URL it already answers at (`--base`). */
async function locateProduct(options, tty, ask) {
  let from = options.from ? expand(options.from) : null;
  let base = options.base ?? null;
  if (!from && !base && tty) {
    const answer = await ask("where is the product's repo? (a path; leave it empty if it already runs somewhere)");
    from = answer ? expand(answer) : null;
    if (!from) base = await ask('its URL');
  }
  if (from && !(existsSync(from) && statSync(from).isDirectory())) throw new Error(`there is no folder at ${from}; --from takes the product's repo`);
  if (!from && !base && !options.port) throw new Error("where is the product? Pass --from <its repo> (Dolly starts its dev server) or --base <url> (it already runs there)");
  if (base) {
    try {
      new URL(base);
    } catch {
      throw new Error(`--base takes a URL, like http://localhost:5173, not "${base}"`);
    }
  }
  return { from, base };
}

async function addProject({ name, options, tty, ask, log }) {
  if (options.alias && !NAME.test(options.alias)) throw new Error(`"${options.alias}" cannot be an alias: use letters, digits, - . _`);
  const ws = await workspaceFor(options, tty, ask, log);
  const inferred = [];
  const note = (key, value, why) => inferred.push([key, value, why]);
  const { from, base: givenBase } = await locateProduct(options, tty, ask);

  if (!name && from) {
    const guess = basename(from).toLowerCase().replace(/[^\w.-]+/g, '-').replace(/^[^\w]+/, '');
    name = tty ? await ask('project name', guess) : guess;
    if (!tty) note('name', name, `from the folder ${basename(from)}`);
  }
  if (!name) throw new Error('name the project, like `dolly init shop --from ~/code/shop`');
  if (!NAME.test(name)) throw new Error(`"${name}" cannot be a project name: use letters, digits, - . _ (and start with a letter or digit)`);
  const dir = join(ws.paths.projects, name);
  if (existsSync(join(dir, 'project.json'))) throw new Error(`${displayPath(dir)} already exists; edit its project.json instead`);
  if (from) {
    const [root, repo] = [realpathSync(ws.root), realpathSync(from)];
    if (root === repo || root.startsWith(`${repo}/`)) throw new Error(`the workspace is inside ${displayPath(from)}; keep clips beside the product, not in it`);
  }

  const others = listProjects(ws).map((p) => ({ ...p, config: readJson(join(p.dir, 'project.json')) }));
  const usedPorts = new Map(others.map((p) => [localPort(p.config.base ?? ''), p.name]).filter(([port]) => port));

  /* The product: its package.json, dev script, framework, package manager. */
  const pkgFile = from && join(from, 'package.json');
  const pkg = pkgFile && existsSync(pkgFile) ? readJson(pkgFile) : null;
  if (from) note('from', displayPath(from), pkg ? `package.json "${pkg.name ?? basename(from)}"` : 'no package.json');
  const script = pkg && DEV_SCRIPTS.find((s) => pkg.scripts?.[s]);
  const cmd = script ? pkg.scripts[script] : '';
  const fw = pkg ? framework(pkg, script) : { id: 'plain', why: 'no package.json' };
  if (from) note('framework', fw.id === 'plain' ? 'none Dolly knows' : FRAMEWORKS[fw.id].label, fw.why);
  const { pm, why: pmWhy } = pkg ? packageManager(from, pkg) : { pm: null };
  if (script) {
    note('script', `${script}: ${cmd}`, script === 'dev' ? 'its dev script' : 'no dev script, so this one');
    note('manager', pm, pmWhy);
  }

  /* The port: explicit, then the base URL's, then the script's, the config's, the framework's default. */
  let port = null;
  let portWhy = '';
  const fromBase = givenBase ? localPort(givenBase) : null;
  const fromScript = scriptPort(cmd);
  const fromConfig = from && configPort(from, fw.id);
  if (options.port) {
    port = Number(options.port);
    portWhy = '--port';
    if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error(`--port takes a port number, like 5173, not "${options.port}"`);
  } else if (fromBase) [port, portWhy] = [fromBase, '--base'];
  else if (fromScript) [port, portWhy] = [fromScript, `"${script}" pins it`];
  else if (fromConfig) [port, portWhy] = [fromConfig.port, fromConfig.why];
  else if (script && fw.id !== 'plain') [port, portWhy] = [FRAMEWORKS[fw.id].port, `${FRAMEWORKS[fw.id].label}'s default`];
  if (fromScript && port !== fromScript) {
    throw new Error(`"${script}" pins port ${fromScript}, so it cannot also serve on ${port}; drop ${options.port ? '--port' : '--base'}, or change the script`);
  }
  if (!port && !givenBase) {
    if (!tty) throw new Error(`cannot tell which port ${name} serves on${script ? ` ("${script}" is \`${cmd}\`)` : ''}; pass --port N or --base URL`);
    port = Number(await ask('which port does it serve on?'));
    portWhy = 'you said';
    if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error('a port is a number, like 5173');
  }
  /* Two projects on one port would record each other: Dolly reuses whatever already answers at a base. */
  if (port && usedPorts.has(port) && !options.port && !givenBase && !fromScript) {
    const was = port;
    while (usedPorts.has(port)) port += 1;
    portWhy = `${portWhy}, moved from ${was}: ${usedPorts.get(was)} serves there`;
  } else if (port && usedPorts.has(port)) {
    log(`warning: ${usedPorts.get(port)} also serves on port ${port}; record one at a time, or Dolly will record whichever is up`);
  }

  const base = givenBase ?? `http://localhost:${port}`;
  if (port) note('port', port, portWhy);
  note('base', base, givenBase ? '--base' : 'localhost on that port');

  let start = null;
  if (script && from && localPort(base) === port) {
    const command = startCommand({ pm, script, id: fw.id, cmd, port });
    start = { cwd: tilde(from), cmd: command.line };
    let why = command.pins ? 'pins the port, so a busy port fails instead of moving' : `"${script}" takes no port Dolly knows how to pin: make sure it serves on ${port}`;
    if (fw.id === 'next' || fw.id === 'astro') why = `${FRAMEWORKS[fw.id].label} moves to another port when ${port} is busy: keep it free`;
    note('start', command.line, why);
  } else {
    note('start', 'none', 'start the product yourself before recording');
  }

  const taken = new Set(others.flatMap((p) => [p.name, p.alias].filter(Boolean)));
  if (taken.has(name)) throw new Error(`another project already goes by "${name}"; pick another name`);
  if (options.alias && taken.has(options.alias)) throw new Error(`another project already goes by "${options.alias}"; pick another --alias`);
  const alias = options.alias ?? aliasFor(name, taken);
  if (alias) note('alias', alias, options.alias ? '--alias' : /[-_.]/.test(name) ? 'its initials' : 'its first letters');

  const project = {
    name,
    ...(alias ? { alias } : {}),
    base,
    ...(start ? { start } : {}),
    viewport: { width: 1440, height: 900, dpr: 2 },
    preset: 'web-1920',
    deliver: {},
  };
  note('viewport', '1440x900 at 2x', 'records 2880x1800 on a retina display');

  /* Write the project: its config, a first scenario, and an empty cameras/. */
  const handle = alias ?? name;
  const clip = `${handle}-first`;
  const scenario = join(dir, 'scenarios', `${clip}.mjs`);
  mkdirSync(join(dir, 'scenarios'), { recursive: true });
  mkdirSync(join(dir, 'cameras'), { recursive: true });
  writeJson(join(dir, 'project.json'), project);
  const keptScenario = existsSync(scenario);
  if (!keptScenario) {
    const template = readFileSync(join(PACKAGE, 'templates', 'scenario.mjs'), 'utf8');
    writeFileSync(scenario, template.replaceAll('__PROJECT__', handle).replaceAll('__CLIP__', clip));
  }

  const keyWidth = Math.max(...inferred.map(([key]) => key.length));
  const valueWidth = Math.min(44, Math.max(...inferred.map(([, value]) => String(value).length)));
  log(`added ${name}${alias ? ` (${alias})` : ''} to the workspace in ${displayPath(ws.root)}\n`);
  for (const [key, value, why] of inferred) log(`  ${key.padEnd(keyWidth)}  ${String(value).padEnd(valueWidth)}  ${why}`.trimEnd());
  log(`\nwrote
  ${displayPath(join(dir, 'project.json'))}
  ${displayPath(scenario)}${keptScenario ? ' (it was already there, so it is kept as it was)' : ''}
  ${displayPath(join(dir, 'cameras'))}/`);
  const steps = [
    [`dolly inspect ${handle}`, "list the page's controls, with their boxes, and a screenshot"],
    [`edit ${displayPath(scenario)}`, 'set TARGET and PANEL from what inspect lists, and the TIMING'],
    [`dolly record ${handle} ${clip}`, 'record a take in the real product, and its camera'],
    [`dolly studio ${handle} ${clip}`, 'watch the camera over the take, direct it, render'],
  ];
  const stepWidth = Math.max(...steps.map(([step]) => step.length));
  log(`\nnext\n${steps.map(([step, why]) => `  ${step.padEnd(stepWidth)}  ${why}`).join('\n')}`);
  log(`\nBefore \`dolly deliver\`, name a folder under "deliver" in project.json, like "default": "~/site/public/media".`);
}
