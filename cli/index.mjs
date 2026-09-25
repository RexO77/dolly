/**
 * The dolly command. Each command is a module in commands/ exporting its
 * `usage`, a one-line `summary`, and a default function that runs it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { parse, context, log } from './util.mjs';

/** Help lists commands in the order a person meets them; any other command follows. */
const ORDER = ['init', 'list', 'record', 'storyboard', 'direct', 'render', 'poster', 'deliver', 'stills', 'inspect', 'doctor'];

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const names = readdirSync(new URL('./commands/', import.meta.url)).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4));
names.sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
const commands = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await import(`./commands/${n}.mjs`)])));

function help() {
  const rows = names.map((n) => [`dolly ${commands[n].usage}`, commands[n].summary]);
  const width = Math.max(...rows.map(([u]) => u.length)) + 2;
  log(`dolly ${version}: record a real product without a cursor, direct a camera over it, ship the clip

${rows.map(([u, s]) => `  ${u.padEnd(width)}${s}`).join('\n')}

Clips are names or globs ('sb-feat-*'). Every command runs against the workspace
it is started in (the nearest dolly.json), or --workspace DIR.
Run \`dolly help <command>\` for a command's flags.`);
}

const { args, flags } = parse(process.argv.slice(2));
const cmd = args.shift() ?? 'help';
if (cmd === 'help' || cmd === '--help' || flags.help || !commands[cmd]) {
  const which = cmd === 'help' ? args[0] : flags.help ? cmd : null;
  if (which && commands[which]) log(`dolly ${commands[which].usage}\n\n${commands[which].summary}${commands[which].flags ? `\n\n${commands[which].flags}` : ''}`);
  else {
    if (cmd !== 'help' && !flags.help) console.error(`dolly: no command "${cmd}"\n`);
    help();
  }
  if (cmd !== 'help' && !flags.help && !commands[cmd]) process.exitCode = 1;
} else {
  try {
    await commands[cmd].default(context(args, flags));
  } catch (error) {
    console.error(`dolly ${cmd}: ${error.message}`);
    process.exitCode = 1;
  }
}
