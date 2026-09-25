/**
 * Dolly's mark: candidates, one source. Writes each as an SVG that
 * follows the browser's light or dark tab (public/icons/*.svg), the chosen
 * one as public/icon.svg with a 180px apple-touch-icon.png, and a preview
 * sheet at public/icon-options.html with every mark at 16, 32, 64 and
 * 180px on a light and a dark tab bar.
 *
 *   npm run icons:site            # after changing CHOSEN, run it again
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { launchOptions } from '../../engine/browser.mjs';

const CHOSEN = 'camera-plain';

const INK = '#1a191d';
const PAPER = '#f5f5f2';
const WASH = '#f3e6d2'; // oklch(0.93 0.03 78)

/*
 * Each mark is drawn on a 32 grid from three roles: t (the tile), a (the
 * main shape) and w (the accent). A palette says what each role is, in a
 * light tab and in a dark one.
 */
const MARKS = {
  'camera': {
    name: 'Camera d',
    idea: 'the owner’s sketch: a camera body is the bowl, a tall mast is the stem, with a viewfinder and a slot in the mast',
    body: '<rect class="t" width="32" height="32" rx="8"/><rect class="a" x="7" y="14" width="17" height="11" rx="3"/><rect class="a" x="19.5" y="6" width="4.5" height="19" rx="1.75"/><rect class="t" x="9.5" y="16.5" width="4.5" height="2.5" rx="1"/><rect class="t" x="21" y="8.5" width="1.5" height="12.5" rx="0.75"/>',
    light: { t: INK, a: WASH },
    dark: { t: PAPER, a: INK },
  },
  'camera-plain': {
    name: 'Camera d, plain',
    idea: 'the same letter with only the viewfinder, so it holds up at tab size',
    body: '<rect class="t" width="32" height="32" rx="8"/><rect class="a" x="7" y="14" width="17" height="11" rx="3"/><rect class="a" x="19.5" y="6" width="4.5" height="19" rx="1.75"/><rect class="t" x="9.5" y="16.5" width="4.5" height="2.5" rx="1"/>',
    light: { t: INK, a: WASH },
    dark: { t: PAPER, a: INK },
  },
  'camera-lens': {
    name: 'Camera d, lens',
    idea: 'the body carries a round lens instead of a viewfinder: reads as a camera sooner, as a d later',
    body: '<rect class="t" width="32" height="32" rx="8"/><rect class="a" x="7" y="14" width="17" height="11" rx="3"/><rect class="a" x="19.5" y="6" width="4.5" height="19" rx="1.75"/><circle class="t" cx="13" cy="19.5" r="2.75"/>',
    light: { t: INK, a: WASH },
    dark: { t: PAPER, a: INK },
  },
  'camera-rig': {
    name: 'Camera d, rig',
    idea: 'the camera sits beside its mast with a hairline gap, like a camera on a dolly column',
    body: '<rect class="t" width="32" height="32" rx="8"/><rect class="a" x="7" y="14" width="11.5" height="11" rx="3"/><rect class="a" x="19.5" y="6" width="4.5" height="19" rx="1.75"/><rect class="t" x="9.5" y="16.5" width="4.5" height="2.5" rx="1"/>',
    light: { t: INK, a: WASH },
    dark: { t: PAPER, a: INK },
  },
};

const rules = (p, scope = '') => Object.entries(p).map(([k, v]) => `${scope}.${k}{fill:${v}}`).join('');

/** A standalone SVG that follows the tab's colour scheme. */
const svg = (m, { square = false } = {}) => {
  const body = square ? m.body.replace('rx="8"', 'rx="0"') : m.body;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><style>${rules(m.light)}@media (prefers-color-scheme:dark){${rules(m.dark)}}</style>${body}</svg>\n`;
};

const here = fileURLToPath(new URL('..', import.meta.url));
const pub = join(here, 'public');
mkdirSync(join(pub, 'icons'), { recursive: true });
for (const [key, m] of Object.entries(MARKS)) writeFileSync(join(pub, 'icons', `${key}.svg`), svg(m));
writeFileSync(join(pub, 'icon.svg'), svg(MARKS[CHOSEN]));

/* The sheet draws every mark inline, so the light and dark tab mocks each show their own palette. */
const inline = (key, size) => `<svg class="m m-${key}" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">${MARKS[key].body}</svg>`;
const sizes = [16, 32, 64, 180];
const css = Object.entries(MARKS).map(([k, m]) => `${rules(m.light, `.light .m-${k} `)}${rules(m.dark, `.dark .m-${k} `)}`).join('\n');
const tab = (key, scheme) => `
      <div class="bar ${scheme}">
        <div class="tab">${inline(key, 16)}<span>Dolly: film your product</span><i>×</i></div>
        <div class="tab dim"><span class="fav"></span><span>Another tab</span></div>
      </div>
      <div class="sizes ${scheme}">${sizes.map((s) => `<figure>${inline(key, s)}<figcaption>${s}</figcaption></figure>`).join('')}</div>`;
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dolly mark options</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 40px 16px 80px; background: ${PAPER}; color: ${INK}; font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  main { max-width: 1040px; margin: 0 auto; display: grid; gap: 48px; }
  h1 { margin: 0; font-size: 26px; font-weight: 600; letter-spacing: -0.03em; }
  header p { margin: 8px 0 0; color: #5d5a58; max-width: 60ch; }
  section { display: grid; gap: 14px; }
  h2 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -0.02em; display: flex; gap: 10px; align-items: baseline; }
  h2 code { font: 12.5px ui-monospace, Menlo, monospace; color: #77736f; font-weight: 400; }
  h2 b { font: 600 11px ui-monospace, Menlo, monospace; background: ${WASH}; padding: 3px 8px; border-radius: 6px; }
  section > p { margin: -6px 0 0; color: #5d5a58; }
  .pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .col { display: grid; gap: 0; border-radius: 10px; overflow: hidden; }
  .bar { display: flex; align-items: flex-end; gap: 2px; height: 42px; padding: 0 10px; }
  .bar.light { background: #dfe1e5; }
  .bar.dark { background: #1f2023; }
  .tab { display: flex; align-items: center; gap: 8px; height: 34px; width: 220px; padding: 0 12px; border-radius: 9px 9px 0 0; font-size: 12px; white-space: nowrap; overflow: hidden; }
  .light .tab { background: #fff; color: #202124; }
  .dark .tab { background: #35363a; color: #e8eaed; }
  .tab.dim { background: transparent; width: 160px; opacity: 0.7; }
  .tab span { flex: 1; overflow: hidden; text-overflow: ellipsis; }
  .tab i { font-style: normal; opacity: 0.6; }
  .fav { flex: none !important; width: 16px; height: 16px; border-radius: 50%; background: currentColor; opacity: 0.35; }
  .sizes { display: flex; align-items: flex-end; gap: 24px; padding: 20px; min-height: 240px; }
  .sizes.light { background: #ffffff; }
  .sizes.dark { background: #28292c; color: #e8eaed; }
  figure { margin: 0; display: grid; justify-items: center; gap: 8px; }
  figcaption { font: 11px ui-monospace, Menlo, monospace; opacity: 0.6; }
  .m { display: block; flex: none; }
  ${css}
  @media (max-width: 760px) { .pair { grid-template-columns: minmax(0, 1fr); } .sizes { gap: 14px; overflow-x: auto; } }
</style>
</head>
<body>
<main>
  <header>
    <h1>Dolly: a camera d</h1>
    <p>Each is two or three flat shapes on a 32 grid, in ink, paper and the wash. The files follow the browser: a light tab gets the light palette, a dark tab the dark one. The one marked current is <code>icon.svg</code>; change <code>CHOSEN</code> in <code>site/scripts/icons.mjs</code> and run <code>npm run icons:site</code> to switch.</p>
  </header>
${Object.entries(MARKS).map(([key, m]) => `  <section>
    <h2>${m.name} <code>icons/${key}.svg</code>${key === CHOSEN ? ' <b>current</b>' : ''}</h2>
    <p>${m.idea}.</p>
    <div class="pair">
      <div class="col">${tab(key, 'light')}
      </div>
      <div class="col">${tab(key, 'dark')}
      </div>
    </div>
  </section>`).join('\n')}
</main>
</body>
</html>
`;
writeFileSync(join(pub, 'icon-options.html'), html);

/* The home-screen icon: the chosen mark, square (iOS rounds it), light palette, 180px. */
const browser = await chromium.launch({ ...launchOptions(), headless: true });
const page = await browser.newPage({ viewport: { width: 180, height: 180 }, colorScheme: 'light' });
await page.setContent(`<body style="margin:0">${svg(MARKS[CHOSEN], { square: true }).replace('<svg ', '<svg width="180" height="180" ')}</body>`);
await page.screenshot({ path: join(pub, 'apple-touch-icon.png'), omitBackground: false });
await browser.close();
console.log(`wrote the marks, icon.svg (${CHOSEN}), apple-touch-icon.png and icon-options.html`);
