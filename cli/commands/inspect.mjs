import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { clipUrl } from '../../engine/config.mjs';
import { launchHeadless } from '../../engine/browser.mjs';
import { fileRow, startProduct } from '../steps.mjs';

export const usage = 'inspect <project> [path]';
export const summary = "List a page's controls and their boxes";
export const details = `Opens the page (the project's base plus path, "/" by default) and prints each
visible button, link, field and menu item: its tag, its label, and its box
in CSS pixels. A label works as a target in a scenario as text=<label>.`;
export const flags = [['--query k=v', 'add a query parameter to the page\'s URL (repeatable)']];
export const examples = ['dolly inspect shop /settings'];

/** The page's visible controls: each one's `tag[role]`, its label, and its box in CSS pixels. */
function controls() {
  const SELECTOR = 'button, [role=button], [role=treeitem], [role=menuitem], [data-marquee], a, input, textarea';
  return [...document.querySelectorAll(SELECTOR)]
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight)
    .slice(0, 120)
    .map(({ el, r }) => {
      const role = el.getAttribute('role');
      const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 48);
      return [`${el.tagName.toLowerCase()}${role ? `[${role}]` : ''}`, `"${label}"`, `@${Math.round(r.x)},${Math.round(r.y)}`, `${Math.round(r.width)}x${Math.round(r.height)}`];
    });
}

export default async function inspect({ args: [name, path = '/'], flags, project, ui }) {
  const p = await project(name);
  const server = await startProduct(ui, p);
  let browser;
  try {
    const url = clipUrl(p, { url: path, query: p.query }, flags.query);
    const step = ui.step(`opening ${url}`, { indent: 0 });
    browser = await launchHeadless();
    const page = await browser.newPage({ viewport: { width: p.viewport.width, height: p.viewport.height } });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    mkdirSync(p.paths.tmp, { recursive: true });
    const screenshot = join(p.paths.tmp, 'inspect.png');
    await page.screenshot({ path: screenshot });
    const found = await page.evaluate(controls);
    step.done(url, `${found.length} control${found.length === 1 ? '' : 's'} on screen`);
    if (found.length) {
      ui.line();
      ui.table([['control', 'label', 'at', 'size'], ...found], { header: true });
    }
    ui.summary([
      ['made', fileRow(ui, p, screenshot, 'screenshot')],
      ['took', ui.took()],
    ]);
  } finally {
    await browser?.close();
    await server.stop();
  }
}
