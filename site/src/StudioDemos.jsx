/**
 * The Studio, on the page: real screenshots of it running on the demo
 * workspace, and small working pieces of it. The lens is the Studio's own
 * control, the sounds are the Studio's own sounds, and the notes and the
 * snapping run on the engine's camera maths, the way the Studio does.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cameraAt, viewBox, resolve, spring } from '../../engine/camera/math.mjs';
import { LEAN_Z, SETTLE, SPRING } from '../../engine/camera/grammar.mjs';
import { Lens } from '../../studio/src/ui/Lens.jsx';
import { sound } from '../../studio/src/ui/sound.js';
import { media, useReducedMotion, useSoundOn } from './hooks.js';
import { Icon, SoundToggle } from './parts.jsx';

/* ─────────────────────────────────────────────────────────
 * SCREENSHOTS
 * ───────────────────────────────────────────────────────── */

const CALLOUTS = [
  { n: 1, x: 3, y: 12.9, text: 'The take through the camera, live. This is what renders.' },
  { n: 2, x: 1.4, y: 78.6, text: 'The strip: every shot, the moments the take marked, and where the product changes.' },
  { n: 3, x: 71.3, y: 8.6, text: 'The shot list. Open a shot to retime it, pick what it lands on, and set its zoom.' },
  { n: 4, x: 77, y: 75.2, text: 'The zoom: a lens barrel you roll.' },
];

export function EditorFigure() {
  const [on, setOn] = useState(null);
  return (
    <figure className="editor-figure">
      <div className="screen tall">
        <a className="shot-wrap" href={media('studio-shot.webp')} target="_blank" rel="noreferrer" aria-label="The Studio with a shot open, full size">
          <img src={media('studio-shot.webp')} alt="The Studio with a shot open: the take through the camera on the left, the strip of shots below it, and the shot list with the lens barrel on the right" width="1600" height="1000" loading="lazy" />
          {CALLOUTS.map((c) => (
            <span key={c.n} className={`callout${on === c.n ? ' on' : ''}`} style={{ left: `${c.x}%`, top: `${c.y}%` }} aria-hidden="true">{c.n}</span>
          ))}
        </a>
      </div>
      <figcaption>
        <ol className="legend">
          {CALLOUTS.map((c) => (
            <li key={c.n} onPointerEnter={() => setOn(c.n)} onPointerLeave={() => setOn(null)}>
              <span className="callout static" aria-hidden="true">{c.n}</span>
              <span>{c.text}</span>
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  );
}

export function HomeFigure() {
  return (
    <div className="demo">
      <a className="screen" href={media('studio-home.webp')} target="_blank" rel="noreferrer" aria-label="The Studio's home screen, full size">
        <img className="home-shot" src={media('studio-home.webp')} alt="The Studio's home screen for Wrenly: three clips, each with its poster, its state (Rendered), its length, and its next step, the deliver command with a Copy button" width="1560" height="1320" loading="lazy" />
      </a>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * THE LENS
 *
 * The Studio's lens barrel, driving a real frame of the take. Past the
 * take's sharp limit the marks turn amber, and the frame softens the way
 * an upscaled render would.
 * ───────────────────────────────────────────────────────── */

function useWidth(ref, fallback) {
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export function LensDemo({ tour, sharpMax }) {
  const [z, setZ] = useState(LEAN_Z);
  const foot = useRef(null);
  const width = useWidth(foot, 320);
  const [cx, cy] = resolve({ focus: tour.boxes.issue });
  const v = viewBox(1440, 900, 1440, 900, [cx, cy, z]);
  const s = 1440 / v.vw;
  const soft = z > sharpMax + 1e-6;
  const on = useSoundOn();
  return (
    <div className="demo">
      <div className="screen">
        <div className="shot-frame">
          <img
            src={media('still.webp')}
            alt="Wrenly with an issue open, at the zoom the lens is set to"
            width="1440"
            height="900"
            style={{ transform: `scale(${s}) translate(${(-v.x0 / 1440) * 100}%, ${(-v.y0 / 900) * 100}%)`, filter: soft ? `blur(${((z - sharpMax) * 2.2).toFixed(2)}px)` : 'none' }}
          />
          <span className={`frame-tag${soft ? ' warn' : ''}`}>{soft ? 'soft: past the take’s pixels' : z <= 1.0005 ? 'wide' : `${z.toFixed(2)}×`}</span>
        </div>
      </div>
      <div className="lens-foot" ref={foot}>
        <Lens value={z} onChange={setZ} max={2} sharpMax={sharpMax} width={Math.min(360, Math.max(220, width))} label="Zoom" />
        <p className="hint">
          Drag it, flick it, or use the arrow keys. It clicks into 1× and the lean; hold Shift to roll past.
          {!on && <> <span className="dim">Sound is off, so the ticks are silent.</span></>}
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * NOTES THAT FIX THEMSELVES
 *
 * A lean that breaks two rules: it is still moving when the product
 * changes, and it leans closer than the take is sharp. Each note carries
 * the Studio's fix; pressing it moves the curve there on a spring.
 *
 *   broken   lean 6.75 → 7.95s to 1.55×, through the change at 7.77s
 *   timing   settled SETTLE before the change: 6.22 → 7.42s
 *   soft     capped at the take's sharp limit, 1.50×
 * ───────────────────────────────────────────────────────── */

const BROKEN = { start: 6.75, z: 1.55 };
const FIX_MS = 650;
const VIEW = { t0: 5, t1: 12.2, z0: 1, z1: 1.6 };

function noteKeys(tour, { start, z }) {
  const box = tour.boxes.issue;
  const [cx, cy] = resolve({ focus: box });
  const hold = 9.882;
  return [
    { t: 0, wide: true },
    { t: start, wide: true },
    { t: start + SPRING, cx, cy, z },
    { t: hold, cx, cy, z },
    { t: hold + SPRING, wide: true },
    { t: tour.master.duration, wide: true },
  ];
}

/** Tween `from` to `to` on the grammar's zero-bounce spring. */
function useTween(initial) {
  const [value, setValue] = useState(initial);
  const raf = useRef(0);
  const live = useRef(initial);
  live.current = value;
  const reduced = useReducedMotion();
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const to = (target) => {
    cancelAnimationFrame(raf.current);
    const from = live.current;
    if (reduced) {
      setValue(target);
      return;
    }
    const began = performance.now();
    const step = (now) => {
      const u = Math.min(1, (now - began) / FIX_MS);
      const k = spring(u);
      setValue(Object.fromEntries(Object.keys(target).map((key) => [key, from[key] + (target[key] - from[key]) * k])));
      if (u < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };
  return [value, to];
}

export function NotesDemo({ tour, sharpMax }) {
  const change = { from: tour.beats.menu, to: tour.beats.done + 0.3 };
  const settled = change.from - SETTLE;
  const [goal, setGoal] = useState(BROKEN);
  const box = useRef(null);
  /* Drawn at the panel's own width, so its words stay at their real size on a phone. */
  const W = Math.round(Math.max(300, useWidth(box, 560)));
  const [shape, tweenTo] = useTween(BROKEN);
  const keys = noteKeys(tour, shape);
  const end = shape.start + SPRING;
  const set = (next) => {
    setGoal(next);
    tweenTo(next);
  };

  const notes = [];
  if (goal.start + SPRING > settled + 0.01) {
    notes.push({
      id: 'timing',
      text: 'The product changes during this move. The camera should hold still for that.',
      fix: 'Settle before the change',
      apply: () => set({ ...goal, start: settled - SPRING }),
    });
  }
  if (goal.z > sharpMax + 1e-6) {
    const pct = Math.round((goal.z / sharpMax - 1) * 100);
    let at = goal.start;
    const k = noteKeys(tour, goal);
    while (at < goal.start + SPRING && cameraAt(k, at)[2] <= sharpMax) at += 1 / 30;
    notes.push({
      id: 'soft',
      text: `Soft at ${at.toFixed(2)}s. This lean is ${pct}% closer than the take has pixels for, so text blurs.`,
      fix: `Cap the lean at ${sharpMax.toFixed(2)}×`,
      apply: () => set({ ...goal, z: sharpMax }),
    });
  }

  /* The chart */
  const H = 180;
  const L = 40;
  const R = 12;
  const T = 26;
  const B = 28;
  const x = (t) => L + ((t - VIEW.t0) / (VIEW.t1 - VIEW.t0)) * (W - L - R);
  const y = (z) => T + ((VIEW.z1 - z) / (VIEW.z1 - VIEW.z0)) * (H - T - B);
  const pts = Array.from({ length: 241 }, (_, i) => {
    const t = VIEW.t0 + (i / 240) * (VIEW.t1 - VIEW.t0);
    return `${x(t).toFixed(1)},${y(cameraAt(keys, t)[2]).toFixed(1)}`;
  }).join(' ');
  const clash = end > change.from + 0.005;

  return (
    <div className="demo">
      <div className="panel" ref={box}>
        <svg className="notes-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`The shot's zoom over time: it leans to ${shape.z.toFixed(2)}× and settles at ${end.toFixed(2)}s; the product changes from ${change.from.toFixed(2)}s`}>
          <defs>
            <clipPath id="notes-soft"><rect x="0" y="0" width={W} height={y(sharpMax) - 2} /></clipPath>
            <clipPath id="notes-clash"><rect x={x(change.from)} y="0" width={Math.max(0, x(end) - x(change.from))} height={H} /></clipPath>
          </defs>
          <rect className="chart-change" x={x(change.from)} y={T - 6} width={x(change.to) - x(change.from)} height={H - T - B + 6} rx="4" />
          <text className="chart-label" x={x(change.from) + 6} y={T + 8}>the product changes</text>
          {[1, LEAN_Z].map((z) => <line key={z} className="chart-grid" x1={L} x2={W - R} y1={y(z)} y2={y(z)} />)}
          <line className="chart-limit" x1={L} x2={W - R} y1={y(sharpMax)} y2={y(sharpMax)} />
          <text className="chart-axis" x={L - 8} y={y(1) + 4} textAnchor="end">1×</text>
          <text className="chart-axis" x={L - 8} y={y(LEAN_Z) + 4} textAnchor="end">{LEAN_Z}</text>
          <text className="chart-axis limit" x={L - 8} y={y(sharpMax) + 4} textAnchor="end">{sharpMax.toFixed(2)}</text>
          <text className="chart-axis limit" x={L + 6} y={y(sharpMax) - 6}>sharp up to here</text>
          {[6, 8, 10, 12].map((t) => <text key={t} className="chart-axis" x={x(t)} y={H - 8} textAnchor="middle">{t}s</text>)}
          <polyline className="chart-curve" points={pts} />
          <polyline className="chart-curve bad" points={pts} clipPath="url(#notes-soft)" />
          {clash && <polyline className="chart-curve bad" points={pts} clipPath="url(#notes-clash)" />}
        </svg>
        <div className="notes" aria-live="polite">
          {notes.map((n) => (
            <div key={n.id} className="note-row" role="note">
              <span className="note-text">{n.text}</span>
              <button type="button" className="btn btn-note" onClick={() => {
                n.apply();
                sound.fix();
              }}>
                <Icon name="check" />{n.fix}
              </button>
            </div>
          ))}
          {!notes.length && (
            <div className="note-row ok">
              <span className="note-text">Nothing needs a look. That is the shot Dolly would have made on its own.</span>
              <button type="button" className="btn" onClick={() => {
                set(BROKEN);
                sound.undo();
              }}>
                <Icon name="undo" />Break it again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * SNAPS TO THE MOMENT
 *
 * The edge between a lean and its hold, on a strip of the take's real
 * beats. Near a beat it snaps on: the beat lights up and the snap sounds.
 * ───────────────────────────────────────────────────────── */

const SNAP_WITHIN = 0.2; // seconds
const STRIP = { t0: 5, t1: 10.6 };

export function SnapDemo({ tour }) {
  const lean0 = 6.217;
  const hold1 = 9.882;
  const beats = Object.entries(tour.beats).filter(([, t]) => t > STRIP.t0 && t < STRIP.t1).map(([label, t]) => ({ label, t }));
  const [edge, setEdge] = useState(7.1);
  const [hit, setHit] = useState(null);
  const [pop, setPop] = useState(0);
  const svg = useRef(null);
  const drag = useRef(false);
  const box = useRef(null);
  const W = Math.round(Math.max(300, useWidth(box, 560)));

  const H = 118;
  const x = (t) => 12 + ((t - STRIP.t0) / (STRIP.t1 - STRIP.t0)) * (W - 24);
  const tAt = (clientX) => {
    const r = svg.current.getBoundingClientRect();
    return STRIP.t0 + (((clientX - r.left) / r.width) * W - 12) / (W - 24) * (STRIP.t1 - STRIP.t0);
  };
  const place = (t, free) => {
    let next = Math.max(lean0 + 0.3, Math.min(hold1 - 0.3, t));
    const near = free ? null : beats.reduce((best, b) => (Math.abs(b.t - next) < SNAP_WITHIN && (!best || Math.abs(b.t - next) < Math.abs(best.t - next)) ? b : best), null);
    if (near) next = near.t;
    if (near && near.label !== hit) {
      sound.snap();
      setPop((p) => p + 1);
    }
    setHit(near ? near.label : null);
    setEdge(next);
  };

  const cells = [
    { t0: STRIP.t0, t1: lean0, what: 'Hold wide', dim: true },
    { t0: lean0, t1: edge, what: 'Lean in' },
    { t0: edge, t1: hold1, what: 'Hold on the issue' },
    { t0: hold1, t1: STRIP.t1, what: 'Pull back', dim: true },
  ];

  return (
    <div className="demo">
      <div className="panel" ref={box}>
        <svg
          ref={svg}
          className="snap-strip"
          viewBox={`0 0 ${W} ${H}`}
          role="slider"
          tabIndex={0}
          aria-label="Where the lean ends and the hold begins"
          aria-valuemin={lean0}
          aria-valuemax={hold1}
          aria-valuenow={Number(edge.toFixed(2))}
          aria-valuetext={`${edge.toFixed(2)} seconds${hit ? `, on the beat ${hit}` : ''}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = true;
            place(tAt(e.clientX), e.shiftKey);
          }}
          onPointerMove={(e) => drag.current && place(tAt(e.clientX), e.shiftKey)}
          onPointerUp={() => (drag.current = false)}
          onPointerCancel={() => (drag.current = false)}
          onKeyDown={(e) => {
            const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
            if (!d) return;
            e.preventDefault();
            /* From a beat, a key press steps off it; between beats it moves on to the next one in reach. */
            place(edge + d * (e.shiftKey ? 0.02 : 0.1) + (hit && !e.shiftKey ? d * SNAP_WITHIN : 0), e.shiftKey);
          }}
        >
          {Array.from({ length: Math.floor(STRIP.t1) - Math.ceil(STRIP.t0) + 1 }, (_, i) => Math.ceil(STRIP.t0) + i).map((s) => (
            <g key={s}>
              <line className="strip-tick" x1={x(s)} x2={x(s)} y1="4" y2="10" />
              <text className="strip-sec" x={x(s) + 3} y="11">{s}s</text>
            </g>
          ))}
          {beats.map((b) => (
            <g key={b.label} className={`strip-beat${hit === b.label ? ' hit' : ''}`}>
              <line x1={x(b.t)} x2={x(b.t)} y1="26" y2="92" />
              <circle key={hit === b.label ? pop : 0} className="strip-beat-dot" cx={x(b.t)} cy="22" r="3.5" />
              <text className="strip-beat-label" x={x(b.t)} y="108" textAnchor="middle">{b.label}</text>
            </g>
          ))}
          {cells.map((c) => (
            <g key={c.what} className={`strip-cell${c.dim ? ' dim' : ''}`}>
              <rect x={x(c.t0) + 1} y="34" width={Math.max(0, x(c.t1) - x(c.t0) - 2)} height="46" rx="6" />
              {x(c.t1) - x(c.t0) > c.what.length * 6.4 + 16 && <text x={x(c.t0) + 9} y="61">{c.what}</text>}
            </g>
          ))}
          <g className={`strip-edge${hit ? ' hit' : ''}`}>
            <rect className="strip-edge-hit" x={x(edge) - 14} y="28" width="28" height="58" />
            <rect className="strip-grip" x={x(edge) - 3} y="40" width="6" height="34" rx="3" />
          </g>
        </svg>
        <div className="snap-read">
          <span className="mono">Lean in: {lean0.toFixed(2)}s to {edge.toFixed(2)}s</span>
          <span className={`snapped${hit ? ' on' : ''}`} aria-hidden={!hit}>{hit ? `on “${hit}”` : 'between beats'}</span>
        </div>
      </div>
      <p className="hint">Drag the edge between the two shots. Hold Shift to drag freely.</p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * SOUNDS
 * ───────────────────────────────────────────────────────── */

const ticks = () => {
  for (let i = 0; i < 9; i += 1) setTimeout(() => sound.tick(i / 9), i * (70 - i * 5));
};

const PADS = [
  { name: 'Tick', when: 'A lens mark passing the index', play: ticks },
  { name: 'Detent', when: 'The lens clicking into 1× or the lean', play: () => sound.detent() },
  { name: 'Snap', when: 'A shot’s edge landing on a beat', play: () => sound.snap() },
  { name: 'Fix', when: 'A note’s fix, applied', play: () => sound.fix() },
  { name: 'Latch', when: 'Save', play: () => sound.latch() },
  { name: 'Bells', when: 'A render, finished', play: () => sound.done() },
  { name: 'Undo', when: 'A step back', play: () => sound.undo() },
  { name: 'Redo', when: 'And forward again', play: () => sound.redo() },
];

function Pad({ pad, on }) {
  const [hit, setHit] = useState(0);
  return (
    <button type="button" className="pad" disabled={!on} data-hit={hit % 2 ? 'a' : hit ? 'b' : undefined} onClick={() => {
      pad.play();
      setHit((h) => h + 1);
    }}>
      <span className="pad-name">{pad.name}</span>
      <span className="pad-when">{pad.when}</span>
      <span className="pad-wave" aria-hidden="true"><i /><i /><i /><i /></span>
    </button>
  );
}

export function SoundsDemo() {
  const on = useSoundOn();
  return (
    <div className="demo">
      <div className="panel sounds">
        <div className="sounds-head">
          <SoundToggle big />
          <span className="dim">{on ? 'Press any of them. They are quiet on purpose.' : 'Off until you turn it on, and remembered.'}</span>
        </div>
        <div className="pads">
          {PADS.map((p) => <Pad key={p.name} pad={p} on={on} />)}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * THE REST
 * ───────────────────────────────────────────────────────── */

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const key = (k, shift = false) => (MAC ? `${shift ? '⇧' : ''}⌘${k}` : `Ctrl+${shift ? 'Shift+' : ''}${k}`);

const REST = [
  { title: 'Undo and redo', text: 'Every change, as far back as you like, with a soft swish each way.', keys: [key('Z'), key('Z', true)] },
  { title: 'Save', text: 'Writes the clip’s camera file into the project, where it sits in git. You hear it latch.', keys: [key('S')] },
  { title: 'Render, then compare', text: 'Render makes the MP4 and its poster. Then flip between Preview and Rendered to check one against the other.' },
  { title: 'Your camera stays yours', text: 'Record again after a redesign and the camera you saved in the Studio is kept. Only the take is new.' },
];

export function Rest() {
  return (
    <ul className="rest">
      {REST.map((r) => (
        <li key={r.title}>
          <h3>{r.title}</h3>
          <p>{r.text}</p>
          {r.keys && <p className="keys">{r.keys.map((k) => <kbd key={k}>{k}</kbd>)}</p>}
        </li>
      ))}
    </ul>
  );
}
