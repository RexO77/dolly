/**
 * The dolly command. Each command is a module in commands/ exporting its
 * `usage`, a one-line `summary`, and a default function that runs it, with
 * optional `details`, `flags` (['--name VALUE', 'what it does'] pairs),
 * `examples` and `aliases`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { parse, flagSpec, context, log } from './util.mjs';

/** Help lists commands in these groups, in the order a person meets them. A command not listed joins the last group. */
const GROUPS = [
  ['Start', ['init', 'doctor']],
  ['Make a clip', ['inspect', 'record', 'studio', 'render', 'deliver']],
  ['More', ['list', 'direct', 'poster', 'stills']],
];

/** Flags every command takes. */
const GLOBAL_FLAGS = [
  ['--workspace DIR', 'use the workspace in DIR instead of the nearest dolly.json'],
  ['--masters DIR', 'read and write masters in DIR instead of the workspace\'s masters/'],
  ['--out DIR', 'write renders to DIR instead of the workspace\'s out/'],
  ['--help', 'show a command\'s help'],
];

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const files = readdirSync(new URL('./commands/', import.meta.url)).filter((f) => f.endsWith('.mjs'));
const commands = Object.fromEntries(await Promise.all(files.map(async (f) => [f.slice(0, -4), await import(`./commands/${f}`)])));
const aliases = Object.fromEntries(Object.entries(commands).flatMap(([name, c]) => (c.aliases ?? []).map((alias) => [alias, name])));

const table = (rows, indent = '  ') => {
  const width = Math.max(...rows.map(([left]) => left.length)) + 2;
  return rows.map(([left, right]) => `${indent}${left.padEnd(width)}${right}`).join('\n');
};

function help() {
  const listed = GROUPS.flatMap(([, names]) => names);
  const groups = GROUPS.map(([title, names], i) => [title, i === GROUPS.length - 1 ? [...names, ...Object.keys(commands).filter((n) => !listed.includes(n))] : names]);
  const usages = Object.values(commands).map((c) => `dolly ${c.usage}`);
  const width = Math.max(...usages.map((u) => u.length)) + 2;
  const section = ([title, names]) => `${title}\n${names.filter((n) => commands[n]).map((n) => `  ${`dolly ${commands[n].usage}`.padEnd(width)}${commands[n].summary}`).join('\n')}`;
  log(`Dolly ${version}: film a real web product, then direct the camera.

${groups.map(section).join('\n\n')}

Every command takes
${table(GLOBAL_FLAGS.slice(0, 3))}

Clips are names or globs, like 'settings-*'.
\`dolly help <command>\` shows what a command does and its flags. Docs: https://github.com/RexO77/dolly#readme`);
}

function commandHelp(name) {
  const c = commands[name];
  const parts = [`dolly ${c.usage}`, `${c.summary}.${c.details ? `\n\n${c.details}` : ''}`];
  if (c.flags?.length) parts.push(`Flags\n${table(c.flags)}`);
  if (c.examples?.length) parts.push(`Examples\n${c.examples.map((e) => `  ${e}`).join('\n')}`);
  if (c.aliases?.length) parts.push(`Also runs as: ${c.aliases.map((a) => `dolly ${a}`).join(', ')}`);
  log(parts.join('\n\n'));
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
  if (flags.version) return log(version);
  const given = args.shift();
  if (!given || given === 'help') {
    const about = aliases[args[0]] ?? args[0];
    if (about && !commands[about]) throw new Error(`there is no command "${about}"; \`dolly help\` lists them`);
    return about ? commandHelp(about) : help();
  }
  const name = aliases[given] ?? given;
  if (!commands[name]) throw new Error(`there is no command "${given}"; \`dolly help\` lists them`);
  if (flags.help) return commandHelp(name);
  try {
    checkFlags(name, flags);
    return await commands[name].default(context(args, flags));
  } catch (error) {
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
  const message = `dolly${error.command ? ` ${error.command}` : ''}: ${error.message}\n${process.env.DOLLY_DEBUG ? `${error.stack}\n` : ''}`;
  /* Exit once the message is out, even if something the command started (a dev server for the Studio, say) is still holding on. */
  process.stderr.write(message, () => process.exit(1));
}
