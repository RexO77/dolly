/**
 * The dolly command. Each command is a module in commands/ exporting its
 * `usage`, a one-line `summary`, and a default function that runs it, with
 * optional `details`, `flags` (['--name VALUE', 'what it does'] pairs),
 * `examples` and `aliases`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { parse, flagSpec, context } from './util.mjs';
import { createUi } from './ui.mjs';

/** Help lists commands in these groups, in the order a person meets them. A command not listed joins the last group. */
const GROUPS = [
  ['Start', ['init', 'doctor']],
  ['Make a clip', ['inspect', 'record', 'studio', 'render', 'deliver']],
  ['Make a launch film', ['film']],
  ['More', ['list', 'direct', 'poster', 'stills']],
];

/** Flags every command takes. */
const GLOBAL_FLAGS = [
  ['--workspace DIR', 'use the workspace in DIR instead of the nearest dolly.json'],
  ['--masters DIR', 'read and write masters in DIR instead of the workspace\'s masters/'],
  ['--out DIR', 'write renders to DIR instead of the workspace\'s out/'],
  ['--plain', 'plain output: no colour, spinners or progress bars (as when piped, or with NO_COLOR)'],
  ['--help', 'show a command\'s help'],
];

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const files = readdirSync(new URL('./commands/', import.meta.url)).filter((f) => f.endsWith('.mjs'));
const commands = Object.fromEntries(await Promise.all(files.map(async (f) => [f.slice(0, -4), await import(`./commands/${f}`)])));
const aliases = Object.fromEntries(Object.entries(commands).flatMap(([name, c]) => (c.aliases ?? []).map((alias) => [alias, name])));

/** A usage line, with its arguments dimmed so the command reads first. */
const usageOf = (ui, usage) => {
  const [command, ...rest] = usage.split(' ');
  return `dolly ${command}${rest.length ? ` ${ui.dim(rest.join(' '))}` : ''}`;
};

function help(ui) {
  const listed = GROUPS.flatMap(([, names]) => names);
  const groups = GROUPS.map(([title, names], i) => [title, i === GROUPS.length - 1 ? [...names, ...Object.keys(commands).filter((n) => !listed.includes(n))] : names]);
  /* One table for every group, so the summaries line up from the first group to the last. */
  const rows = groups.flatMap(([title, names], i) => [
    ...(i ? [['']] : []),
    [ui.bold(title)],
    ...names.filter((n) => commands[n]).map((n) => [`  ${usageOf(ui, commands[n].usage)}`, commands[n].summary]),
  ]);
  ui.line(`${ui.bold(`Dolly ${version}`)}: film a real web product, then direct the camera.\n`);
  ui.table(rows, { indent: 0 });
  ui.line(`\n${ui.bold('Every command takes')}`);
  ui.table(GLOBAL_FLAGS.slice(0, -1).map(([flag, what]) => [flag, ui.dim(what)]));
  ui.line(ui.dim(`\nClips are names or globs, like 'settings-*'.
\`dolly help <command>\` shows what a command does and its flags. Docs: https://github.com/RexO77/dolly#readme`));
}

function commandHelp(ui, name) {
  const c = commands[name];
  ui.line(ui.bold(usageOf(ui, c.usage)));
  ui.line(`\n${c.summary}.${c.details ? `\n\n${c.details}` : ''}`);
  if (c.flags?.length) {
    ui.line(`\n${ui.bold('Flags')}`);
    ui.table(c.flags.map(([flag, what]) => [flag, ui.dim(what)]));
  }
  if (c.examples?.length) ui.line(`\n${ui.bold('Examples')}\n${c.examples.map((e) => `  ${e}`).join('\n')}`);
  if (c.aliases?.length) ui.line(ui.dim(`\nAlso runs as: ${c.aliases.map((a) => `dolly ${a}`).join(', ')}`));
}

/** Every flag that takes a value, across the commands, so the parser knows before it knows the command. */
const valued = new Set([...GLOBAL_FLAGS, ...Object.values(commands).flatMap((c) => c.flags ?? [])].map(([spec]) => flagSpec(spec)).filter((f) => f.valued).map((f) => f.name));

/** Refuse a flag the command does not take, so a typo never runs as if it were not there. */
function checkFlags(name, flags) {
  const known = new Set([...GLOBAL_FLAGS, ...(commands[name].flags ?? [])].map(([spec]) => flagSpec(spec).name));
  const unknown = Object.keys(flags).filter((key) => key !== 'query' && !known.has(key));
  if (Object.keys(flags.query).length && !known.has('query')) unknown.push('query');
  if (unknown.length) throw new Error(`there is no ${unknown.map((key) => `--${key}`).join(' or ')} flag here; \`dolly help ${name}\` lists them`);
}

async function main(argv) {
  const { args, flags } = parse(argv, valued);
  const ui = createUi({ plain: flags.plain });
  if (flags.version) return ui.line(version);
  const given = args.shift();
  if (!given || given === 'help') {
    const about = aliases[args[0]] ?? args[0];
    if (about && !commands[about]) throw new Error(`there is no command "${about}"; \`dolly help\` lists them`);
    return about ? commandHelp(ui, about) : help(ui);
  }
  const name = aliases[given] ?? given;
  if (!commands[name]) throw new Error(`there is no command "${given}"; \`dolly help\` lists them`);
  if (flags.help) return commandHelp(ui, name);
  try {
    checkFlags(name, flags);
    return await commands[name].default(context(args, flags, ui));
  } catch (error) {
    ui.clear();
    error.command = given;
    throw error;
  }
}

/* Output piped into `head` and closed early is not an error. */
process.stdout.on('error', (error) => {
  if (error.code !== 'EPIPE') throw error;
  process.exit(process.exitCode ?? 0);
});

try {
  await main(process.argv.slice(2));
} catch (error) {
  const ui = createUi({ stream: process.stderr, plain: process.argv.includes('--plain') });
  const message = `${ui.red(ui.sym.fail)} dolly${error.command ? ` ${error.command}` : ''}: ${ui.code(error.message)}\n${process.env.DOLLY_DEBUG ? `${error.stack}\n` : ''}`;
  /* Exit once the message is out, even if something the command started (a dev server for the Studio, say) is still holding on. */
  process.stderr.write(message, () => process.exit(1));
}
