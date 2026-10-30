import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildDocs } from '../site/docs/build.mjs';

const docs = await buildDocs(fileURLToPath(new URL('..', import.meta.url)), '/');

test('Markdown exports retain commands, code, tables, and links without visual placeholders', () => {
  const page = docs.find((d) => d.page.slug === 'how-it-works');
  assert.match(page.markdown, /^# How Dolly works\n/);
  assert.ok(page.markdown.includes('dolly init shop --from ~/code/shop'));
  assert.match(page.markdown, /```(?:sh|bash|json|js)?\n/);
  assert.match(page.markdown, /\| Folder\s*\|/);
  assert.ok(page.markdown.includes('https://dolly.nischal.fyi/docs/scenarios/'));
  assert.ok(!page.markdown.includes('data-visual'));
  const start = docs.find((d) => d.page.slug === '');
  assert.ok(start.markdown.includes('## Quick start'));
  assert.ok(!start.markdown.includes('## The camera grammar'), 'the start page exports only its selected sections');
});

test('every docs page has a Markdown copy target, including the generated CLI reference', () => {
  for (const page of docs) {
    assert.ok(page.main.includes(`data-copy-ai="${page.url}index.md"`));
    assert.ok(page.main.includes('Copy for AI'));
    assert.ok(page.markdown.startsWith(`# ${page.title}\n`));
  }
  const cli = docs.find((d) => d.page.cli);
  assert.ok(cli.markdown.includes('### dolly init'));
  assert.ok(cli.markdown.includes('### dolly film'));
  assert.ok(cli.markdown.includes('--workspace'));
});
