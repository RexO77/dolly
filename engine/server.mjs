/**
 * The product's dev server: reused when it is already up, otherwise started
 * from the project's `start` command and stopped again when the run ends.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { sleep } from './motion.mjs';

export async function isUp(base) {
  try {
    const res = await fetch(base, { signal: AbortSignal.timeout(1500) });
    return res.status < 500;
  } catch {
    return false;
  }
}

/** Make sure `project.base` answers. Returns {started, stop()}. */
export async function ensureServer(project, { timeout = 60000, log = console.log } = {}) {
  if (await isUp(project.base)) return { started: false, stop: async () => {} };
  if (!project.start?.cmd) {
    throw new Error(`nothing answers at ${project.base}; start ${project.name}'s dev server, or give project.json a "start" command`);
  }
  const logs = project.paths.tmp;
  mkdirSync(logs, { recursive: true });
  const logFile = join(logs, `${project.name}-server.log`);
  const out = openSync(logFile, 'w');
  log(`starting ${project.name}: ${project.start.cmd} (in ${project.start.cwd})`);
  const child = spawn(project.start.cmd, { cwd: project.start.cwd, shell: true, detached: true, stdio: ['ignore', out, out] });
  const stop = async () => {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  };
  const began = Date.now();
  while (!(await isUp(project.base))) {
    if (child.exitCode !== null) throw new Error(`${project.name}'s dev server exited (${child.exitCode}); see ${logFile}`);
    if (Date.now() - began > timeout) {
      await stop();
      throw new Error(`${project.name}'s dev server did not answer at ${project.base} within ${timeout / 1000}s; see ${logFile}`);
    }
    await sleep(400);
  }
  return { started: true, stop };
}
