/**
 * The small demos beside each idea. Each one is still until the visitor
 * presses its button, and each reads its numbers from the engine where it
 * can: the move is `cameraAt` over a real take's box, the wash is the
 * grammar's colour and strength.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cameraAt, viewBox } from '../../engine/camera/math.mjs';
import { WASH, WASH_ALPHA, SPOT_RADIUS, SPRING, ESTABLISH, LEAN_Z } from '../../engine/camera/grammar.mjs';
import { media, useReducedMotion, useSequence } from './hooks.js';

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
  const reduced = useReducedMotion();
  const { stage, run, running } = useSequence(HAND_TIMING, { reduced });
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
      <div className="demo-foot">
        <button type="button" className="chip-btn" onClick={run} disabled={running}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4L10 6z" fill="currentColor" /></svg>
          {running ? 'Playing' : 'Play the take'}
        </button>
        <button type="button" className="switch" role="switch" aria-checked={cursor} onClick={() => setCursor(!cursor)}>
          <span className="knob" aria-hidden="true" />
          Draw a cursor
        </button>
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

export function LeanDemo({ tour }) {
  const reduced = useReducedMotion();
  const focus = tour.boxes.issue;
  const keys = [
    { t: 0, wide: true },
    { t: ESTABLISH, wide: true },
    { t: ESTABLISH + SPRING, focus },
    { t: ESTABLISH + SPRING + HOLD, focus },
    { t: ESTABLISH + SPRING * 2 + HOLD, wide: true },
    { t: ESTABLISH + SPRING * 2 + HOLD + END_HOLD, wide: true },
  ];
  const T = keys[keys.length - 1].t;
  const [t, setT] = useState(0);
  const [running, setRunning] = useState(false);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const roll = () => {
    cancelAnimationFrame(raf.current);
    if (reduced) {
      setT(ESTABLISH + SPRING + HOLD / 2);
      return;
    }
    const began = performance.now();
    setRunning(true);
    const tick = () => {
      const now = Math.min(T, (performance.now() - began) / 1000);
      setT(now);
      if (now < T) raf.current = requestAnimationFrame(tick);
      else setRunning(false);
    };
    raf.current = requestAnimationFrame(tick);
  };

  const view = cameraAt(keys, t);
  const v = viewBox(1600, 1000, 1600, 1000, view);
  const s = 1600 / v.vw;
  const transform = `scale(${s}) translate(${(-v.x0 / 1600) * 100}%, ${(-v.y0 / 1000) * 100}%)`;

  const W = 240;
  const pts = Array.from({ length: 121 }, (_, i) => {
    const tt = (i / 120) * T;
    return `${((tt / T) * W).toFixed(1)},${(40 - ((cameraAt(keys, tt)[2] - 1) / 0.4) * 34).toFixed(1)}`;
  }).join(' ');
  const px = (t / T) * W;
  const py = 40 - ((view[2] - 1) / 0.4) * 34;

  return (
    <div className="demo">
      <div className="shot-frame">
        <img src={media('still.webp')} alt="Wrenly with an issue open, as the camera sees it" width="1440" height="900" style={{ transform }} />
      </div>
      <div className="curve" aria-hidden="true">
        <svg viewBox={`0 0 ${W} 44`} preserveAspectRatio="none">
          <line x1="0" x2={W} y1="40" y2="40" stroke="var(--line-2)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <polyline points={pts} fill="none" stroke="var(--ink-3)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <line x1={px} x2={px} y1="0" y2="44" stroke="var(--ink)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <circle cx={px} cy={py} r="3" fill="var(--ink)" />
        </svg>
        <span className="lbl">{view[2].toFixed(2)}×</span>
      </div>
      <div className="demo-foot">
        <button type="button" className="chip-btn" onClick={roll} disabled={running}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4L10 6z" fill="currentColor" /></svg>
          {running ? 'Rolling' : 'Roll camera'}
        </button>
        <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>{t.toFixed(2)}s / {T.toFixed(2)}s</span>
      </div>
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
      <div className="shot-frame">
        <img src={media('still.webp')} alt="Wrenly with an issue open" width="1440" height="900" />
        <svg className="overlay" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <path d={`M0 0H${W}V${H}H0z${hole}`} fillRule="evenodd" fill={`rgb(${WASH.join(' ')})`} opacity={look === 'wash' ? WASH_ALPHA : 0} />
          <rect x={x - 8} y={y - 8} width={w + 16} height={h + 16} rx="14" fill="none" stroke="oklch(0.64 0.21 30)" strokeWidth="7" opacity={look === 'ring' ? 1 : 0} />
        </svg>
      </div>
      <div className="demo-foot">
        <div className="seg" role="radiogroup" aria-label="How to point at the change">
          {Object.entries(looks).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={look === k} onClick={() => setLook(k)}>{label}</button>
          ))}
        </div>
        <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>{look === 'wash' ? `${Math.round(WASH_ALPHA * 100)}% · ${SPOT_RADIUS}px` : look === 'ring' ? 'no, thank you' : 'where do I look?'}</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * THE STUDIO
 *
 * The tour's own storyboard, shot by shot, each with the frame the render
 * shows in the middle of it.
 * ───────────────────────────────────────────────────────── */

const say = (what) => what.replace(/ list$/, ' the list').replace(/ issue$/, ' the issue');

export function StudioDemo({ tour }) {
  const board = tour.storyboard;
  const first = board.find((s) => s.kind === 'hold' && s.z > 1 && s.what.includes('issue')) ?? board[0];
  const [pick, setPick] = useState(first.n);
  const shot = board.find((s) => s.n === pick);
  const list = useRef(null);
  /* Show the picked shot inside the list without scrolling the page. */
  useLayoutEffect(() => {
    const el = list.current?.querySelector('[aria-pressed="true"]');
    if (!el) return;
    const l = list.current;
    if (el.offsetTop < l.scrollTop || el.offsetTop + el.offsetHeight > l.scrollTop + l.clientHeight) l.scrollTop = el.offsetTop - l.clientHeight / 2 + el.offsetHeight / 2;
  }, [pick]);
  return (
    <div className="demo">
      <div className="board">
        <div className="board-frame">
          <img src={media(shot.file)} alt={`Shot ${shot.n}: ${say(shot.what)}`} width="480" height="300" />
        </div>
        <div className="shots" ref={list} role="group" aria-label="The clip's shots">
          {board.map((s) => (
            <button key={s.n} type="button" aria-pressed={s.n === pick} onClick={() => setPick(s.n)}>
              <span className="n">{String(s.n).padStart(2, '0')}</span>
              <span>{say(s.what)}{s.kind === 'lean' ? `, ${LEAN_Z}×` : ''}</span>
              <span className="d">{(s.t1 - s.t0).toFixed(2)}s</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * AGENTS
 *
 *    0ms   press "Run it": the ask
 *  600ms   the agent adds the product
 * 1400ms   it inspects the page
 * 2100ms   it writes the scenario
 * 2800ms   it records the take
 * 3700ms   the take and its camera land
 * 4400ms   it hands over the Studio
 * ───────────────────────────────────────────────────────── */

const AGENT_TIMING = [600, 1000, 1400, 1800, 2100, 2800, 3700, 3900, 4400];

const LINES = [
  { who: 'agent', cmd: 'dolly init wrenly --from ~/code/wrenly' },
  { out: 'found: node serve.mjs on port 5190' },
  { who: 'agent', cmd: 'dolly inspect wrenly /' },
  { out: '38 controls with their boxes, and a screenshot' },
  { who: 'agent', cmd: 'writes scenarios/wrenly-done.mjs' },
  { who: 'agent', cmd: 'dolly record wrenly wrenly-done' },
  { out: 'recorded masters/wrenly/wrenly-done.mp4 (2880x1800, 9.63s)' },
  { out: 'directed cameras/wrenly-done.camera.json' },
  { who: 'agent', cmd: 'Your turn: dolly storyboard wrenly wrenly-done', done: true },
];

export function AgentDemo() {
  const reduced = useReducedMotion();
  const { stage, run, running } = useSequence(AGENT_TIMING, { reduced });
  const [asked, setAsked] = useState(false);
  const go = () => {
    setAsked(true);
    run();
  };
  return (
    <div className="demo">
      <div className="term" aria-live="polite">
        {asked ? (
          <>
            <p className="you"><span className="who">you</span><span className="txt">Make a Dolly clip of an issue being marked done in Wrenly.</span></p>
            {LINES.slice(0, stage).map((l, i) => (
              <p key={i} className={l.out ? 'out' : l.done ? 'done' : ''}>
                <span className="who">{l.who ?? ''}</span>
                <span className="txt">{l.cmd ?? l.out}</span>
              </p>
            ))}
            {running && <p><span className="who" /><span className="caret" /></p>}
          </>
        ) : (
          <p className="out"><span className="who">you</span><span className="txt"><span className="caret" /></span></p>
        )}
      </div>
      <div className="demo-foot">
        <button type="button" className="chip-btn" onClick={go} disabled={running}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4L10 6z" fill="currentColor" /></svg>
          {running ? 'Working' : asked ? 'Run it again' : 'Ask the agent'}
        </button>
      </div>
    </div>
  );
}
