import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deliverFiles, readJson } from '../engine/files.mjs';
import { deliverFolder, loadProject } from '../engine/config.mjs';
import { loadWorkspace } from '../engine/workspace.mjs';
import { deliverStills, loadStills } from '../engine/stills.mjs';

const scratch = () => mkdtempSync(join(tmpdir(), 'dolly-deliver-'));

test('delivery copies new files, leaves identical ones, and keeps differing ones unless told to replace them', () => {
  const dir = scratch();
  const from = join(dir, 'out');
  const to = join(dir, 'site');
  mkdirSync(from);
  mkdirSync(to);
  for (const [name, text] of [['new.mp4', 'a'], ['same.mp4', 'b'], ['changed.mp4', 'c']]) writeFileSync(join(from, name), text);
  writeFileSync(join(to, 'same.mp4'), 'b');
  writeFileSync(join(to, 'changed.mp4'), 'shipped');
  const files = ['new.mp4', 'same.mp4', 'changed.mp4'].map((name) => join(from, name));

  const first = deliverFiles(files, to);
  assert.deepEqual(first, { copied: [join(to, 'new.mp4')], same: [join(to, 'same.mp4')], held: [join(to, 'changed.mp4')] });
  assert.equal(readFileSync(join(to, 'changed.mp4'), 'utf8'), 'shipped');

  const second = deliverFiles(files, to, { overwrite: true });
  assert.deepEqual(second.copied, [join(to, 'changed.mp4')]);
  assert.equal(readFileSync(join(to, 'changed.mp4'), 'utf8'), 'c');
});

test('a broken JSON file names itself', () => {
  const file = join(scratch(), 'project.json');
  writeFileSync(file, '{ "base": ');
  assert.throws(() => readJson(file), (error) => error.message.includes(file));
});

/** A workspace with one project whose stills name two deliver folders. */
async function stillsProject() {
  const root = scratch();
  writeFileSync(join(root, 'dolly.json'), '{}');
  const dir = join(root, 'projects', 'shop');
  mkdirSync(dir, { recursive: true });
  const site = join(root, 'site');
  writeFileSync(join(dir, 'project.json'), JSON.stringify({ base: 'http://localhost:3000', query: { demo: '1' }, deliver: { default: site, lab: join(site, 'lab') } }));
  writeFileSync(join(dir, 'stills.mjs'), `export const deliver = 'lab';
export const shots = [
  { name: 'home', url: '/' },
  { name: 'pricing', url: '/pricing', deliver: 'default', query: { plan: 'pro' } },
  { name: 'about', url: '/about', deliver: 'press' },
];`);
  const project = await loadProject(loadWorkspace({ workspace: root }), 'shop');
  return { project, site };
}

test('each still delivers to its own folder, else the module\'s, and carries the project\'s query', async () => {
  const { project } = await stillsProject();
  const { shots } = await loadStills(project);
  assert.deepEqual(shots.map((s) => s.deliver), ['lab', 'default', 'press']);
  assert.deepEqual(shots[1].query, { demo: '1', plan: 'pro' });
});

test('delivering stills puts each where it asks, and a folder the project does not name is a readable error', async () => {
  const { project, site } = await stillsProject();
  const stills = join(project.paths.out, 'stills');
  mkdirSync(stills, { recursive: true });
  writeFileSync(join(stills, 'home.webp'), 'h');
  writeFileSync(join(stills, 'pricing.webp'), 'p');
  const result = await deliverStills(project);
  assert.deepEqual(result.copied, [join(site, 'lab', 'home.webp'), join(site, 'pricing.webp')]);
  assert.deepEqual(result.missing, ['about']);
  writeFileSync(join(stills, 'about.webp'), 'a');
  await assert.rejects(deliverStills(project, { filter: 'about' }), /names no deliver folder "press"/);
  assert.ok(!existsSync(join(site, 'about.webp')));
});

test('a clip without a deliver folder gets the way to name one', async () => {
  const { project } = await stillsProject();
  assert.throws(() => deliverFolder(project, 'blog', 'shop-first'), /add one under "deliver"/);
});
