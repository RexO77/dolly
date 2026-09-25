/**
 * The small demos beside each idea about the camera. Each is still until
 * the visitor presses its button, and each reads its numbers from the
 * engine where it can: the move is `cameraAt` over a real frame of the take,
 * the wash is the grammar's colour and strength, the card is `cardAt`.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cameraAt, viewBox } from '../../engine/camera/math.mjs';
import { WASH, WASH_ALPHA, SPOT_RADIUS, SPRING, ESTABLISH } from '../../engine/camera/grammar.mjs';
import { resolveFrame } from '../../engine/camera/card.mjs';
import { drawShot } from './camera.js';
import { media } from './hooks.js';
import { Seg, Switch } from './parts.jsx';
import { Player, clock, scrubLine, useClock } from './Player.jsx';
import { Backdrops } from './Stage.jsx';

/** How many of `times` (ms) have passed at `t` seconds: a sequence's stage, from a clock. */
const stageAt = (times, t) => times.filter((ms) => ms <= t * 1000 + 1e-6).length;

/* ─────────────────────────────────────────────────────────
 * NO CURSOR
 *
 *    0ms   press "Play": a settings card, still
 *  450ms   the hand arrives on "Mentions": the row lights up
 * 1050ms   the switch flips on
 * 1750ms   the hand moves to Save: it lights up
 * 2250ms   press: Save dips
 * 2400ms   release: "Saved" fades in
 * 3600ms   the hand rests: nothing lit
 * ───────────────────────────────────────────────────────── */

const HAND_TIMING = [450, 1050, 1750, 2250, 2400, 3600];
const HAND_T = 3.9; // the take's length, seconds

const ROWS = [
  { name: 'Weekly digest', sub: 'Mondays at 9:00', on: true },
  { name: 'Mentions', sub: 'When someone names you', on: false },
  { name: 'Due date reminders', sub: 'A day before', on: false },
];

function Arrow() {
  return (
    <svg viewBox="0 0 18 22" width="18" height="22" aria-hidden="true">
      <path d="M1.5 1.5v16.2l4.3-4.1 2.9 6.6 2.7-1.2-2.8-6.4h6z" fill="#111" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

export function NoCursorDemo() {
  const c = useClock(HAND_T);
  const stage = stageAt(HAND_TIMING, c.t);
  const [cursor, setCursor] = useState(false);
  const box = useRef(null);
  const sw = useRef(null);
  const save = useRef(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const flipped = stage >= 2;
  const rowHover = stage >= 1 && stage < 3;
  const saveHover = stage >= 3 && stage < 6;
  const pressed = stage === 4;
  const saved = stage >= 5;

  /* Where a cursor would be, if Dolly drew one: over whatever the hand is on. */
  useLayoutEffect(() => {
    const b = box.current.getBoundingClientRect();
    const at = (el, dx = 0, dy = 0) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - b.left + r.width / 2 + dx, y: r.top - b.top + r.height / 2 + dy };
    };
    if (stage === 0) setPos({ x: b.width * 0.62, y: b.height * 0.2 });
    else if (stage < 3) setPos(at(sw.current, -2, 2));
    else if (stage < 6) setPos(at(save.current, 4, 3));
    else setPos(at(save.current, 18, 22));
  }, [stage]);

  return (
    <div className="demo">
      <Player clock={c} label="the take" readout={clock(c.t)} marks={HAND_TIMING.map((ms) => ms / 1000)}>
        <div className="screen">
          <div className="mini" ref={box} aria-label="A settings card that changes on its own, with no cursor" role="img">
            <div className="mini-head"><b>Notifications</b><span>Wrenly</span></div>
            {ROWS.map((r, i) => (
              <div key={r.name} className={`mini-row${i === 1 && rowHover ? ' is-hover' : ''}`}>
                <span>{r.name}<small>{r.sub}</small></span>
                <span ref={i === 1 ? sw : undefined} className={`mini-switch${r.on || (i === 1 && flipped) ? ' on' : ''}`} />
              </div>
            ))}
            <div className="mini-foot">
              <span className={`mini-saved${saved ? ' on' : ''}`}>Saved</span>
              <span ref={save} className={`mini-save${saveHover ? ' is-hover' : ''}${pressed ? ' is-press' : ''}`}>Save</span>
            </div>
            {cursor && (
              <span className="fake-cursor" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}><Arrow /></span>
            )}
          </div>
        </div>
      </Player>
      <div className="demo-foot">
        <Switch on={cursor} onChange={setCursor}>Draw a cursor</Switch>
        <span className="mono dim">{cursor ? 'your eye follows the arrow' : 'your eye follows the change'}</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * LEAN IN, HOLD, PULL BACK
 *
 * One lean from the grammar, over a real frame of the take:
 *
 *   0.00s   wide: take it in (ESTABLISH)
 *   0.80s   lean in on the issue, 1 → 1.35 on the spring (SPRING)
 *   2.00s   hold: this is where the change would play
 *   3.40s   pull back to wide (SPRING)
 *   4.60s   wide, held
 * ───────────────────────────────────────────────────────── */

const HOLD = 1.4; // the demo's hold, seconds
const END_HOLD = 0.6; // the wide hold after the pull back

/** The demo lean's keyframes: one lean on `focus`, held, and pulled back. */
export function leanKeys(focus) {
  return [
    { t: 0, wide: true },
    { t: ESTABLISH, wide: true },
    { t: ESTABLISH + SPRING, focus },
    { t: ESTABLISH + SPRING + HOLD, focus },
    { t: ESTABLISH + SPRING * 2 + HOLD, wide: true },
    { t: ESTABLISH + SPRING * 2 + HOLD + END_HOLD, wide: true },
  ];
}

export function LeanDemo({ tour }) {
  const keys = leanKeys(tour.boxes.issue);
  const T = keys[keys.length - 1].t;
  const c = useClock(T, { still: ESTABLISH + SPRING + HOLD / 2 });
  const view = cameraAt(keys, c.t);
  const v = viewBox(1600, 1000, 1600, 1000, view);
  const s = 1600 / v.vw;
  const transform = `scale(${s}) translate(${(-v.x0 / 1600) * 100}%, ${(-v.y0 / 1000) * 100}%)`;
  const level = (z) => (z - 1) / 0.4;
  return (
    <div className="demo">
      <Player clock={c} label="the lean" line={scrubLine((t) => level(cameraAt(keys, t)[2]), T)} level={level(view[2])} readout={<><b>{view[2].toFixed(2)}×</b> {clock(c.t)}</>}>
        <div className="screen">
          <div className="shot-frame">
            <img src={media('still.webp')} alt="Wrenly with an issue open, as the camera sees it" width="1440" height="900" style={{ transform }} />
          </div>
        </div>
      </Player>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * THE WASH
 *
 * The grammar's spotlight over a real frame: the warm ground at 72% over
 * everything but the subject, corners rounded to 6px. The ring is there
 * so you can see why not.
 * ───────────────────────────────────────────────────────── */

export function WashDemo({ tour }) {
  const [look, setLook] = useState('wash');
  const { width: W, height: H } = tour.viewport;
  const b = tour.boxes.issue;
  const x = b.x * W;
  const y = b.y * H;
  const w = b.w * W;
  const h = b.h * H;
  const r = SPOT_RADIUS;
  const hole = `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
  const looks = { wash: 'Wash', ring: 'Ring', none: 'Nothing' };
  return (
    <div className="demo">
      <div className="screen">
        <div className="shot-frame">
          <img src={media('still.webp')} alt="Wrenly with an issue open" width="1440" height="900" />
          <svg className="overlay" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
            <path d={`M0 0H${W}V${H}H0z${hole}`} fillRule="evenodd" fill={`rgb(${WASH.join(' ')})`} opacity={look === 'wash' ? WASH_ALPHA : 0} />
            <rect x={x - 8} y={y - 8} width={w + 16} height={h + 16} rx="14" fill="none" stroke="oklch(0.64 0.21 30)" strokeWidth="7" opacity={look === 'ring' ? 1 : 0} />
          </svg>
        </div>
      </div>
      <div className="demo-foot">
        <Seg label="How to point at the change" value={look} onChange={setLook} options={looks} />
        <span className="mono dim">{look === 'wash' ? `${Math.round(WASH_ALPHA * 100)}% · ${SPOT_RADIUS}px corners` : look === 'ring' ? 'no, thank you' : 'where do I look?'}</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * THE FRAME
 *
 * The same lean, with the clip as a card on a background. While the camera
 * is wide the card sits back at 88%; as it leans in the card grows to fill
 * the clip, on the camera's own curve, and settles back as it pulls out.
 * Drawn with cardAt, the geometry the renderer uses.
 * ───────────────────────────────────────────────────────── */

export function FrameDemo({ tour }) {
  const canvas = useRef(null);
  const image = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [background, setBackground] = useState('dusk');
  const [windowed, setWindowed] = useState(true);
  const [push, setPush] = useState(true);
  const keys = leanKeys(tour.boxes.issue);
  const T = keys[keys.length - 1].t;
  const c = useClock(T, { still: ESTABLISH + SPRING + HOLD / 2 });
  const t = c.t;
  const look = resolveFrame({ background, window: windowed, push });

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      image.current = img;
      setLoaded(true);
    };
    img.src = media('still.webp');
  }, []);

  useLayoutEffect(() => {
    const c = canvas.current;
    const w = Math.min(1440, Math.round(c.clientWidth * devicePixelRatio));
    const h = Math.round((w * 10) / 16);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    if (!image.current) return;
    drawShot(ctx, image.current, { SW: 1440, SH: 900, spec: { camera: keys, spots: [] }, look, t, OW: w, OH: h, css: 1 });
  });

  const z = cameraAt(keys, t)[2];
  return (
    <div className="demo">
      <Player clock={c} label="the framed lean" line={scrubLine((tt) => (cameraAt(keys, tt)[2] - 1) / 0.4, T)} level={(z - 1) / 0.4} readout={<><b>{z.toFixed(2)}×</b> {clock(t)}</>}>
        <div className="screen">
          <canvas ref={canvas} className="frame-canvas" role="img" aria-label={`Wrenly as a card on the ${background} background${windowed ? ', in a browser window' : ''}`} data-loaded={loaded || undefined} />
        </div>
      </Player>
      <div className="demo-foot wrap">
        <Backdrops value={background} onChange={setBackground} />
        <div className="demo-foot-row">
          <Switch on={windowed} onChange={setWindowed}>Window</Switch>
          <Switch on={push} onChange={setPush}>Grow to fill</Switch>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * AGENTS
 *
 * The whole exchange is on screen from the start, so it reads without a
 * press. "Play it" replays it line by line:
 *
 *    0ms   the ask
 *  600ms   the agent adds the product
 * 1400ms   it inspects the page
 * 2100ms   it writes the scenario
 * 2800ms   it records the take
 * 3700ms   the take and its camera land
 * 4400ms   it hands over the Studio
 * ───────────────────────────────────────────────────────── */

const AGENT_TIMING = [300, 900, 1300, 1700, 2100, 2400, 3100, 4000, 4200, 4700];
const AGENT_T = 5.2;

const LINES = [
  { who: 'you', ask: 'Make a Dolly clip of an issue being marked done in Wrenly.' },
  { who: 'agent', cmd: 'dolly init wrenly --from ~/code/wrenly' },
  { out: 'found: node serve.mjs on port 5190' },
  { who: 'agent', cmd: 'dolly inspect wrenly /' },
  { out: '38 controls with their boxes, and a screenshot' },
  { who: 'agent', cmd: 'writes scenarios/wrenly-done.mjs' },
  { who: 'agent', cmd: 'dolly record wrenly wrenly-done' },
  { out: 'recorded masters/wrenly/wrenly-done.mp4 (2880x1800, 9.63s)' },
  { out: 'directed cameras/wrenly-done.camera.json' },
  { who: 'agent', cmd: 'Your turn: dolly studio wrenly wrenly-done', done: true },
];

export function AgentDemo() {
  const c = useClock(AGENT_T, { initial: AGENT_T });
  const stage = stageAt(AGENT_TIMING, c.t);
  return (
    <div className="demo">
      <Player clock={c} label="the agent's session" readout={clock(c.t)} marks={AGENT_TIMING.map((ms) => ms / 1000)}>
        <div className="term" aria-live={c.playing ? 'polite' : 'off'}>
          {LINES.map((l, i) => (
            <p key={i} className={[l.ask && 'you', l.out && 'out', l.done && 'done', i >= stage && 'later'].filter(Boolean).join(' ')}>
              <span className="who">{l.who ?? ''}</span>
              <span className="txt">{l.ask ?? l.cmd ?? l.out}</span>
            </p>
          ))}
        </div>
      </Player>
    </div>
  );
}
