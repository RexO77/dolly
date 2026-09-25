/**
 * The frame: the clip shown as a card on a background. Flat, with no
 * perspective: the card is only ever scaled and moved, so the camera's view
 * is resampled straight to the card's size and stays sharp.
 *
 * While the camera is wide the card sits on the background at `inset` of
 * the clip. As the camera leans in, the card grows until it fills the clip
 * edge to edge (the lean reads as the camera travelling up to the screen),
 * and settles back as it pulls out. That growth follows the camera's own
 * zoom, so it moves on the same curve. `push: false` keeps the card still.
 *
 *   spec.frame = {background: 'dusk' | 'ink' | 'paper' | 'wash' | {from, to, vignette},
 *                 inset, window, push, radius, shadow: {strength, blur, drop}}
 *
 * Pure: no Node or DOM dependency, so the renderer and the Studio's
 * preview place the card with the same numbers.
 */
import { cameraAt } from './math.mjs';
import { LEAN_Z, CARD_INSET, CARD_RADIUS, CARD_SHADOW, WINDOW_BAR, BACKDROPS } from './grammar.mjs';

const REFERENCE_WIDTH = 1920;

/** The frame with every default filled in, or null when the spec has none. */
export function resolveFrame(frame) {
  if (!frame) return null;
  const named = typeof frame.background === 'string' || !frame.background;
  return {
    background: named ? BACKDROPS[frame.background ?? 'dusk'] ?? BACKDROPS.dusk : { vignette: 0, ...frame.background },
    inset: frame.inset ?? CARD_INSET,
    window: frame.window ?? false,
    push: frame.push ?? true,
    radius: frame.radius ?? CARD_RADIUS,
    shadow: { ...CARD_SHADOW, ...frame.shadow },
  };
}

/** How far the card has grown toward filling the clip at `t`: 0 on the background, 1 edge to edge. */
export function pushAt(frame, keys, t) {
  if (!frame.push) return 0;
  const z = cameraAt(keys, t)[2];
  return Math.max(0, Math.min(1, (z - 1) / (LEAN_Z - 1)));
}

/**
 * Where the card sits at `t` in a W x H output, in output pixels: the
 * picture's rect {x, y, w, h}, the title bar above it (`bar` high, 0 with
 * no window), the corner radius, and the shadow's strength, blur and drop.
 * At full push the picture is exactly the output and the bar is off the top.
 */
export function cardAt(frame, keys, t, W, H) {
  const k = W / REFERENCE_WIDTH;
  const p = pushAt(frame, keys, t);
  const s = frame.inset + (1 - frame.inset) * p;
  const w = W * s;
  const h = H * s;
  const bar = frame.window ? WINDOW_BAR * k * s : 0;
  const x = (W - w) / 2;
  const y = (H - h) / 2 + (bar / 2) * (1 - p);
  return {
    x,
    y,
    w,
    h,
    bar,
    push: p,
    radius: frame.radius * k * (1 - p),
    shadow: { alpha: frame.shadow.strength * (1 - p), blur: frame.shadow.blur * k, drop: frame.shadow.drop * k },
  };
}

/**
 * The master region that lands on the whole-pixel rect around the card, so
 * the card can be resampled at its exact, fractional size and position:
 * returns {X, Y, IW, IH} (the rect, whole output pixels) and `box`, the
 * master rect that fills it.
 */
export function cardSource(card, view) {
  const X = Math.floor(card.x);
  const Y = Math.floor(card.y);
  const IW = Math.ceil(card.x + card.w) - X;
  const IH = Math.ceil(card.y + card.h) - Y;
  const sx = view.vw / card.w;
  const sy = view.vh / card.h;
  const bx0 = view.x0 + (X - card.x) * sx;
  const by0 = view.y0 + (Y - card.y) * sy;
  return { X, Y, IW, IH, box: [bx0, by0, bx0 + IW * sx, by0 + IH * sy] };
}
