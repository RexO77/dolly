/**
 * The product's dev server: reused when it is already up, otherwise started
 * from the project's `start` command and stopped again when the run ends,
 * including when the run is stopped with ctrl-c.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { sleep } from './motion.mjs';

/** Whether something answers at `base` without a server error. */
export async function isUp(base) {
  try {
    const res = await fetch(base, { signal: AbortSignal.timeout(1500) });
    return res.status < 500;
  } catch {
    return false;
  }
}

/** Make sure `project.base` answers, starting the dev server if it has to. Returns {started, stop()}. */
export async function ensureServer(project, { timeout = 60000, log = console.log } = {}) {
  if (await isUp(project.base)) return { started: false, stop: async () => {} };
  if (!project.start?.cmd) {
    throw new Error(`nothing answers at ${project.base}; start ${project.name}'s dev server yourself, or give its project.json a "start" command so Dolly can`);
  }
  if (!existsSync(project.start.cwd)) {
    throw new Error(`${project.name}'s start folder ${project.start.cwd} does not exist; fix "start.cwd" in its project.json`);
  }
  mkdirSync(project.paths.tmp, { recursive: true });
  const logFile = join(project.paths.tmp, `${project.name}-server.log`);
  const output = openSync(logFile, 'w');
  log(`starting ${project.name}: ${project.start.cmd}`);
  /* Its own process group, so stopping it stops everything the command started. */
  const child = spawn(project.start.cmd, { cwd: project.start.cwd, shell: true, detached: true, stdio: ['ignore', output, output] });

  const kill = () => {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  };
  const onSignal = (signal) => {
    kill();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  const stop = async () => {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    kill();
  };

  const began = Date.now();
  while (!(await isUp(project.base))) {
    if (child.exitCode !== null) {
      await stop();
      throw new Error(`${project.name}'s dev server exited with code ${child.exitCode} before it answered; its log is ${logFile}`);
    }
    if (Date.now() - began > timeout) {
      await stop();
      throw new Error(`${project.name}'s dev server did not answer at ${project.base} within ${timeout / 1000}s; check the port in its project.json, and its log at ${logFile}`);
    }
    await sleep(400);
  }
  return { started: true, stop };
}
