import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { listClips, listProjects } from '../../engine/config.mjs';
import { isUp } from '../../engine/server.mjs';
import { launchOptions } from '../../engine/browser.mjs';

export const usage = 'doctor [project]';
export const summary = 'check Node, Chrome, ffmpeg, cwebp and the dev servers, with the exact fix for anything missing';

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
    /* no os-release: a Linux we do not know */
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
  ffmpeg: 'install ffmpeg built with libx264 (https://ffmpeg.org/download.html) and put it on PATH',
  webp: 'install cwebp from libwebp (https://developers.google.com/speed/webp/download) and put it on PATH',
};
const ALTERNATIVE = {
  windows: { ffmpeg: 'winget install Gyan.FFmpeg', webp: 'scoop install libwebp' },
  fedora: { ffmpeg: 'enable RPM Fusion first: Fedora\'s own ffmpeg-free has no libx264' },
};

function installFix(os, tool) {
  if (!INSTALL[os]) return ELSEWHERE[tool];
  const alt = ALTERNATIVE[os]?.[tool];
  return `${INSTALL[os]} ${PACKAGES[tool][os]}${alt ? ` (or: ${alt})` : ''}`;
}

const CHROME = {
  macos: 'brew install --cask google-chrome, or download it from https://www.google.com/chrome/',
  debian: 'wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && sudo apt-get install ./google-chrome-stable_current_amd64.deb',
  fedora: 'sudo dnf install https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm',
  windows: 'winget install Google.Chrome, or download it from https://www.google.com/chrome/',
  linux: 'download Google Chrome from https://www.google.com/chrome/',
  arch: 'install google-chrome from the AUR, or download it from https://www.google.com/chrome/',
};

const NODE = {
  macos: 'brew install node, or download it from https://nodejs.org/en/download',
  windows: 'winget install OpenJS.NodeJS.LTS, or download it from https://nodejs.org/en/download',
};

/** The lowest Node major version `engines` allows (">=22" is 22). */
function nodeFloor() {
  const { engines } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const [, major = '0', minor = '0'] = /(\d+)(?:\.(\d+))?/.exec(engines?.node ?? '') ?? [];
  return { range: engines?.node ?? 'any', major: Number(major), minor: Number(minor) };
}

/** Why a tool could not be run, in words: a missing binary says so instead of ENOENT. */
const reason = (error, bin) => (error.code === 'ENOENT' ? `${bin} is not on PATH` : error.message.split('\n')[0]);

export default async function doctor({ args: [name], workspace, project, log }) {
  const os = system();
  const failed = [];
  const missing = new Set();
  const pass = (label, detail) => log(`  ok    ${label}: ${detail}`);
  const fail = (label, detail, fix) => {
    failed.push(label);
    log(`  FAIL  ${label}: ${detail}`);
    log(`        fix: ${fix}`);
  };
  const run = (bin, args) => execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();

  const floor = nodeFloor();
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major > floor.major || (major === floor.major && minor >= floor.minor)) pass('node', `${process.version} (needs ${floor.range})`);
  else fail('node', `${process.version}, Dolly needs ${floor.range}`, `install Node ${floor.major} or newer: ${NODE[os] ?? 'https://nodejs.org/en/download (or nvm install ' + floor.major + ')'}`);

  const tool = (label, bin, args, pkg) => {
    try {
      pass(label, run(bin, args).split('\n')[0].trim());
      return true;
    } catch (error) {
      missing.add(pkg);
      fail(label, reason(error, bin), installFix(os, pkg));
      return false;
    }
  };
  const hasFfmpeg = tool('ffmpeg', 'ffmpeg', ['-version'], 'ffmpeg');
  tool('ffprobe', 'ffprobe', ['-version'], 'ffmpeg');
  if (hasFfmpeg) {
    const encoders = run('ffmpeg', ['-hide_banner', '-encoders']);
    if (/^\s*V\S*\s+libx264\s/m.test(encoders)) pass('libx264', 'ffmpeg can encode H.264');
    else {
      missing.add('ffmpeg');
      fail('libx264', 'this ffmpeg was built without the libx264 encoder', `${installFix(os, 'ffmpeg')}, and make sure that ffmpeg is the first one on PATH`);
    }
  } else log('  --    libx264: not checked, needs ffmpeg');
  tool('cwebp', 'cwebp', ['-version'], 'webp');

  const { chromium } = await import('playwright-core');
  try {
    const browser = await chromium.launch({ ...launchOptions(), timeout: 30_000 });
    pass('chrome', `${browser.version()}${process.env.DOLLY_CHROME ? ` (DOLLY_CHROME=${process.env.DOLLY_CHROME})` : ''}`);
    await browser.close();
  } catch (error) {
    const detail = error.message.split('\n')[0];
    if (process.env.DOLLY_CHROME) fail('chrome', `DOLLY_CHROME=${process.env.DOLLY_CHROME} did not launch: ${detail}`, 'point DOLLY_CHROME at a Google Chrome binary, or unset it to use the installed Chrome');
    else fail('chrome', `Google Chrome is not installed where Dolly looks (${detail})`, `${CHROME[os]}; or set DOLLY_CHROME to the path of a Chrome binary`);
  }

  let ws = null;
  try {
    ws = workspace();
    log(`  ok    workspace: ${ws.root}`);
  } catch (error) {
    log(`  --    workspace: ${error.message}`);
  }
  if (ws) {
    const projects = name ? [await project(name)] : await Promise.all(listProjects(ws).map((x) => project(x.name)));
    for (const p of projects) {
      const up = await isUp(p.base);
      log(`  ${up ? 'ok  ' : 'down'}  ${p.name}: ${p.base}${up ? '' : p.start ? ' (dolly starts it when it records)' : ' (start it yourself; no start command)'}, ${listClips(p).length} scenario(s)`);
    }
  }

  if (failed.length) {
    log(`\n${failed.length} check${failed.length > 1 ? 's' : ''} failed (${failed.join(', ')}). Run the fix under each, then \`dolly doctor\` again.`);
    if (missing.size > 1 && INSTALL[os]) log(`Both packages in one line: ${INSTALL[os]} ${[...missing].map((t) => PACKAGES[t][os]).join(' ')}`);
    process.exitCode = 1;
  } else log('\nAll good: this machine has everything Dolly needs to record, render and deliver.');
}
