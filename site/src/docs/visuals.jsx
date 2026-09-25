/**
 * The live pieces the docs mount beside their text. The drawings (the
 * pipeline, the activity line, why a lean stays sharp) are plain SVG in the
 * site's tokens; the rest are the landing page's own demos, run on a real
 * frame of the take with the engine's camera maths.
 */
import { useEffect, useState } from 'react';
import { cameraAt, viewBox, spotAlpha } from '../../../engine/camera/math.mjs';
import { WASH, WASH_ALPHA, SPOT_RADIUS, SPRING, ESTABLISH, LEAN_Z } from '../../../engine/camera/grammar.mjs';
import { AgentDemo, FrameDemo, WashDemo, leanKeys } from '../Demos.jsx';
import { EditorFigure, HomeFigure, LensDemo, NotesDemo, SnapDemo, SoundsDemo } from '../StudioDemos.jsx';
import { Player, clock, scrubLine, useClock } from '../Player.jsx';
import { media } from '../hooks.js';

/* ─────────────────────────────────────────────────────────
 * THE PIPELINE
 *
 * Every arrow is a command: it reads the file on its left and writes the
 * one on its right. Wide on a desktop, tall on a phone.
 * ───────────────────────────────────────────────────────── */

const NODES = [
  ['Your product', 'running in Chrome'],
  ['Master', 'raw video + take file'],
  ['Camera', 'where to look, when'],
  ['Clip', '.mp4 + poster'],
  ['Your site', 'the deliver folder'],
];
const VERBS = ['record', 'direct', 'render', 'deliver'];

function Arrowhead({ id }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" className="dg-head" /></marker>
    </defs>
  );
}

export function Pipeline() {
  return (
    <figure className="dg">
      <svg className="dg-wide" viewBox="0 0 760 190" role="img" aria-label="Your product is recorded into a master, the master is directed into a camera, the camera is rendered into a clip, and the clip is delivered to your site. The Studio edits the camera.">
        <Arrowhead id="pipe-a" />
        {NODES.map(([name, sub], i) => (
          <g key={name}>
            <rect className={i === 4 ? 'dg-soft' : 'dg-node'} x={i * 160} y="22" width="118" height="64" rx="9" />
            <text className="dg-name" x={i * 160 + 59} y="49" textAnchor="middle">{name}</text>
            <text className="dg-sub" x={i * 160 + 59} y="68" textAnchor="middle">{sub}</text>
          </g>
        ))}
        {VERBS.map((v, i) => (
          <g key={v}>
            <path className="dg-arrow" d={`M${i * 160 + 121},54 H${i * 160 + 157}`} markerEnd="url(#pipe-a)" />
            <text className="dg-verb" x={i * 160 + 139} y="13" textAnchor="middle">{v}</text>
          </g>
        ))}
        <path className="dg-loop" d="M350,88 C338,142 420,142 408,88" markerEnd="url(#pipe-a)" />
        <text className="dg-name" x="379" y="160" textAnchor="middle">The Studio</text>
        <text className="dg-sub" x="379" y="178" textAnchor="middle">watch, adjust, Save, Render</text>
        <text className="dg-faint" x="59" y="112" textAnchor="middle">you write a scenario:</text>
        <text className="dg-faint" x="59" y="128" textAnchor="middle">what the hand does</text>
      </svg>
      <svg className="dg-tall" viewBox="0 0 320 548" role="img" aria-label="Your product is recorded into a master, directed into a camera, rendered into a clip, and delivered to your site. The Studio edits the camera.">
        <Arrowhead id="pipe-b" />
        {NODES.map(([name, sub], i) => (
          <g key={name}>
            <rect className={i === 4 ? 'dg-soft' : 'dg-node'} x="30" y={i * 120} width="180" height="60" rx="9" />
            <text className="dg-name" x="120" y={i * 120 + 26} textAnchor="middle">{name}</text>
            <text className="dg-sub" x="120" y={i * 120 + 45} textAnchor="middle">{sub}</text>
          </g>
        ))}
        {VERBS.map((v, i) => (
          <g key={v}>
            <path className="dg-arrow" d={`M120,${i * 120 + 62} V${i * 120 + 117}`} markerEnd="url(#pipe-b)" />
            <text className="dg-verb" x="132" y={i * 120 + 95}>{v}</text>
          </g>
        ))}
        <path className="dg-loop" d="M212,252 C262,246 262,294 212,288" markerEnd="url(#pipe-b)" />
        <text className="dg-name" x="262" y="316" textAnchor="middle">The Studio</text>
        <text className="dg-sub" x="262" y="333" textAnchor="middle">watch, adjust,</text>
        <text className="dg-sub" x="262" y="349" textAnchor="middle">Save, Render</text>
      </svg>
      <figcaption>Every arrow is a command. Each one reads the file on its left and writes the file on its right.</figcaption>
    </figure>
  );
}

/* ─────────────────────────────────────────────────────────
 * THE ACTIVITY LINE
 * ───────────────────────────────────────────────────────── */

const CAMERA_ROW = [
  [0, 120, 'wide', true],
  [122, 140, 'lean in'],
  [264, 200, 'hold still while it changes', true],
  [466, 110, 'pull back'],
  [578, 102, 'hold wide', true],
];

export function Activity() {
  return (
    <figure className="dg">
      <svg viewBox="0 0 680 210" role="img" aria-label="The activity line is flat, then rises where the product changes. The script's beat lands slightly before the picture changes, and sync moves the beat onto the real change. The camera leans in before the change, holds still through it, and pulls back after.">
        <Arrowhead id="act-a" />
        <text className="dg-name" x="0" y="14">Activity</text>
        <text className="dg-sub" x="0" y="30">how much each frame differs from the one before</text>
        <line className="dg-rule" x1="0" y1="110" x2="680" y2="110" />
        <path className="dg-line" d="M0,108 L60,107 L110,108 L150,104 L170,107 L240,108 L300,108 L318,106 L326,96 L334,62 L342,48 L352,56 L364,72 L380,86 L400,98 L420,104 L440,107 L500,108 L560,107 L600,108 L680,108" />
        <line className="dg-dash" x1="312" y1="40" x2="312" y2="112" />
        <line className="dg-mark" x1="326" y1="40" x2="326" y2="112" />
        <text className="dg-sub" x="306" y="54" textAnchor="end">script’s beat</text>
        <text className="dg-text" x="334" y="40">picture changes</text>
        <path className="dg-arrow" d="M314,120 H323" markerEnd="url(#act-a)" />
        <text className="dg-verb" x="300" y="134" textAnchor="middle">sync</text>
        <text className="dg-name" x="0" y="160">Camera</text>
        {CAMERA_ROW.map(([x, w, label, soft]) => (
          <g key={label}>
            <rect className={soft ? 'dg-soft' : 'dg-node'} x={x} y="170" width={w} height="26" rx="5" />
            <text className="dg-text" x={x + 8} y="187">{label}</text>
          </g>
        ))}
      </svg>
      <figcaption>The Studio draws the same activity line under its film strip. A camera move that crosses a peak gets a note.</figcaption>
    </figure>
  );
}

/* ─────────────────────────────────────────────────────────
 * WHY A LEAN STAYS SHARP, drawn to scale at one tenth size
 * ───────────────────────────────────────────────────────── */

export function Sharp() {
  const crop = Math.round(2880 / LEAN_Z);
  return (
    <figure className="dg">
      <svg viewBox="0 0 620 232" role="img" aria-label={`The master is 2880 pixels wide. A lean at ${LEAN_Z} crops it to ${crop} pixels wide. The delivered clip is 1920 wide, smaller than the crop, so every delivered pixel comes from real recorded pixels.`}>
        <Arrowhead id="sharp-a" />
        <text className="dg-name" x="0" y="12">Master <tspan className="dg-verb">2880 × 1800</tspan></text>
        <rect className="dg-soft" x="0" y="22" width="288" height="180" rx="5" />
        <rect className="dg-crop" x={288 - crop / 10} y="49" width={crop / 10} height={crop / 16} rx="3" />
        <text className="dg-text" x={296 - crop / 10} y="70">a lean at {LEAN_Z}×</text>
        <text className="dg-verb" x={296 - crop / 10} y="86">{crop} × {Math.round(crop / 1.6)}</text>
        <path className="dg-arrow" d="M300,115 H352" markerEnd="url(#sharp-a)" />
        <text className="dg-sub" x="326" y="106" textAnchor="middle">scaled down</text>
        <text className="dg-name" x="364" y="46">Delivered <tspan className="dg-verb">1920 × 1200</tspan></text>
        <rect className="dg-node" x="364" y="55" width="192" height="120" rx="4" />
        <text className="dg-sub" x="460" y="112" textAnchor="middle">{crop} is more than 1920:</text>
        <text className="dg-sub" x="460" y="128" textAnchor="middle">nothing is blown up</text>
        <text className="dg-faint" x="0" y="224">Drawn to scale, at one tenth size.</text>
      </svg>
    </figure>
  );
}

/* ─────────────────────────────────────────────────────────
 * THE GRAMMAR, PLAYING
 *
 * One clip's worth of the grammar over a real frame of the take:
 *
 *   0.00s   establish: wide, held
 *   0.80s   lean in to 1.35 on the spring, the wash fading in as it settles
 *   2.00s   hold still: the change would play here
 *   3.40s   pull back to wide, the wash fading out
 *   4.60s   hold wide on the result
 * ───────────────────────────────────────────────────────── */

const HOLD = 1.4;

export function Grammar({ tour }) {
  const box = tour.boxes.issue;
  const keys = leanKeys(box);
  const T = keys[keys.length - 1].t;
  const c = useClock(T, { still: ESTABLISH + SPRING + HOLD / 2 });
  const spot = { ...box, in: ESTABLISH + SPRING - 0.3, out: ESTABLISH + SPRING + HOLD, fade: 0.45 };
  const phases = [
    ['Establish', 0, ESTABLISH],
    ['Lean in', ESTABLISH, ESTABLISH + SPRING],
    ['Hold still', ESTABLISH + SPRING, ESTABLISH + SPRING + HOLD],
    ['Pull back', ESTABLISH + SPRING + HOLD, ESTABLISH + SPRING * 2 + HOLD],
    ['Hold wide', ESTABLISH + SPRING * 2 + HOLD, T],
  ];
  const view = cameraAt(keys, c.t);
  const W = 1440;
  const H = 900;
  const v = viewBox(W, H, W, H, view);
  const s = W / v.vw;
  const r = SPOT_RADIUS;
  const [x, y, w, h] = [box.x * W, box.y * H, box.w * W, box.h * H];
  const hole = `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
  const level = (z) => (z - 1) / 0.4;
  const now = phases.findIndex(([, a, b]) => c.t >= a && c.t < b);
  return (
    <div className="demo">
      <Player clock={c} label="the grammar" line={scrubLine((t) => level(cameraAt(keys, t)[2]), T)} level={level(view[2])} marks={phases.slice(1).map(([, a]) => a)} readout={<><b>{view[2].toFixed(2)}×</b> {clock(c.t)}</>}>
        <div className="screen">
          <div className="shot-frame">
            <div className="cam" style={{ transform: `scale(${s}) translate(${(-v.x0 / W) * 100}%, ${(-v.y0 / H) * 100}%)` }}>
              <img src={media('still.webp')} alt="Wrenly with an issue open, as the camera sees it" width="1440" height="900" />
              <svg className="overlay" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
                <path d={`M0 0H${W}V${H}H0z${hole}`} fillRule="evenodd" fill={`rgb(${WASH.join(' ')})`} opacity={WASH_ALPHA * spotAlpha(spot, c.t)} />
              </svg>
            </div>
          </div>
        </div>
      </Player>
      <ol className="phases" aria-label="The grammar's steps">
        {phases.map(([label], i) => <li key={label} aria-current={i === (now < 0 ? phases.length - 1 : now) ? 'step' : undefined}>{label}</li>)}
      </ol>
    </div>
  );
}

/* ── The registry: what each placeholder mounts, and whether it needs the take's numbers ── */

export const VISUALS = {
  pipeline: { Component: Pipeline },
  activity: { Component: Activity },
  sharp: { Component: Sharp },
  grammar: { Component: Grammar, tour: true },
  wash: { Component: WashDemo, tour: true },
  frame: { Component: FrameDemo, tour: true },
  lens: { Component: LensDemo, tour: true },
  notes: { Component: NotesDemo, tour: true },
  snap: { Component: SnapDemo, tour: true },
  sounds: { Component: SoundsDemo },
  agent: { Component: AgentDemo },
  'studio-editor': { Component: EditorFigure },
  'studio-home': { Component: HomeFigure },
};

let tourPromise = null;
const loadTour = () => (tourPromise ??= fetch(media('tour.json')).then((r) => r.json()));

/** One placeholder's visual, once the take's numbers (if it needs them) have loaded. */
export function Visual({ name }) {
  const entry = VISUALS[name];
  const [tour, setTour] = useState(null);
  useEffect(() => {
    if (entry?.tour) loadTour().then(setTour, () => {});
  }, [entry]);
  if (!entry) return null;
  const { Component } = entry;
  if (entry.tour && !tour) return <div className="demo"><div className="screen"><div className="shot-frame" /></div></div>;
  const sharpMax = tour ? tour.master.width / tour.output.width : 1.5;
  return <Component tour={tour} sharpMax={sharpMax} />;
}
