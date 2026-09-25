/**
 * Zoom as a lens barrel: a ring you roll, seen side on. Its marks are
 * printed on a cylinder, so they crowd together and fade as they turn away
 * toward the edges; below them, the rubber grip's ridges roll with it. The
 * index on the fixed collar is the zoom.
 *
 * Wide sits at 1 and the grammar's lean at 1.35 is a detent the ring clicks
 * into (hold Shift to roll past it). Past the take's sharp limit the marks
 * turn amber, like the far end of a depth-of-field scale. A flick keeps the
 * ring turning for a moment; every mark it passes ticks.
 */
import { useEffect, useId, useRef } from 'react';
import { LEAN_Z } from '../model/clip.js';
import { sound } from './sound.js';

/* ─────────────────────────────────────────────────────────
 * THE BARREL
 *
 *   0 ─ 10   the fixed collar, with the index
 *  10 ─ 34   the scale: a mark every 0.025, labels every 0.25
 *  36 ─ 58   the grip: a ridge every 4°
 *
 * One unit of zoom is DEG_PER_UNIT of turn. At the centre, one pixel of drag
 * moves the barrel one pixel under the index.
 * ───────────────────────────────────────────────────────── */
const H = 58;
const DEG_PER_UNIT = 150;
const MARK = 0.025;
const RIDGE_DEG = 4;
const SNAP = 0.012;
const FRICTION = 0.9; // velocity kept per 16ms of coasting
const rad = (d) => (d * Math.PI) / 180;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Lens({ value, onChange, onSettle, max = 2, sharpMax = Infinity, width = 280, label = 'Zoom' }) {
  const id = `lens${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const svg = useRef(null);
  const drag = useRef(null);
  const coast = useRef(0);
  const live = useRef({ value, onChange, onSettle, max });
  live.current = { value, onChange, onSettle, max };

  const cx = width / 2;
  const R = cx + 6;
  const pxPerUnit = R * rad(DEG_PER_UNIT);
  const angle = (z) => (z - value) * DEG_PER_UNIT;
  const project = (deg) => cx + R * Math.sin(rad(deg));

  /* Every change goes through here, so each mark the index passes ticks and a detent clicks. */
  const turn = (to, { free = false, liveEdit = true, speed = 0 } = {}) => {
    const { value: from, onChange: change, max: top } = live.current;
    let z = Math.max(1, Math.min(top, to));
    if (!free && Math.abs(z - LEAN_Z) < SNAP) z = LEAN_Z;
    else if (!free && Math.abs(z - 1) < SNAP) z = 1;
    const marks = Math.abs(Math.floor(z / MARK + 1e-6) - Math.floor(from / MARK + 1e-6));
    if (z === from) return z;
    if ((z === LEAN_Z || z === 1) && from !== z) sound.detent();
    else if (z === top || z === 1) sound.stop();
    else if (marks) sound.tick(speed);
    live.current.value = z;
    change(z, liveEdit);
    return z;
  };

  const stopCoast = () => cancelAnimationFrame(coast.current);
  useEffect(() => stopCoast, []);

  /* A trackpad or wheel turns it too; the listener is not passive, so the page does not scroll under it. */
  useEffect(() => {
    const el = svg.current;
    let settleTimer = 0;
    const onWheel = (e) => {
      e.preventDefault();
      stopCoast();
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      turn(live.current.value + d / pxPerUnit, { free: e.shiftKey, speed: Math.min(1, Math.abs(d) / 40) });
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => live.current.onSettle?.(), 180);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      clearTimeout(settleTimer);
    };
  }, [pxPerUnit]);

  const release = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    let v = d.velocity; // units per ms
    if (reducedMotion() || Math.abs(v) < 0.0004) {
      live.current.onSettle?.();
      return;
    }
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(48, now - last);
      last = now;
      v *= FRICTION ** (dt / 16);
      const before = live.current.value;
      const after = turn(before + v * dt, { free: d.free, speed: Math.min(1, Math.abs(v) * 400) });
      const stuck = after === before || after === 1 || after === live.current.max || after === LEAN_Z;
      if (Math.abs(v) < 0.00006 || stuck) {
        live.current.onSettle?.();
        return;
      }
      coast.current = requestAnimationFrame(step);
    };
    coast.current = requestAnimationFrame(step);
  };

  /* ── The scale ── */
  const marks = [];
  for (let i = 0, z = 1; z <= max + 1e-9; i += 1, z = 1 + i * MARK) {
    const deg = angle(z);
    if (Math.abs(deg) > 86) continue;
    const c = Math.cos(rad(deg));
    const x = project(deg);
    const lean = Math.abs(z - LEAN_Z) < 1e-6;
    const quarter = i % 10 === 0;
    const soft = z > sharpMax + 1e-6;
    const cls = ['lens-mark', quarter && 'lens-mark-major', lean && 'lens-mark-lean', soft && 'lens-mark-soft'].filter(Boolean).join(' ');
    marks.push(<line key={`m${i}`} className={cls} x1={x} x2={x} y1={11} y2={lean ? 24 : quarter ? 21 : 16} strokeWidth={(quarter || lean ? 1.5 : 1) * (0.45 + 0.55 * c)} opacity={0.25 + 0.75 * c ** 1.5} />);
    if (quarter) {
      const text = z === 1 ? '1×' : Number.isInteger(z) ? `${z}×` : String(Number(z.toFixed(2)));
      marks.push(
        <text key={`l${i}`} className={soft ? 'lens-engraving lens-mark-soft' : 'lens-engraving'} transform={`translate(${x} 32) scale(${Math.max(0.05, c)} 1)`} textAnchor="middle" opacity={0.2 + 0.8 * c ** 2}>
          {text}
        </text>,
      );
    }
    if (lean) marks.push(<circle key="lean-dot" className="lens-lean-dot" cx={x} cy={29} r={2 * (0.5 + 0.5 * c)} opacity={0.3 + 0.7 * c} />);
  }

  /* ── The grip: ridges all the way round, rolling with the ring ── */
  const ridges = [];
  const phase = ((((value - 1) * DEG_PER_UNIT) % RIDGE_DEG) + RIDGE_DEG) % RIDGE_DEG;
  for (let deg = -88 - phase; deg <= 88; deg += RIDGE_DEG) {
    const a = project(Math.max(-89.9, deg - RIDGE_DEG * 0.3));
    const b = project(Math.min(89.9, deg + RIDGE_DEG * 0.3));
    const c = Math.cos(rad(deg));
    if (b - a < 0.2) continue;
    ridges.push(<rect key={deg.toFixed(2)} className="lens-ridge" x={a} y={38} width={b - a} height={H - 41} rx={Math.min(1, (b - a) / 2)} opacity={0.15 + 0.85 * c ** 1.2} />);
  }

  const state = value <= 1.0005 ? 'wide' : Math.abs(value - LEAN_Z) < 1e-6 ? 'the lean' : value > sharpMax + 1e-6 ? 'soft past here' : '';
  const readout = value <= 1.0005 ? 'Wide' : `${value.toFixed(3)}×`;

  return (
    <div className="lens" style={{ width }}>
      <svg
        ref={svg}
        className="lens-barrel"
        width={width}
        height={H}
        viewBox={`0 0 ${width} ${H}`}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={1}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={state ? `${readout}, ${state}` : readout}
        onPointerDown={(e) => {
          stopCoast();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, v: value, t: performance.now(), lastX: e.clientX, velocity: 0, free: e.shiftKey };
          e.currentTarget.dataset.gripped = '';
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const now = performance.now();
          const dz = -(e.clientX - d.lastX) / pxPerUnit;
          const dt = Math.max(1, now - d.t);
          d.velocity = 0.7 * (dz / dt) + 0.3 * d.velocity;
          d.t = now;
          d.lastX = e.clientX;
          d.free = e.shiftKey;
          turn(d.v - (e.clientX - d.x) / pxPerUnit, { free: e.shiftKey, speed: Math.min(1, Math.abs(dz / dt) * 400) });
        }}
        onPointerUp={(e) => {
          delete e.currentTarget.dataset.gripped;
          release();
        }}
        onPointerCancel={(e) => {
          delete e.currentTarget.dataset.gripped;
          drag.current = null;
          onSettle?.();
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.1 : 0.01;
          let to = null;
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') to = value + step;
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') to = value - step;
          else if (e.key === 'Home') to = 1;
          else if (e.key === 'End') to = max;
          else if (e.key === 'l' || e.key === 'L') to = LEAN_Z;
          if (to === null) return;
          e.preventDefault();
          e.stopPropagation();
          turn(to, { free: true, liveEdit: false });
        }}
      >
        <defs>
          <linearGradient id={`${id}-form`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#000" stopOpacity="0.9" />
            <stop offset="0.09" stopColor="#000" stopOpacity="0.55" />
            <stop offset="0.26" stopColor="#000" stopOpacity="0.08" />
            <stop offset="0.4" stopColor="#fff" stopOpacity="0.07" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.02" />
            <stop offset="0.72" stopColor="#000" stopOpacity="0.12" />
            <stop offset="0.91" stopColor="#000" stopOpacity="0.55" />
            <stop offset="1" stopColor="#000" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id={`${id}-grip`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.06" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.35" />
          </linearGradient>
          <clipPath id={`${id}-shape`}>
            <rect width={width} height={H} rx={9} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${id}-shape)`}>
          <rect className="lens-body" width={width} height={H} />
          <rect className="lens-collar" width={width} height={10} />
          <rect className="lens-grip" y={36} width={width} height={H - 36} />
          {ridges}
          <rect y={36} width={width} height={H - 36} fill={`url(#${id}-grip)`} />
          {marks}
          <rect className="lens-chamfer" y={10} width={width} height={1} />
          <rect className="lens-seam" y={35} width={width} height={1} />
          <rect width={width} height={H} fill={`url(#${id}-form)`} pointerEvents="none" />
        </g>
        <path className="lens-index" d={`M${cx - 4} 2.5h8l-4 5.5z`} />
      </svg>
      <span className="lens-readout">
        {readout}
        {state && <span className="lens-state"> · {state}</span>}
      </span>
    </div>
  );
}
