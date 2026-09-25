/**
 * The browser a take runs in: a real Chrome window (not headless), parked
 * off screen, at the display's own pixel ratio.
 *
 * Headless Chrome screencasts at CSS pixels whatever the device scale, so a
 * 1440 page comes out 1440 wide; a real window casts at device pixels
 * (2880x1800 on a retina Mac). The screencast is of the page's pixels only,
 * so the OS cursor never appears. Background throttling is off so an
 * off-screen window still paints every frame. The window is sized so its
 * content is exactly the viewport: the cast is of the window's content, not
 * an emulated viewport, which is also why the pixel ratio cannot be forced.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sleep } from './motion.mjs';

/* Playwright is loaded on first use, so commands that never open Chrome start quickly. */
const playwright = () => import('playwright-core').then((m) => m.chromium);

/** The installed Google Chrome (Dolly never downloads a browser), or the binary DOLLY_CHROME names. */
export const launchOptions = () => (process.env.DOLLY_CHROME ? { executablePath: process.env.DOLLY_CHROME } : { channel: 'chrome' });

/** Why Chrome did not start, and what to do about it. */
function chromeError(error) {
  const detail = error.message.split('\n')[0].replace(/^[\w.]+: /, '');
  const fix = process.env.DOLLY_CHROME
    ? `check that DOLLY_CHROME (${process.env.DOLLY_CHROME}) points at a Chrome binary, or unset it to use the installed Chrome`
    : 'install Google Chrome, or set DOLLY_CHROME to the path of a Chrome binary';
  return new Error(`Chrome did not start (${detail}); ${fix}. \`dolly doctor\` checks it`, { cause: error });
}

/** A headless Chrome, for work where pixels are not filmed: inspecting a page, checking the install. */
export async function launchHeadless(options = {}) {
  try {
    return await (await playwright()).launch({ ...launchOptions(), ...options });
  } catch (error) {
    throw chromeError(error);
  }
}

/** A real Chrome window off screen, with a throwaway profile. Returns {context, page, close()}. */
export async function openBrowser({ width, height }) {
  const profile = mkdtempSync(join(tmpdir(), 'dolly-'));
  let context;
  try {
    context = await (await playwright()).launchPersistentContext(profile, {
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
  } catch (error) {
    rmSync(profile, { recursive: true, force: true });
    throw chromeError(error);
  }
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
  const measure = () => page.evaluate(() => ({ iw: innerWidth, ih: innerHeight, ow: outerWidth, oh: outerHeight, dpr: devicePixelRatio }));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const m = await measure();
    if (m.iw === width && m.ih === height) break;
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { width: width + (m.ow - m.iw), height: height + (m.oh - m.ih) } });
    await sleep(300);
  }
  await cdp.detach();
  const m = await measure();
  const warnings = [];
  if (m.iw !== width || m.ih !== height) warnings.push(`the window's content is ${m.iw}x${m.ih}, not ${width}x${height} (Chrome has a minimum window size)`);
  return { width: m.iw, height: m.ih, dpr: m.dpr, warnings };
}
