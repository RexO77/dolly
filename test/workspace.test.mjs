import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findRoot, loadWorkspace } from '../engine/workspace.mjs';
import { listProjects, loadProject, clipUrl } from '../engine/config.mjs';

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'dolly-ws-'));
  writeFileSync(join(root, 'dolly.json'), '{}');
  mkdirSync(join(root, 'projects', 'shop', 'scenarios'), { recursive: true });
  writeFileSync(join(root, 'projects', 'shop', 'project.json'), JSON.stringify({ name: 'shop', alias: 's', base: 'http://localhost:3000', query: { demo: '1' } }));
  return root;
}

test('a workspace is found from any folder inside it', () => {
  const root = workspace();
  assert.equal(findRoot(join(root, 'projects', 'shop', 'scenarios')), root);
  assert.equal(findRoot(tmpdir()), null);
});

test('projects load by name or alias, with paths inside the workspace', async () => {
  const ws = loadWorkspace({ workspace: workspace() });
  assert.deepEqual(listProjects(ws).map((p) => p.name), ['shop']);
  const p = await loadProject(ws, 's');
  assert.equal(p.name, 'shop');
  assert.equal(p.paths.masters, join(ws.root, 'masters', 'shop'));
  assert.equal(p.paths.tmp, join(ws.root, '.dolly', 'shop'));
});

test('outside a workspace the error says how to make one', () => {
  assert.throws(() => loadWorkspace({ cwd: tmpdir() }), /dolly init/);
});

test('a clip URL keeps its hash route and puts the query before it', async () => {
  const p = await loadProject(loadWorkspace({ workspace: workspace() }), 'shop');
  assert.equal(clipUrl(p, { url: '/#/browser', query: p.query }), 'http://localhost:3000/?demo=1#/browser');
  assert.equal(clipUrl(p, { url: '/lab/?v=4', query: p.query }), 'http://localhost:3000/lab/?v=4&demo=1');
});
