/**
 * The browser a take runs in: a real (headful) Chrome window, parked off
 * screen, at the display's own pixel ratio.
 *
 * Headless Chrome screencasts at CSS pixels whatever the device scale, so a
 * 1440 page comes out 1440 wide; a headful window casts at device pixels
 * (2880x1800 on a retina Mac). The screencast is of the page's pixels only,
 * so the OS cursor never appears. Background throttling is off so an
 * off-screen window still paints every frame. The window is sized so its
 * CONTENT is exactly the viewport: the cast is of the window's content, not
 * an emulated viewport, which is also why the pixel ratio cannot be forced.
 */
import { chromium } from 'playwright-core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sleep } from './input.mjs';

/** The installed Google Chrome (Dolly never downloads a browser), or DOLLY_CHROME. */
export const launchOptions = () => (process.env.DOLLY_CHROME ? { executablePath: process.env.DOLLY_CHROME } : { channel: 'chrome' });

export async function openBrowser({ width, height }) {
  const profile = mkdtempSync(join(tmpdir(), 'dolly-'));
  const context = await chromium.launchPersistentContext(profile, {
    ...launchOptions(),
    headless: false,
    viewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--hide-scrollbars',
      '--window-position=-4000,0',
      `--window-size=${width},${height + 150}`,
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return {
    context,
    page,
    async close() {
      await context.close().catch(() => undefined);
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

/**
 * Size the window so its content is exactly width x height, and report the
 * display's pixel ratio. Chrome has a minimum window size, so a small
 * viewport can come out larger; that is a warning, not an error.
 */
export async function fitWindow(page, { width, height }) {
  const cdp = await page.context().newCDPSession(page);
  const { windowId } = await cdp.send('Browser.getWindowForTarget');
  const inner = () => page.evaluate(() => ({ iw: innerWidth, ih: innerHeight, ow: outerWidth, oh: outerHeight, dpr: devicePixelRatio }));
  for (let i = 0; i < 3; i += 1) {
    const m = await inner();
    if (m.iw === width && m.ih === height) break;
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { width: width + (m.ow - m.iw), height: height + (m.oh - m.ih) } });
    await sleep(300);
  }
  await cdp.detach();
  const m = await inner();
  const warnings = [];
  if (m.iw !== width || m.ih !== height) warnings.push(`window content is ${m.iw}x${m.ih}, wanted ${width}x${height} (Chrome has a minimum window size)`);
  return { width: m.iw, height: m.ih, dpr: m.dpr, warnings };
}
