import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { clipUrl } from '../../engine/config.mjs';
import { ensureServer } from '../../engine/server.mjs';
import { launchOptions } from '../../engine/browser.mjs';

export const usage = 'inspect <project> [path]';
export const summary = 'what is on a page: its controls and rows with their boxes, and a screenshot';

export default async function inspect({ args: [name, path = '/'], flags, project, log }) {
  const p = await project(name);
  const server = await ensureServer(p, { log });
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch(launchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: p.viewport.width, height: p.viewport.height } });
    const url = clipUrl(p, { url: path, query: p.query }, flags.query);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    mkdirSync(p.paths.tmp, { recursive: true });
    const shot = join(p.paths.tmp, 'inspect.png');
    await page.screenshot({ path: shot });
    const els = await page.evaluate(() => [...document.querySelectorAll('button, [role=button], [role=treeitem], [role=menuitem], [data-marquee], a, input, textarea')]
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight)
      .slice(0, 120)
      .map(({ e, r }) => `${e.tagName.toLowerCase()}${e.getAttribute('role') ? `[${e.getAttribute('role')}]` : ''} "${(e.getAttribute('aria-label') || e.textContent || e.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 48)}" @${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`));
    log(`${url}\n${els.join('\n')}\n\nscreenshot: ${p.workspace.rel(shot)}`);
  } finally {
    await browser.close();
    await server.stop();
  }
}
