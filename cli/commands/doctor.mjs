import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { listClips, listProjects } from '../../engine/config.mjs';
import { isUp } from '../../engine/server.mjs';
import { launchHeadless } from '../../engine/browser.mjs';
import { displayPath } from '../util.mjs';

export const usage = 'doctor [project]';
export const summary = 'Check this machine has what Dolly needs';
export const details = `Checks Node, ffmpeg (with its H.264 encoder), ffprobe, cwebp and Google
Chrome, then the workspace and whether each project's product is running.`;

/** The machine, as far as the fix commands care: macos, debian, fedora, arch, windows, or linux. */
function system() {
  if (process.platform === 'darwin') return 'macos';
  if (process.platform === 'win32') return 'windows';
  try {
    const release = readFileSync('/etc/os-release', 'utf8');
    const ids = (release.match(/^ID(?:_LIKE)?=.*$/gm) ?? []).join(' ');
    if (/debian|ubuntu/.test(ids)) return 'debian';
    if (/fedora|rhel|centos/.test(ids)) return 'fedora';
    if (/arch/.test(ids)) return 'arch';
  } catch {
    /* no os-release: a Linux this does not know */
  }
  return 'linux';
}

/* The package manager per system, and the package each tool comes in. */
const INSTALL = { macos: 'brew install', debian: 'sudo apt-get install', fedora: 'sudo dnf install', arch: 'sudo pacman -S', windows: 'choco install' };
const PACKAGES = {
  ffmpeg: { macos: 'ffmpeg', debian: 'ffmpeg', fedora: 'ffmpeg', arch: 'ffmpeg', windows: 'ffmpeg' },
  webp: { macos: 'webp', debian: 'webp', fedora: 'libwebp-tools', arch: 'libwebp', windows: 'webp' },
};
const ELSEWHERE = {
  ffmpeg: 'install ffmpeg built with libx264 (https://ffmpeg.org/download.html) and put it on your PATH',
  webp: 'install cwebp from libwebp (https://developers.google.com/speed/webp/download) and put it on your PATH',
};
const ALTERNATIVE = {
  windows: { ffmpeg: 'winget install Gyan.FFmpeg', webp: 'scoop install libwebp' },
  fedora: { ffmpeg: "enable RPM Fusion first: Fedora's own ffmpeg-free has no libx264" },
};
const CHROME = {
  macos: 'brew install --cask google-chrome, or download it from https://www.google.com/chrome/',
  debian: 'wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && sudo apt-get install ./google-chrome-stable_current_amd64.deb',
  fedora: 'sudo dnf install https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm',
  windows: 'winget install Google.Chrome, or download it from https://www.google.com/chrome/',
  arch: 'install google-chrome from the AUR, or download it from https://www.google.com/chrome/',
  linux: 'download Google Chrome from https://www.google.com/chrome/',
};
const NODE = {
  macos: 'brew install node, or download it from https://nodejs.org/en/download',
  windows: 'winget install OpenJS.NodeJS.LTS, or download it from https://nodejs.org/en/download',
};

function installFix(os, tool) {
  if (!INSTALL[os]) return ELSEWHERE[tool];
  const alternative = ALTERNATIVE[os]?.[tool];
  return `${INSTALL[os]} ${PACKAGES[tool][os]}${alternative ? ` (or: ${alternative})` : ''}`;
}

/** The lowest Node version package.json's `engines` allows (">=22" is 22.0). */
function nodeFloor() {
  const { engines } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const [, major = '0', minor = '0'] = /(\d+)(?:\.(\d+))?/.exec(engines?.node ?? '') ?? [];
  return { range: engines?.node ?? 'any', major: Number(major), minor: Number(minor) };
}

/** Why a tool could not run, in words: a missing binary says so instead of ENOENT. */
const reason = (error) => (error.code === 'ENOENT' ? 'not found on your PATH' : error.message.split('\n')[0]);

const run = (bin, args) => execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();

export default async function doctor({ args: [name], workspace, project, ui }) {
  const os = system();
  const failed = [];
  const missing = new Set();
  const row = (symbol, label, detail) => ui.line(`  ${symbol} ${label.padEnd(9)} ${detail}`);
  const pass = (label, detail) => row(ui.wash(ui.sym.ok), label, ui.dim(detail));
  const skip = (label, detail) => row(ui.dim(ui.sym.dot), label, ui.dim(detail));
  const fail = (label, detail, fix) => {
    failed.push(label);
    row(ui.red(ui.sym.fail), label, detail);
    ui.line(`  ${' '.repeat(12)}${ui.dim('fix:')} ${fix}`);
  };

  ui.header('This machine');
  const floor = nodeFloor();
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major > floor.major || (major === floor.major && minor >= floor.minor)) pass('Node', `${process.version} (Dolly needs ${floor.range})`);
  else fail('Node', `${process.version}, but Dolly needs ${floor.range}`, `install Node ${floor.major} or newer: ${NODE[os] ?? `https://nodejs.org/en/download (or nvm install ${floor.major})`}`);

  const tool = (label, bin, pkg) => {
    try {
      pass(label, run(bin, ['-version']).split('\n')[0].replace(/\s+Copyright.*$/, '').trim());
      return true;
    } catch (error) {
      missing.add(pkg);
      fail(label, reason(error), installFix(os, pkg));
      return false;
    }
  };
  const hasFfmpeg = tool('ffmpeg', 'ffmpeg', 'ffmpeg');
  tool('ffprobe', 'ffprobe', 'ffmpeg');
  if (!hasFfmpeg) skip('libx264', 'not checked: it needs ffmpeg');
  else if (/^\s*V\S*\s+libx264\s/m.test(run('ffmpeg', ['-hide_banner', '-encoders']))) pass('libx264', 'ffmpeg can encode H.264');
  else {
    missing.add('ffmpeg');
    fail('libx264', 'this ffmpeg was built without the libx264 encoder', `${installFix(os, 'ffmpeg')}, and make sure that ffmpeg comes first on your PATH`);
  }
  tool('cwebp', 'cwebp', 'webp');

  const starting = ui.step('starting Chrome');
  try {
    const browser = await launchHeadless({ timeout: 30_000 });
    starting.clear();
    pass('Chrome', `${browser.version()}${process.env.DOLLY_CHROME ? ` (DOLLY_CHROME=${process.env.DOLLY_CHROME})` : ''}`);
    await browser.close();
  } catch (error) {
    starting.clear();
    const detail = error.cause?.message.split('\n')[0] ?? error.message;
    if (process.env.DOLLY_CHROME) fail('Chrome', `DOLLY_CHROME=${process.env.DOLLY_CHROME} did not start (${detail})`, 'point DOLLY_CHROME at a Google Chrome binary, or unset it to use the installed Chrome');
    else fail('Chrome', 'Google Chrome is not installed where Dolly looks', `${CHROME[os]}; or set DOLLY_CHROME to the path of a Chrome binary`);
  }

  ui.line();
  ui.header('Workspace');
  let ws = null;
  let projects = [];
  try {
    ws = workspace();
    pass('folder', displayPath(ws.root));
  } catch (error) {
    skip('folder', error.message);
  }
  if (ws) {
    projects = name ? [await project(name)] : await Promise.all(listProjects(ws).map((p) => project(p.name)));
    if (!projects.length) skip('projects', 'none yet: `dolly init <name> --from <repo>` adds one');
    for (const p of projects) {
      const scenarios = listClips(p).length;
      const about = `${p.base} ${ui.sym.dot} ${scenarios} scenario${scenarios === 1 ? '' : 's'}`;
      if (await isUp(p.base)) pass(p.name, `${about} ${ui.sym.dot} running`);
      else skip(p.name, `${about} ${ui.sym.dot} ${p.start ? 'not running: Dolly starts it when it needs it' : 'not running, and it has no start command, so start it yourself'}`);
    }
  }

  ui.line();
  if (failed.length) {
    ui.fail(`${failed.length} check${failed.length > 1 ? 's' : ''} failed (${failed.join(', ')}). Run each fix above, then \`dolly doctor\` again.`, null, { indent: 0 });
    if (missing.size > 1 && INSTALL[os]) ui.line(`  ${ui.dim('both packages in one go:')} ${INSTALL[os]} ${[...missing].map((t) => PACKAGES[t][os]).join(' ')}`);
    process.exitCode = 1;
    return;
  }
  ui.ok('All set. This machine has everything Dolly needs to record, render and deliver.', null, { indent: 0 });
  ui.summary([['next', !ws ? 'dolly init' : projects.length ? `dolly list${name ? ` ${name}` : ''}` : 'dolly init <name> --from <repo>']]);
}
