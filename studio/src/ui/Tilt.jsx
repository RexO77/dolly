/**
 * Tilt: a small card you turn by hand. Drag across it to turn it (Y), up
 * and down to tip it back (X), and with Alt held to roll it (Z). Its three
 * axes are drawn through it, so you can see which way it faces, and each
 * angle is a value beside it you can drag or type. Every degree ticks, and
 * each axis clicks as it passes flat.
 *
 * The card is turned with the same CSS order the stage's maths uses
 * (rotateX, then rotateY, then rotateZ), so it faces the way the clip will.
 */
import { useRef } from 'react';
import { Button, Value } from './controls.jsx';
import { sound } from './sound.js';
import { HERO_TILT } from '../../../engine/camera/grammar.mjs';

/* ─────────────────────────────────────────────────────────
 * THE PAD
 *
 *   drag across      Y  turn     0.45° per px
 *   drag up, down    X  tip      0.45° per px
 *   Alt, drag        Z  roll     0.3° per px
 *   Shift            locks the drag to one axis
 *   near 0           each axis settles flat within 0.8°
 * ───────────────────────────────────────────────────────── */
const PAD = { w: 168, h: 112, card: { w: 92, h: 58 }, perspective: 240 };
const PER_PX = 0.45;
const ROLL_PER_PX = 0.3;
const LIMIT = { x: 45, y: 45, z: 30 };
const FLAT = 0.8;
const AXES = [
  { key: 'x', label: 'Tip', long: 'Tip it back (X)', v: [1, 0, 0] },
  { key: 'y', label: 'Turn', long: 'Turn it (Y)', v: [0, -1, 0] },
  { key: 'z', label: 'Roll', long: 'Roll it (Z)', v: [0, 0, 1] },
];

const rad = (d) => (d * Math.PI) / 180;
/** A point turned like CSS rotateX(x) rotateY(y) rotateZ(z), then seen from `d` away: the stage's own order. */
function project([px, py, pz], t, d) {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(rad(t.x)), Math.sin(rad(t.x)), Math.cos(rad(t.y)), Math.sin(rad(t.y)), Math.cos(rad(t.z)), Math.sin(rad(t.z))];
  const x1 = px * cz - py * sz;
  const y1 = px * sz + py * cz;
  const x2 = x1 * cy + pz * sy;
  const z2 = -x1 * sy + pz * cy;
  const y3 = y1 * cx - z2 * sx;
  const z3 = y1 * sx + z2 * cx;
  const k = d / (d - z3);
  return [x2 * k, y3 * k, z3];
}

const round1 = (v) => Math.round(v * 10) / 10;

export function Tilt({ tilt, onChange, onSettle }) {
  const drag = useRef(null);
  const set = (next, live = true) => {
    const out = { ...tilt };
    for (const { key } of AXES) {
      let v = Math.max(-LIMIT[key], Math.min(LIMIT[key], next[key] ?? tilt[key]));
      if (Math.abs(v) < FLAT) v = 0;
      v = round1(v);
      if (v === 0 && tilt[key] !== 0) sound.detent();
      else if (Math.floor(v) !== Math.floor(tilt[key])) sound.tick(0.3);
      out[key] = v;
    }
    onChange(out, live);
  };

  const onDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, from: { ...tilt }, lock: null };
    e.currentTarget.dataset.gripped = '';
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    let dx = e.clientX - d.x;
    let dy = e.clientY - d.y;
    if (e.altKey) {
      set({ z: d.from.z + dx * ROLL_PER_PX });
      return;
    }
    if (e.shiftKey) {
      d.lock ??= Math.abs(dx) > Math.abs(dy) ? 'y' : 'x';
      if (d.lock === 'y') dy = 0;
      else dx = 0;
    } else d.lock = null;
    set({ y: d.from.y + dx * PER_PX, x: d.from.x - dy * PER_PX });
  };
  const onUp = (e) => {
    delete e.currentTarget.dataset.gripped;
    if (drag.current) onSettle?.();
    drag.current = null;
  };

  /* The axes, drawn from the card's centre through the same turn the card has. */
  const len = 34;
  const axes = AXES.filter((a) => a.key !== 'z').map((a) => {
    const [x, y, z] = project(a.v.map((c) => c * len), tilt, PAD.perspective);
    return { ...a, x, y, behind: z < -1 };
  });
  /* Z is the roll: a ring round the card's face, turned with it, and a handle on it at the roll's angle. */
  const face = { x: tilt.x, y: tilt.y, z: 0 };
  const ring = Array.from({ length: 49 }, (_, i) => project([Math.cos((i / 48) * Math.PI * 2) * 44, Math.sin((i / 48) * Math.PI * 2) * 44, 0], face, PAD.perspective));
  /* The handle hangs at the bottom of the ring, clear of the Y axis above, and swings with the roll. */
  const [rx, ry] = project([-Math.sin(rad(tilt.z)) * 44, Math.cos(rad(tilt.z)) * 44, 0], face, PAD.perspective);
  const flat = tilt.x === 0 && tilt.y === 0 && tilt.z === 0;

  return (
    <div className="tilt">
      <div
        className="tilt-pad"
        role="group"
        aria-label="Tilt the card: drag across to turn it, up and down to tip it back, with Alt to roll it"
        style={{ width: PAD.w, height: PAD.h, perspective: `${PAD.perspective}px` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={() => {
          set({ x: 0, y: 0, z: 0 }, false);
        }}
      >
        <div className="tilt-floor" aria-hidden="true" />
        <div
          className="tilt-card"
          aria-hidden="true"
          style={{ width: PAD.card.w, height: PAD.card.h, transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) rotateZ(${tilt.z}deg)` }}
        >
          <span className="tilt-card-bar" />
          <span className="tilt-card-side" />
          <span className="tilt-card-lines" />
        </div>
        <svg className="tilt-axes" width={PAD.w} height={PAD.h} viewBox={`${-PAD.w / 2} ${-PAD.h / 2} ${PAD.w} ${PAD.h}`} aria-hidden="true">
          <polyline className="tilt-ring" points={ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} />
          <g className="tilt-axis tilt-axis-z">
            <circle cx={rx} cy={ry} r={7} />
            <text x={rx} y={ry} dy="0.34em" textAnchor="middle">Z</text>
          </g>
          {axes
            .slice()
            .sort((a, b) => Number(b.behind) - Number(a.behind))
            .map((a) => (
              <g key={a.key} className={`tilt-axis tilt-axis-${a.key}`} opacity={a.behind ? 0.4 : 1}>
                <line x1={0} y1={0} x2={a.x} y2={a.y} />
                <circle cx={a.x} cy={a.y} r={7} />
                <text x={a.x} y={a.y} dy="0.34em" textAnchor="middle">{a.key.toUpperCase()}</text>
              </g>
            ))}
          <circle className="tilt-origin" r={2} />
        </svg>
      </div>
      <div className="tilt-values">
        {AXES.map((a) => (
          <label key={a.key} className="tilt-value">
            <span className={`tilt-chip tilt-axis-${a.key}`} aria-hidden="true">{a.key.toUpperCase()}</span>
            <span className="values-label">{a.label}</span>
            <Value label={a.long} value={tilt[a.key]} step={0.1} min={-LIMIT[a.key]} max={LIMIT[a.key]} format={(v) => `${v.toFixed(1)}°`} onChange={(v, live) => set({ [a.key]: v }, live)} onSettle={onSettle} />
          </label>
        ))}
        <div className="tilt-presets">
          <Button size="s" onClick={() => set({ x: 0, y: 0, z: 0 }, false)} disabled={flat}>Flat</Button>
          <Button size="s" onClick={() => set(HERO_TILT, false)}>Product angle</Button>
        </div>
      </div>
    </div>
  );
}
