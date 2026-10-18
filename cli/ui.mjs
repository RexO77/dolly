/**
 * Everything the dolly command writes. On a terminal: quiet colour (the
 * Studio's wash for what worked, amber for notes, red only for failures, dim
 * for what is secondary) and one live line at the bottom, a spinner or a
 * progress bar. Piped, under NO_COLOR, with TERM=dumb or with --plain: no
 * colour and no live line, only the lines a terminal would keep, one per
 * event, so a log or an agent reads the same words a person sees.
 */
import { stripVTControlCharacters } from 'node:util';

const SYMBOLS = { ok: '✓', fail: '✕', note: '!', next: '›', dot: '·' };
const ASCII = { ok: '+', fail: 'x', note: '!', next: '>', dot: '-' };
const SPINNER = ['⠁', '⠂', '⠄', '⡀', '⢀', '⠠', '⠐', '⠈'];
const FRAME_MS = 100;
const BAR_WIDTH = 20;

/*
 * The accents, as truecolor and as the nearest xterm-256 colour, for a dark
 * terminal and for a light one. The wash is the Studio's, oklch(0.93 0.03 78).
 */
const ACCENTS = {
  wash: { dark: [[243, 230, 210], 223], light: [[131, 98, 58], 94] },
  amber: { dark: [[245, 183, 91], 215], light: [[174, 103, 0], 130] },
  red: { dark: [[246, 109, 103], 203], light: [[201, 48, 45], 160] },
};

/** A terminal that says its background is light (COLORFGBG "0;15"), for darker accents. */
const lightBackground = (env) => ['7', '15'].includes(String(env.COLORFGBG ?? '').split(';').pop());

function painter(on, env) {
  const sgr = (open, close) => (text) => (on ? `\x1b[${open}m${text}\x1b[${close}m` : String(text));
  const truecolor = /^(truecolor|24bit)$/i.test(env.COLORTERM ?? '');
  const shade = lightBackground(env) ? 'light' : 'dark';
  const accent = (name) => {
    const [[r, g, b], n] = ACCENTS[name][shade];
    return sgr(truecolor ? `38;2;${r};${g};${b}` : `38;5;${n}`, 39);
  };
  return { wash: accent('wash'), amber: accent('amber'), red: accent('red'), dim: sgr(2, 22), bold: sgr(1, 22) };
}

/** Milliseconds as a clock, m:ss, for times that tick. */
export function clock(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Milliseconds as a length of time: 0.4s, 12.3s, 7m 12s. */
export function duration(ms) {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

/** A file size: 812 KB, 3.4 MB. */
export function bytes(n) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Milliseconds left at the rate so far, or null while there is too little
 * to go on (nothing done, under 1.5s in, or under 2% through).
 */
export function eta(done, total, elapsedMs) {
  if (done <= 0 || total <= 0 || elapsedMs < 1500 || done / total < 0.02) return null;
  return (elapsedMs * Math.max(0, total - done)) / done;
}

/** A bar `width` cells long, filled to `fraction`: filled cells, then the rest. */
export function bar(fraction, width = BAR_WIDTH) {
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * width);
  return ['━'.repeat(filled), '─'.repeat(width - filled)];
}

const visible = (text) => stripVTControlCharacters(text).length;

/**
 * Rows of cells as aligned lines, padded by what shows (colour does not
 * count). `align` is 'left' or 'right' per column; the last column is not
 * padded, so no line ends in spaces.
 */
export function columns(rows, { align = [], gap = 2 } = {}) {
  const widths = [];
  for (const row of rows) row.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, visible(cell ?? ''))));
  return rows.map((row) => row.map((cell = '', i) => {
    const pad = ' '.repeat(widths[i] - visible(cell));
    if (align[i] === 'right') return pad + cell;
    return i === row.length - 1 ? cell : cell + pad;
  }).join(' '.repeat(gap)).trimEnd());
}

/**
 * The output for one stream. `fancy` (colour and live lines) needs a
 * terminal, no NO_COLOR, a TERM that is not dumb, and no --plain.
 */
export function createUi({ stream = process.stdout, env = process.env, plain = false } = {}) {
  const fancy = Boolean(stream.isTTY) && !env.NO_COLOR && env.TERM !== 'dumb' && !plain;
  const sym = env.TERM === 'dumb' ? ASCII : SYMBOLS;
  const paint = painter(fancy, env);
  const began = Date.now();
  const write = (text) => stream.write(text);

  /* The live line: whatever `live.draw()` returns, redrawn every frame below the lines already written. */
  let live = null;
  let timer = null;
  let tick = 0;
  const fit = (text) => {
    const room = (stream.columns || 80) - 1;
    return visible(text) <= room ? text : `${stripVTControlCharacters(text).slice(0, room - 1)}…`;
  };
  const draw = () => write(`\r${fit(live.draw(SPINNER[tick % SPINNER.length]))}\x1b[K`);
  const restoreCursor = () => write('\x1b[?25h');
  /* Ctrl-C mid-step: clear the line and give the cursor back, then exit unless something else (a dev server's stop) handles it. */
  const interrupted = () => {
    hide();
    if (!process.listenerCount('SIGINT')) process.exit(130);
  };
  const show = (state) => {
    live = state;
    if (!timer) {
      write('\x1b[?25l');
      process.once('exit', restoreCursor);
      process.once('SIGINT', interrupted);
      timer = setInterval(() => {
        tick += 1;
        draw();
      }, FRAME_MS);
      timer.unref();
    }
    draw();
  };
  const hide = () => {
    if (!live) return;
    live = null;
    clearInterval(timer);
    timer = null;
    write('\r\x1b[K');
    restoreCursor();
    process.off('exit', restoreCursor);
    process.off('SIGINT', interrupted);
  };

  const line = (text = '') => {
    if (live) write('\r\x1b[K');
    write(`${text}\n`);
    if (live) draw();
  };

  /** Details joined by a dot: `1920x1200 · 6.90s`. Empty parts are dropped. */
  const join = (parts) => [parts].flat(Infinity).filter((p) => p !== undefined && p !== null && p !== '').join(` ${sym.dot} `);
  /** Text, then its details dimmed. */
  const pair = (text, detail) => {
    const d = join(detail);
    return d ? `${text}  ${paint.dim(d)}` : text;
  };
  /** Commands in backticks, bold on a terminal (the backticks stay when piped, where they mark the command). */
  const code = (text) => (fancy ? String(text).replace(/`([^`]+)`/g, (_, c) => paint.bold(c)) : String(text));
  /* On a terminal, a long line wraps at a word with its indent kept; piped, every line stays whole. */
  const wrap = (text, indent) => {
    const room = (stream.columns || 0) - indent - 1;
    if (!fancy || room < 30 || visible(text) <= room) return [text];
    const lines = [''];
    for (const word of text.split(' ')) {
      const last = lines.length - 1;
      if (lines[last] && visible(lines[last]) + 1 + visible(word) > room) lines.push(word);
      else lines[last] = lines[last] ? `${lines[last]} ${word}` : word;
    }
    return lines;
  };
  const mark = (symbol, colour) => (text, detail, { indent = 2 } = {}) => {
    const [first, ...rest] = wrap(pair(code(text), detail), indent + 2);
    line(`${' '.repeat(indent)}${colour(symbol)} ${first}`);
    rest.forEach((more) => line(`${' '.repeat(indent + 2)}${more}`));
  };

  const ui = {
    fancy,
    sym,
    ...paint,
    line,
    join,
    pair,
    code,
    /** Milliseconds since the command began. */
    elapsed: () => Date.now() - began,
    /** How long the command took, for its summary; nothing for one too quick to mention. */
    took: () => (Date.now() - began < 1000 ? null : duration(Date.now() - began)),
    /** A heading: a clip's name over its steps, a section of a report. */
    header: (text) => line(paint.bold(text)),
    ok: mark(sym.ok, paint.wash),
    fail: mark(sym.fail, paint.red),
    note: mark(sym.note, paint.amber),
    /** A secondary line: what happened on the way, not what was made. */
    info: (text, detail, { indent = 2 } = {}) => line(`${' '.repeat(indent)}${paint.dim(`${sym.dot} ${join([text, ...[detail ?? []].flat()])}`)}`),
    /** Print `rows` as aligned columns (see columns()), the first row dimmed when it is a header. */
    table(rows, { indent = 2, header = false, align } = {}) {
      columns(rows, { align }).forEach((text, i) => line(`${' '.repeat(indent)}${header && i === 0 ? paint.dim(text) : text}`));
    },
    /** Stop the live line, for an error that ends the command. */
    clear: hide,

    /**
     * A step: a live line with a spinner while it runs (and a progress bar
     * once it reports progress), then one line when it is done or fails.
     * Off a terminal only that last line is written.
     */
    step(label, { indent = 2 } = {}) {
      const start = Date.now();
      let text = label;
      let ownTime = false;
      let progress = null;
      const pad = ' '.repeat(indent);
      const state = {
        draw(spin) {
          const head = `${pad}${paint.wash(spin)} ${text}`;
          const ms = Date.now() - start;
          if (!progress) return ownTime || ms < 2000 ? head : `${head}  ${paint.dim(clock(ms))}`;
          const { done, total, unit, since } = progress;
          const [filled, rest] = bar(done / Math.max(total, 1));
          const run = Date.now() - since;
          const left = eta(done, total, run);
          const count = `${String(done).padStart(String(total).length)}/${total}${unit ? ` ${unit}` : ''}`;
          const time = paint.dim(join([clock(run), left === null ? null : `${clock(left)} left`]));
          const full = `${head}  ${paint.wash(filled)}${paint.dim(rest)}  ${count}  ${time}`;
          return visible(full) < (stream.columns || 80) ? full : `${head}  ${count}  ${time}`;
        },
      };
      if (fancy) show(state);
      const end = () => live === state && hide();
      return {
        /** New text for the live line, which then keeps its own time instead of the step's clock. */
        update(next) {
          text = next;
          ownTime = true;
        },
        /** Progress toward `total`, timed from `since` (the step's start, or earlier for work several steps share). */
        progress(done, total, { unit = 'frames', since = start } = {}) {
          progress = { done, total, unit, since };
        },
        elapsed: () => Date.now() - start,
        done(doneText = label, detail) {
          end();
          ui.ok(doneText, detail, { indent });
        },
        fail(failText = label, detail) {
          end();
          ui.fail(failText, detail, { indent });
        },
        clear: end,
      };
    },

    /**
     * Steps one after another, as an engine reports them: next() finishes
     * the step before (with its `done` text and `detail(step)`, or no line
     * at all for a `transient` one) and starts the next one.
     */
    sequence() {
      let current = null;
      const finish = () => {
        if (!current) return;
        const { step, done, detail, transient } = current;
        current = null;
        if (transient) step.clear();
        else step.done(done, detail?.(step));
      };
      return {
        next(label, { done = label, detail, transient = false, indent } = {}) {
          finish();
          current = { step: ui.step(label, { indent }), done, detail, transient };
          return current.step;
        },
        get step() {
          return current?.step;
        },
        end: finish,
        fail() {
          current?.step.fail();
          current = null;
        },
      };
    },

    /**
     * The block a command ends on: what it made and where, how long it took,
     * and the one command to run next. `rows` are [key, value or values];
     * empty ones are left out.
     */
    summary(rows) {
      const kept = rows.filter(([, value]) => value !== undefined && value !== null && [value].flat().length);
      if (!kept.length) return;
      const width = Math.max(...kept.map(([key]) => key.length));
      line();
      for (const [key, value] of kept) {
        [value].flat().forEach((v, i) => line(`  ${i ? ' '.repeat(width) : paint.dim(key.padEnd(width))}  ${v}`));
      }
    },
  };
  return ui;
}
