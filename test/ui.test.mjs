import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { bar, bytes, clock, columns, createUi, duration, eta } from '../cli/ui.mjs';

/** The escape that starts every colour, cursor and erase code. */
const ESC = '\x1b';
const hasEscapes = (text) => text.includes(ESC);
const BIN = fileURLToPath(new URL('../bin/dolly.mjs', import.meta.url));

/** A stream that keeps what is written to it. */
function sink(isTTY) {
  const stream = { isTTY, columns: 100, text: '', write: (s) => (stream.text += s) };
  return stream;
}

/** Everything a command writes along the way: a step with progress (given a frame to draw it), notes, a table and a summary. */
async function exercise(ui) {
  const step = ui.step('rendering');
  step.progress(50, 100);
  await new Promise((resolve) => setTimeout(resolve, 150));
  step.done('rendered', ['1920x1080', '6.90s']);
  ui.note('a note with `dolly render shop` in it');
  ui.fail('a failure');
  ui.table([['clip', 'state'], ['shop-first', ui.wash('rendered')]], { header: true });
  ui.summary([['made', ['out/a.mp4', 'out/a.webp']], ['next', 'dolly deliver shop']]);
}

test('off a terminal, under NO_COLOR, with --plain or TERM=dumb, the output has no escape codes and no live line', async () => {
  for (const [isTTY, env, plain] of [[false, {}, false], [true, { NO_COLOR: '1' }, false], [true, {}, true], [true, { TERM: 'dumb' }, false]]) {
    const stream = sink(isTTY);
    const ui = createUi({ stream, env, plain });
    assert.equal(ui.fancy, false);
    await exercise(ui);
    assert.ok(!hasEscapes(stream.text));
    assert.doesNotMatch(stream.text, /\r/, 'nothing is drawn over');
    assert.doesNotMatch(stream.text, /rendering/, 'only the lines a terminal keeps are written');
    assert.match(stream.text, /rendered {2}1920x1080 . 6\.90s\n/);
    assert.match(stream.text, /`dolly render shop`/, 'commands keep their backticks');
  }
  const dumb = sink(true);
  await exercise(createUi({ stream: dumb, env: { TERM: 'dumb' } }));
  assert.match(dumb.text, /^ {2}\+ rendered {2}1920x1080 - 6\.90s$/m, 'a dumb terminal gets ASCII symbols');
});

test('on a terminal, the output has colour and a live line that is cleared when the step ends', async () => {
  const stream = sink(true);
  const ui = createUi({ stream, env: {} });
  assert.equal(ui.fancy, true);
  await exercise(ui);
  assert.ok(hasEscapes(stream.text));
  assert.match(stream.text, /\r {2}\S+ rendering {2}.*50\/100 frames/, 'the step is drawn live with its progress');
  assert.ok(stream.text.includes('\r\x1b[K'), 'and cleared');
  assert.ok(stream.text.includes('\x1b[?25h'), 'with the cursor shown again');
});

test('time left is the rate so far, once there is enough to go on', () => {
  assert.equal(eta(0, 100, 5000), null, 'nothing done');
  assert.equal(eta(50, 100, 1000), null, 'too soon');
  assert.equal(eta(1, 100, 10_000), null, 'under 2% through');
  assert.equal(eta(25, 100, 10_000), 30_000);
  assert.equal(eta(128, 634, 120_000), (120_000 * 506) / 128);
  assert.equal(eta(100, 100, 9000), 0);
});

test('times, sizes and bars read the way the output prints them', () => {
  assert.equal(clock(0), '0:00');
  assert.equal(clock(59_600), '1:00');
  assert.equal(clock(252_000), '4:12');
  assert.equal(duration(400), '0.4s');
  assert.equal(duration(12_340), '12.3s');
  assert.equal(duration(432_000), '7m 12s');
  assert.equal(bytes(2048), '2 KB');
  assert.equal(bytes(3.4 * 1024 * 1024), '3.4 MB');
  assert.deepEqual(bar(0.5, 10), ['━━━━━', '─────']);
  assert.deepEqual(bar(1.4, 4), ['━━━━', ''], 'a bar never overfills');
  assert.deepEqual(bar(0, 3), ['', '───']);
});

test('columns line up by what shows, not by colour codes', () => {
  const lines = columns([['shot', 'light'], ['1', '\x1b[38;5;215m9.1%\x1b[39m'], ['12', '3.2%']], { align: ['right', 'right'] });
  assert.deepEqual(lines.map(stripVTControlCharacters), ['shot  light', '   1   9.1%', '  12   3.2%']);
});

test('piped, the dolly command writes no escape codes, errors included', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'dolly-ui-'));
  const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: { ...process.env, DOLLY_WORKSPACE: '' } });
  run('init');
  for (const args of [['help'], ['help', 'film'], ['init'], ['list'], ['recrod'], ['render', 'shop']]) {
    const r = run(...args);
    assert.ok(!hasEscapes(r.stdout + r.stderr), args.join(' '));
  }
  assert.match(run('recrod').stderr, /^✕ dolly: there is no command "recrod"/);
});
