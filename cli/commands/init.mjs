/**
 * `dolly init` makes a workspace; `dolly init <project>` adds a product to
 * one. Everything about the product is read from its package.json and
 * lockfile (the product's repo is only ever read), printed back as what was
 * inferred and why, and asked for on a terminal when it cannot be inferred.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { PACKAGE, listProjects } from '../../engine/config.mjs';
import { WORKSPACE_FILE, expand, findRoot, loadWorkspace } from '../../engine/workspace.mjs';

export const usage = 'init [project]';
export const summary = 'make this folder a workspace, or add a product to the workspace you are in';
export const flags = `  --from DIR     the product's repo, read (never written) for its dev script, framework and port
  --base URL     where the product answers, when it is not a local dev server Dolly starts
  --port N       the port to pin the dev server to, instead of the one inferred
  --alias NAME   a short name for the project (the default is its initials)`;

/** A path for messages: ~ for the home folder, relative when it is below the current one. */
function show(p) {
  const rel = relative(process.cwd(), p);
  if (!rel) return 'this folder';
  if (!rel.startsWith('..')) return rel;
  return p.startsWith(`${homedir()}/`) ? `~${p.slice(homedir().length)}` : p;
}

const IGNORE = ['masters/', 'out/', '.dolly/'];

/** The folder a workspace goes in, made into one. */
function makeWorkspace(dir, log) {
  const inside = findRoot(dir);
  if (inside) {
    const where = inside === dir ? `${show(dir)} is already a Dolly workspace` : `${show(dir)} is already inside the workspace at ${show(inside)}`;
    throw new Error(`${where}; \`dolly init <project> --from <repo>\` adds a product to it`);
  }
  mkdirSync(join(dir, 'projects'), { recursive: true });
  writeFileSync(join(dir, WORKSPACE_FILE), `${JSON.stringify({ projects: 'projects', masters: 'masters', out: 'out' }, null, 2)}\n`);
  const gi = join(dir, '.gitignore');
  const had = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
  const missing = IGNORE.filter((l) => !had.split('\n').includes(l));
  if (missing.length) {
    const head = had ? `${had.replace(/\n?$/, '\n')}\n` : '';
    writeFileSync(gi, `${head}# Takes and renders are large and rebuilt from projects/; projects/ is what to keep.\n${missing.join('\n')}\n`);
  }
  if (existsSync(join(dir, 'package.json')) && dir !== PACKAGE.replace(/\/$/, '')) {
    log('note: this folder has a package.json. A workspace usually sits beside the product it records, not inside it.');
  }
  log(`made a Dolly workspace in ${show(dir)}: ${WORKSPACE_FILE}, projects/, and .gitignore for ${IGNORE.join(' ')}`);
}

/* ── Reading the product ─────────────────────────────────── */

const LOCKS = [
  ['package-lock.json', 'npm'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
];

/** The package manager: the lockfile in the repo or a folder above it (up to the git root), else packageManager, else npm. */
function packageManager(dir, pkg) {
  for (let d = dir; ; d = dirname(d)) {
    const lock = LOCKS.find(([f]) => existsSync(join(d, f)));
    if (lock) return { pm: lock[1], why: d === dir ? lock[0] : `${lock[0]} in ${show(d)}` };
    if (existsSync(join(d, '.git')) || dirname(d) === d) break;
  }
  const declared = /^(npm|pnpm|yarn|bun)@/.exec(pkg?.packageManager ?? '');
  if (declared) return { pm: declared[1], why: `packageManager "${pkg.packageManager}"` };
  return { pm: 'npm', why: 'no lockfile, so npm' };
}

/* Frameworks by what their dev script runs, then by dependency. `port` is the default a bare dev script serves on. */
const FRAMEWORKS = {
  next: { label: 'Next.js', port: 3000, script: /\bnext\b/, dep: 'next' },
  astro: { label: 'Astro', port: 4321, script: /\bastro\b/, dep: 'astro' },
  sveltekit: { label: 'SvelteKit', port: 5173, script: /\bvite\b/, dep: '@sveltejs/kit' },
  vite: { label: 'Vite', port: 5173, script: /\bvite\b/, dep: 'vite' },
  cra: { label: 'Create React App', port: 3000, script: /\breact-scripts\s+start\b/, dep: 'react-scripts' },
};

function framework(pkg, script) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const cmd = pkg.scripts?.[script] ?? '';
  if (FRAMEWORKS.sveltekit.script.test(cmd) && deps['@sveltejs/kit']) return { id: 'sveltekit', why: `@sveltejs/kit, and "${script}" runs vite` };
  for (const [id, f] of Object.entries(FRAMEWORKS)) {
    if (id !== 'sveltekit' && f.script.test(cmd)) return { id, why: `"${script}" runs \`${cmd}\`` };
  }
  for (const [id, f] of Object.entries(FRAMEWORKS)) {
    if (deps[f.dep]) return { id, why: `${f.dep} in its dependencies` };
  }
  return { id: 'plain', why: 'no framework Dolly knows in its package.json' };
}

/** A port the dev script pins itself: --port N, --port=N, -p N, or PORT=N before the command. */
function scriptPort(cmd = '') {
  const m = /(?:--port[=\s]+|\s-p\s+|\bPORT=)(\d{2,5})\b/.exec(cmd);
  return m ? Number(m[1]) : null;
}

/** A port set in the framework's config file (vite.config.ts `server: { port }`, astro.config.mjs `server: { port }`). */
function configPort(dir, id) {
  const stem = { vite: 'vite.config', sveltekit: 'vite.config', astro: 'astro.config' }[id];
  if (!stem) return null;
  const file = readdirSync(dir).find((f) => f.startsWith(`${stem}.`));
  if (!file) return null;
  const m = /\bport\s*:\s*(\d{2,5})\b/.exec(readFileSync(join(dir, file), 'utf8'));
  return m ? { port: Number(m[1]), why: `${file} sets port ${m[1]}` } : null;
}

/** How to start the product's dev server on `port`, and whether that command pins it. */
function startCommand({ pm, script, id, cmd, port }) {
  const pinned = scriptPort(cmd) === port;
  let args = '';
  let env = '';
  if (id === 'vite' || id === 'sveltekit') args = pinned ? (/--strictPort/.test(cmd) ? '' : '--strictPort') : `--port ${port} --strictPort`;
  else if (id === 'next' || id === 'astro') args = pinned ? '' : `--port ${port}`;
  else if (id === 'cra') env = `${pinned ? '' : `PORT=${port} `}BROWSER=none `;
  const run = pm === 'npm' && args ? `npm run ${script} --` : `${pm} run ${script}`;
  return { line: `${env}${run}${args ? ` ${args}` : ''}`, pins: pinned || id !== 'plain' };
}

/** Initials of a hyphenated name (field-notes is fn), or the first three letters of one word. */
function aliasFor(name, taken) {
  const parts = name.split(/[-_.]/).filter(Boolean);
  const alias = parts.length > 1 ? parts.map((p) => p[0]).join('') : name.length > 4 ? name.slice(0, 3) : null;
  return alias && !taken.has(alias) && alias !== name ? alias : null;
}

/* ── The command ─────────────────────────────────────────── */

export default async function init({ args, flags: opts, log }) {
  const tty = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const rl = tty ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  const ask = async (q, fallback = '') => {
    const a = (await rl.question(`${q}${fallback ? ` (${fallback})` : ''}: `)).trim();
    return a || fallback;
  };
  try {
    if (!args.length && !opts.from) return makeWorkspace(resolve(expand(opts.workspace) ?? process.cwd()), log);
    await addProject({ name: args[0], opts, tty, ask, log });
  } finally {
    rl?.close();
  }
}

async function addProject({ name, opts, tty, ask, log }) {
  if (!findRoot() && !opts.workspace && !process.env.DOLLY_WORKSPACE) {
    const here = process.cwd();
    if (!tty || !/^y/i.test(await ask(`no Dolly workspace here or above; make ${show(here)} one?`, 'y'))) {
      throw new Error('not inside a Dolly workspace: run `dolly init` in the folder that should hold your clips (beside the product, not in it), then `dolly init <project> --from <repo>` there');
    }
    makeWorkspace(here, log);
  }
  const ws = loadWorkspace({ workspace: opts.workspace });
  const inferred = [];
  const note = (key, value, why) => inferred.push([key, value, why]);

  let from = opts.from && opts.from !== true ? expand(opts.from) : null;
  if (opts.from === true) throw new Error('--from needs the path to the product\'s repo');
  if (!from && !opts.base && tty) {
    const a = await ask('where is the product\'s repo? (a path; leave empty if it already runs somewhere)');
    from = a ? expand(a) : null;
    if (!from) opts.base = await ask('its URL');
  }
  if (from && !existsSync(from)) throw new Error(`no folder at ${from}`);
  if (!from && !opts.base && !opts.port) throw new Error('where is the product? pass --from <its repo> (Dolly starts its dev server) or --base <url> (it already runs there)');

  if (!name && from) {
    const guess = basename(from).toLowerCase().replace(/[^\w.-]+/g, '-');
    name = tty ? await ask('project name', guess) : guess;
    if (!tty) note('name', name, `from the folder ${basename(from)}`);
  }
  if (!name) throw new Error('usage: dolly init <project> --from <path to the product repo> (or --base <url>)');
  if (!/^[\w.-]+$/.test(name)) throw new Error(`"${name}" cannot be a project name: use letters, digits, - . _`);
  const dir = join(ws.paths.projects, name);
  if (existsSync(join(dir, 'project.json'))) throw new Error(`${show(dir)} already exists; edit its project.json instead`);
  if (from && ws.root.startsWith(`${from}/`)) throw new Error(`the workspace is inside ${show(from)}; keep clips beside the product, not in it`);

  const others = listProjects(ws).map((p) => ({ ...p, cfg: JSON.parse(readFileSync(join(p.dir, 'project.json'), 'utf8')) }));
  const portOf = (base) => {
    try {
      const u = new URL(base);
      return /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(u.hostname) ? Number(u.port || (u.protocol === 'https:' ? 443 : 80)) : null;
    } catch {
      return null;
    }
  };
  const usedPorts = new Map(others.map((p) => [portOf(p.cfg.base ?? ''), p.name]).filter(([port]) => port));

  /* The product: its package.json, dev script, framework, package manager. */
  const pkgFile = from && join(from, 'package.json');
  const pkg = pkgFile && existsSync(pkgFile) ? JSON.parse(readFileSync(pkgFile, 'utf8')) : null;
  if (from) note('from', show(from), pkg ? `package.json "${pkg.name ?? basename(from)}"` : 'no package.json');
  const script = pkg && ['dev', 'start', 'develop', 'serve'].find((s) => pkg.scripts?.[s]);
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
  const fromBase = opts.base ? portOf(opts.base) : null;
  const fromScript = scriptPort(cmd);
  const fromConfig = from && configPort(from, fw.id);
  if (opts.port) [port, portWhy] = [Number(opts.port), '--port'];
  else if (fromBase) [port, portWhy] = [fromBase, '--base'];
  else if (fromScript) [port, portWhy] = [fromScript, `"${script}" pins it`];
  else if (fromConfig) [port, portWhy] = [fromConfig.port, fromConfig.why];
  else if (script && fw.id !== 'plain') [port, portWhy] = [FRAMEWORKS[fw.id].port, `${FRAMEWORKS[fw.id].label}'s default`];
  if (fromScript && port !== fromScript) throw new Error(`"${script}" pins port ${fromScript}, so it cannot also serve on ${port}; drop --port, or change the script`);
  if (!port && !opts.base) {
    if (!tty) throw new Error(`cannot tell which port ${name} serves on${script ? ` ("${script}" is \`${cmd}\`)` : ''}: pass --port N or --base URL`);
    port = Number(await ask('which port does it serve on?'));
    portWhy = 'you said';
    if (!Number.isInteger(port) || port <= 0) throw new Error('a port is a number, like 5173');
  }
  /* Two projects on one port would record each other: Dolly reuses whatever already answers at a base. */
  if (port && usedPorts.has(port) && !opts.port && !opts.base && !fromScript) {
    const was = port;
    while (usedPorts.has(port)) port += 1;
    portWhy = `${portWhy}, moved from ${was}: ${usedPorts.get(was)} serves there`;
  } else if (port && usedPorts.has(port)) {
    log(`warning: ${usedPorts.get(port)} also serves on port ${port}; record one at a time, or Dolly will record whichever is up`);
  }

  let base = opts.base && opts.base !== true ? opts.base : null;
  if (!base && port) base = `http://localhost:${port}`;
  if (port) note('port', port, portWhy);
  note('base', base, opts.base ? '--base' : 'localhost on that port');

  let start = null;
  if (script && from && portOf(base) === port) {
    const s = startCommand({ pm, script, id: fw.id, cmd, port });
    start = { cwd: from.startsWith(`${homedir()}/`) ? `~${from.slice(homedir().length)}` : from, cmd: s.line };
    let why = s.pins ? 'pins the port, so a busy port fails instead of moving' : `"${script}" takes no port Dolly knows how to pin: make sure it serves on ${port}`;
    if (fw.id === 'next' || fw.id === 'astro') why = `${FRAMEWORKS[fw.id].label} moves to another port when ${port} is busy: keep it free`;
    note('start', s.line, why);
  } else {
    note('start', 'none', 'start the product yourself before recording');
  }

  const taken = new Set(others.flatMap((p) => [p.name, p.alias].filter(Boolean)));
  if (opts.alias && taken.has(opts.alias)) throw new Error(`the alias "${opts.alias}" is taken`);
  const alias = opts.alias && opts.alias !== true ? opts.alias : aliasFor(name, taken);
  if (alias) note('alias', alias, opts.alias ? '--alias' : /[-_.]/.test(name) ? 'its initials' : 'its first letters');

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
  const clip = `${alias ?? name}-first`;
  const scenario = join(dir, 'scenarios', `${clip}.mjs`);
  const handle = alias ?? name;
  mkdirSync(join(dir, 'scenarios'), { recursive: true });
  mkdirSync(join(dir, 'cameras'), { recursive: true });
  writeFileSync(join(dir, 'project.json'), `${JSON.stringify(project, null, 2)}\n`);
  const template = readFileSync(join(PACKAGE, 'templates', 'scenario.mjs'), 'utf8');
  writeFileSync(scenario, template.replaceAll('__PROJECT__', handle).replaceAll('__CLIP__', clip));

  const w = Math.max(...inferred.map(([k]) => k.length));
  const v = Math.min(44, Math.max(...inferred.map(([, x]) => String(x).length)));
  log(`added ${name}${alias ? ` (${alias})` : ''} to the workspace in ${show(ws.root)}\n`);
  for (const [k, x, why] of inferred) log(`  ${k.padEnd(w)}  ${String(x).padEnd(v)}  ${why}`.trimEnd());
  log(`\nwrote
  ${show(join(dir, 'project.json'))}
  ${show(scenario)}
  ${show(join(dir, 'cameras'))}/`);
  const steps = [
    [`dolly inspect ${handle}`, 'what the page has: its controls, with boxes, and a screenshot'],
    [`edit ${show(scenario)}`, 'set TARGET and PANEL from what inspect lists, and the TIMING'],
    [`dolly record ${handle} ${clip}`, 'a take in the real product, and its camera'],
    [`dolly storyboard ${handle} ${clip}`, 'watch the camera over the take, direct it, render'],
  ];
  const sw = Math.max(...steps.map(([s]) => s.length));
  log(`\nnext\n${steps.map(([s, why]) => `  ${s.padEnd(sw)}  ${why}`).join('\n')}`);
  log(`\nproject.json's "deliver" is empty: name a folder there ("default": "<site>/public/media") before \`dolly deliver\`.`);
}
