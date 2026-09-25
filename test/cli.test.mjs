import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../cli/util.mjs';
import { aliasFor, framework, scriptPort, startCommand } from '../cli/product.mjs';

const BIN = fileURLToPath(new URL('../bin/dolly.mjs', import.meta.url));

/** Run `dolly` in `cwd`, off a terminal, with no workspace from the environment. */
function dolly(cwd, ...args) {
  const env = { ...process.env };
  delete env.DOLLY_WORKSPACE;
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, env, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const scratch = () => mkdtempSync(join(tmpdir(), 'dolly-cli-'));

/** A product repo that runs Vite, with a lockfile. */
function viteRepo(parent, name, { script = 'vite' } = {}) {
  const dir = join(parent, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, scripts: { dev: script }, devDependencies: { vite: '^6' } }));
  writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
  return dir;
}

test('flags take values inline or after, repeat into --query, and a valued flag without a value is an error', () => {
  const valued = new Set(['takes', 'port']);
  assert.deepEqual(parse(['record', 'shop', '--takes', '3', '--port=4801', '--render', '--no-open', '--query', 'demo=1', '--query=a=b=c'], valued), {
    args: ['record', 'shop'],
    flags: { query: { demo: '1', a: 'b=c' }, takes: '3', port: '4801', render: true, open: false },
  });
  assert.throws(() => parse(['--takes'], valued), /--takes needs a value/);
  assert.throws(() => parse(['--takes', '--render'], valued), /--takes needs a value/);
  assert.deepEqual(parse(['-h', '-v']).flags, { query: {}, help: true, version: true });
});

test('help lists every command, and each command has its own help', () => {
  const { code, out } = dolly(tmpdir(), 'help');
  assert.equal(code, 0);
  for (const name of ['init', 'doctor', 'inspect', 'record', 'studio', 'render', 'deliver', 'list', 'direct', 'poster', 'stills']) {
    assert.match(out, new RegExp(`dolly ${name}\\b`));
    const own = dolly(tmpdir(), name, '--help');
    assert.equal(own.code, 0, own.err);
    assert.match(own.out, new RegExp(`^dolly ${name}`));
  }
  assert.match(dolly(tmpdir(), 'help', 'storyboard').out, /^dolly studio/, 'storyboard still works, as the Studio');
});

test('a mistyped command or flag stops with a pointer to help', () => {
  const command = dolly(tmpdir(), 'recrod');
  assert.equal(command.code, 1);
  assert.match(command.err, /no command "recrod"/);
  const flag = dolly(tmpdir(), 'render', 'shop', '--redirct');
  assert.equal(flag.code, 1);
  assert.match(flag.err, /no --redirct flag.*dolly help render/);
});

test('outside a workspace a command says how to make one', () => {
  const r = dolly(scratch(), 'list');
  assert.equal(r.code, 1);
  assert.match(r.err, /dolly init/);
});

test('init makes a workspace once, and refuses to make another inside it', () => {
  const root = scratch();
  assert.equal(dolly(root, 'init').code, 0);
  assert.ok(existsSync(join(root, 'dolly.json')));
  assert.match(readFileSync(join(root, '.gitignore'), 'utf8'), /masters\//);
  mkdirSync(join(root, 'inner'));
  const again = dolly(join(root, 'inner'), 'init');
  assert.equal(again.code, 1);
  assert.match(again.err, /inside the workspace/);
});

test('init adds a product from its repo: its manager, port and a start command that pins it', () => {
  const root = scratch();
  const repo = viteRepo(root, 'field-notes');
  const ws = join(root, 'clips');
  mkdirSync(ws);
  dolly(ws, 'init');
  const r = dolly(ws, 'init', '--from', repo);
  assert.equal(r.code, 0, r.err);
  const project = JSON.parse(readFileSync(join(ws, 'projects', 'field-notes', 'project.json'), 'utf8'));
  assert.equal(project.alias, 'fn');
  assert.equal(project.base, 'http://localhost:5173');
  assert.equal(project.start.cmd, 'pnpm run dev --port 5173 --strictPort');
  assert.ok(existsSync(join(ws, 'projects', 'field-notes', 'scenarios', 'fn-first.mjs')));

  const second = dolly(ws, 'init', 'blog', '--from', viteRepo(root, 'blog'));
  assert.equal(second.code, 0, second.err);
  const blog = JSON.parse(readFileSync(join(ws, 'projects', 'blog', 'project.json'), 'utf8'));
  assert.equal(blog.base, 'http://localhost:5174', 'a port another project uses moves to the next free one');
});

test('init refuses what would go wrong later', () => {
  const root = scratch();
  const repo = viteRepo(root, 'shop', { script: 'vite --port 4000' });
  const ws = join(root, 'clips');
  mkdirSync(ws);
  dolly(ws, 'init');
  assert.match(dolly(ws, 'init', 'shop', '--from', repo, '--port', '5000').err, /pins port 4000/);
  assert.match(dolly(ws, 'init', 'shop', '--base').err, /--base needs a value/);
  assert.match(dolly(ws, 'init', 'shop', '--base', 'localhost').err, /--base takes a URL/);
  assert.match(dolly(ws, 'init', 'shop', '--from', join(root, 'nope')).err, /no folder at/);
  assert.equal(dolly(ws, 'init', 'shop', '--from', repo).code, 0);
  assert.match(dolly(ws, 'init', 'shop', '--from', repo).err, /already exists/);
  assert.match(dolly(ws, 'init', 'shop2', '--from', repo, '--alias', 'shop').err, /already goes by "shop"/);
  const inside = join(repo, 'clips');
  mkdirSync(inside);
  dolly(inside, 'init');
  assert.match(dolly(inside, 'init', 'shop', '--from', repo).err, /keep clips beside the product/);
});

test('the product is read for its framework, pinned port and start command', () => {
  assert.equal(framework({ scripts: { dev: 'next dev' } }, 'dev').id, 'next');
  assert.equal(framework({ scripts: { dev: 'vite' }, devDependencies: { '@sveltejs/kit': '2' } }, 'dev').id, 'sveltekit');
  assert.equal(framework({ scripts: { start: 'node server.js' } }, 'start').id, 'plain');
  assert.equal(scriptPort('vite --port 5190'), 5190);
  assert.equal(scriptPort('PORT=3002 react-scripts start'), 3002);
  assert.equal(scriptPort('astro dev'), null);
  assert.equal(startCommand({ pm: 'npm', script: 'dev', id: 'vite', cmd: 'vite', port: 5173 }).line, 'npm run dev -- --port 5173 --strictPort');
  assert.equal(startCommand({ pm: 'yarn', script: 'start', id: 'cra', cmd: 'react-scripts start', port: 3000 }).line, 'PORT=3000 BROWSER=none yarn run start');
  assert.equal(aliasFor('field-notes', new Set()), 'fn');
  assert.equal(aliasFor('library', new Set()), 'lib');
  assert.equal(aliasFor('shop', new Set()), null);
  assert.equal(aliasFor('field-notes', new Set(['fn'])), null);
});
