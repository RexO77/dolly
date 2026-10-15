/**
 * A launch film's ending: out of the last shot, one line of copy on black,
 * then the still logo. The type and the logo are set once by Chrome (so the
 * product's own font and mark are used), then every ending frame is made
 * from those two pictures: un-blurring and fading up, a short dissolve, a hold.
 */
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { launchHeadless } from '../browser.mjs';
import { gaussian } from './frame.mjs';
import { ENDING } from './grammar.mjs';

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** A picture of `html` on black, W x H, as float RGB. */
async function set(browser, html, W, H) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><body style="margin:0;width:${W}px;height:${H}px;background:#000;display:grid;place-items:center">${html}</body>`);
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: 'png' });
  const pixels = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(0, 0, c.width, c.height).data);
  }, png.toString('base64'));
  await page.close();
  const out = new Float32Array(W * H * 3);
  for (let i = 0, o = 0; i < pixels.length; i += 4, o += 3) {
    out[o] = pixels[i];
    out[o + 1] = pixels[i + 1];
    out[o + 2] = pixels[i + 2];
  }
  return out;
}

/** The copy and the logo, set at size H. `ending` is {copy, tagline?, logo?, name?, font?}; `logo` is an SVG or PNG path. */
export async function setEnding(ending, W, H) {
  const s = H / 1080;
  /* Set inside a style attribute, so the font stack's names take single quotes. */
  const font = (ending.font ?? "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif").replace(/"/g, "'");
  const type = (size) => `font: 500 ${size * s}px/1.2 ${font}; letter-spacing: -0.02em; color: rgb(255 255 255 / 0.95)`;
  const line = [ending.copy, ending.tagline].filter(Boolean).map(escape).join(' ');
  const browser = await launchHeadless();
  try {
    const copy = await set(browser, `<div style="${type(ENDING.copySize)}">${line}</div>`, W, H);
    let mark = '';
    if (ending.logo) {
      const data = readFileSync(ending.logo).toString('base64');
      const mime = extname(ending.logo) === '.svg' ? 'image/svg+xml' : 'image/png';
      /* The mark in plain white: no colour, no bloom. */
      mark = `<img src="data:${mime};base64,${data}" style="height:${ENDING.logoSize * s}px;filter:brightness(0) invert(1)">`;
    }
    const word = ending.name ? `<span style="${type(ENDING.copySize)}">${escape(ending.name)}</span>` : '';
    const logo = mark || word ? await set(browser, `<div style="display:flex;align-items:center;gap:${0.4 * ENDING.logoSize * s}px">${mark}${word}</div>`, W, H) : null;
    return { copy, logo };
  } finally {
    await browser.close();
  }
}

const easeOut = (u) => 1 - (1 - Math.max(0, Math.min(1, u))) ** 3;

/** A picture blurred by `sigma` and scaled by `gain`, as bytes. */
function frameOf(img, W, H, sigma, gain) {
  const work = sigma > 0.3 ? gaussian(Float32Array.from(img), W, H, sigma) : img;
  const out = new Uint8Array(W * H * 3);
  for (let i = 0; i < out.length; i += 1) out[i] = Math.max(0, Math.min(255, Math.round(work[i] * gain)));
  return out;
}

/**
 * Every ending frame, in order: `last` (the final shot's last frame, bytes)
 * blurring and dimming into black, the copy un-blurring up, its hold, the
 * dissolve to the logo, and the logo's hold.
 */
export function* endingFrames({ copy, logo }, last, W, H, fps) {
  const s = H / 1080;
  const n = (seconds) => Math.max(1, Math.round(seconds * fps));
  const lastF = Float32Array.from(last);
  for (let i = 0, k = n(ENDING.out); i < k; i += 1) yield frameOf(lastF, W, H, (12 * s * (i + 1)) / k, 1 - (i + 1) / k);
  for (let i = 0, k = n(ENDING.copyIn); i < k; i += 1) {
    const e = easeOut((i + 1) / k);
    yield frameOf(copy, W, H, ENDING.copyBlur * s * (1 - e), e);
  }
  const held = frameOf(copy, W, H, 0, 1);
  for (let i = 0, k = n(ENDING.copyHold); i < k; i += 1) yield held;
  if (!logo) return;
  const still = frameOf(logo, W, H, 0, 1);
  /* A cut to the logo, or a dissolve if the grammar asks for one: never long enough for the two to tangle. */
  for (let i = 0, k = ENDING.logoDissolve > 0 ? n(ENDING.logoDissolve) : 0; i < k; i += 1) {
    const t = (i + 1) / k;
    const mix = new Uint8Array(held.length);
    for (let j = 0; j < mix.length; j += 1) mix[j] = Math.round(held[j] * (1 - t) + still[j] * t);
    yield mix;
  }
  for (let i = 0, k = n(ENDING.logoHold); i < k; i += 1) yield still;
}
