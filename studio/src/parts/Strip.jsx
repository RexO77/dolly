/**
 * The film strip: the clip's shots in time. Click a shot to select it, drag
 * the edge between two shots to retime them (edges snap to the take's beats
 * and to a lean's settle point before each; Shift drags freely), drag in the
 * ruler to scrub. Beneath, what the product is doing: where it changes, and
 * where a move runs through a change. A drag that lands on a beat lights
 * the beat up, so the snap is felt as well as seen.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { useVersion, useTime, cx, fmt } from '../hooks.js';
import { CHANGING, beatWords, shotTitle } from '../model/clip.js';

const H = 96;
const RULER = 18;
const CELL_Y = 24;
const CELL_H = 38;
const ACT_Y = 70;
const ACT_H = 14;
const WASH_Y = 90;
const SNAP_PX = 6;
/** Cut a label to the room a cell has, at about 6px a character. */
const fit = (text, px) => (text.length * 6 <= px ? text : `${text.slice(0, Math.max(1, Math.floor(px / 6) - 1))}…`);

export function Strip({ clip, transport, selectedId, onSelect }) {
  const wrap = useRef(null);
  const [W, setW] = useState(800);
  const [hover, setHover] = useState(null);
  const [snapped, setSnapped] = useState(null);
  useVersion(clip);
  const t = useTime(transport);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const len = clip.length;
  const pad = 8;
  const x = (tt) => pad + (tt / len) * (W - pad * 2);
  const toT = (clientX) => {
    const r = wrap.current.getBoundingClientRect();
    return Math.max(0, Math.min(len, ((clientX - r.left - pad) / (r.width - pad * 2)) * len));
  };
  const shots = clip.shots;
  const snaps = clip.snapTimes();
  const snap = (tt, free) => {
    if (free) return { t: tt, hit: null };
    let best = null;
    for (const s of snaps) {
      const d = Math.abs(x(s.t) - x(tt));
      if (d < SNAP_PX && (!best || d < best.d)) best = { d, ...s };
    }
    return best ? { t: best.t, hit: best } : { t: tt, hit: null };
  };

  const drag = useRef(null);
  const down = (e) => {
    const role = e.target.dataset.role;
    wrap.current.setPointerCapture(e.pointerId);
    if (role === 'edge') {
      drag.current = { kind: 'edge', id: Number(e.target.dataset.id) };
    } else if (role === 'cell') {
      const shot = shots[Number(e.target.dataset.n)];
      onSelect(shot.id);
      drag.current = { kind: 'cell', startX: e.clientX, shot };
    } else {
      transport.pause();
      drag.current = { kind: 'scrub' };
      transport.seek(toT(e.clientX));
    }
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) {
      const r = wrap.current.getBoundingClientRect();
      setHover(e.clientY - r.top < RULER ? toT(e.clientX) : null);
      return;
    }
    if (d.kind === 'scrub') return transport.seek(toT(e.clientX));
    if (d.kind === 'edge') {
      const s = snap(toT(e.clientX), e.shiftKey);
      setSnapped(s.hit);
      clip.setKeyTime(d.id, s.t, { live: true });
    }
    if (d.kind === 'cell' && Math.abs(e.clientX - d.startX) > 3 && d.shot.kind !== 'hold') {
      d.moved = true;
      const s = snap(d.shot.t1 + (toT(e.clientX) - toT(d.startX)), e.shiftKey);
      setSnapped(s.hit);
      clip.shiftShot(d.shot, s.t - clip.shotById(d.shot.id).t1, { live: true });
    }
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    setSnapped(null);
    if (!d) return;
    if (d.kind === 'edge' || d.moved) clip.settle();
    else if (d.kind === 'cell') {
      transport.pause();
      transport.seek(d.shot.kind === 'hold' ? d.shot.t0 + Math.min(0.4, (d.shot.t1 - d.shot.t0) / 2) : d.shot.t1 - 0.01);
    }
  };

  /* Activity as one path; conflicts (a move running through a change) as marks. */
  const { values, fps } = clip.activity;
  const step = Math.max(1, Math.floor(values.length / Math.max(1, W - pad * 2)));
  let act = '';
  const clashes = [];
  for (let i = 0; i < values.length; i += step) {
    const tt = i / fps;
    act += `${act ? 'L' : 'M'}${x(tt).toFixed(1)},${(ACT_Y + ACT_H - values[i] * ACT_H).toFixed(1)}`;
    if (values[i] > CHANGING && shots.some((s) => s.kind !== 'hold' && tt > clip.masterTime(s.t0) && tt < clip.masterTime(s.t1))) clashes.push(tt);
  }

  const ticks = [];
  const every = len > 40 ? 5 : len > 16 ? 2 : 1;
  for (let s = 0; s <= len + 1e-6; s += every) {
    ticks.push(<line key={`k${s}`} className="strip-tick" x1={x(s)} x2={x(s)} y1={RULER - 5} y2={RULER} />);
    ticks.push(<text key={`n${s}`} className="strip-tick-label" x={x(s) + 3} y={RULER - 7}>{s}s</text>);
  }

  return (
    <div className="strip" ref={wrap} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={() => !drag.current && setHover(null)}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Film strip: shots in time, the product's activity beneath">
        <rect className="strip-ruler" x={0} y={0} width={W} height={RULER} data-role="ruler" />
        {ticks}
        {shots.map((s, n) => {
          const w = Math.max(1, x(s.t1) - x(s.t0) - 2);
          return (
            <g key={s.id} className={cx('strip-cell', `strip-${s.kind}`, s.id === selectedId && 'on')}>
              <rect x={x(s.t0) + 1} y={CELL_Y} width={w} height={CELL_H} rx={5} data-role="cell" data-n={n} />
              {w > 18 && <text className="strip-cell-n" x={x(s.t0) + 8} y={CELL_Y + 15}>{n + 1}</text>}
              {w > 56 && <text className="strip-cell-what" x={x(s.t0) + 8} y={CELL_Y + 29}>{fit(shotTitle(s), w - 16)}</text>}
            </g>
          );
        })}
        {clip.beats.map((b) => (
          <g key={b.label} className={cx('strip-beat', snapped?.t === b.t && 'hit')}>
            <line x1={x(b.t)} x2={x(b.t)} y1={CELL_Y - 4} y2={CELL_Y + CELL_H + 4} />
            <circle className="strip-beat-dot" cx={x(b.t)} cy={CELL_Y - 5} r={2.5} />
            <title>{`${beatWords(b.label)} at ${fmt(b.t)}s`}</title>
          </g>
        ))}
        {/* Edges between shots: the keyframes, dragged to retime. The first and last stay put. */}
        {shots.slice(0, -1).map((s) => (
          <g key={`e${s.id}`} className="strip-edge">
            <rect x={x(s.t1) - 6} y={CELL_Y - 2} width={12} height={CELL_H + 4} data-role="edge" data-id={s.id} />
            <line x1={x(s.t1)} x2={x(s.t1)} y1={CELL_Y + 8} y2={CELL_Y + CELL_H - 8} />
          </g>
        ))}
        <path className="strip-activity" d={act} />
        {clashes.map((c, i) => <rect key={i} className="strip-clash" x={x(c) - 1} y={ACT_Y} width={Math.max(2, x(step / fps) - x(0))} height={ACT_H} />)}
        {clip.spec.spots.map((sp, i) => {
          const out = sp.out ?? len;
          const fo = sp.out === undefined ? 0 : sp.fadeOut ?? (sp.fade ?? 0.5) * 0.7;
          return <polygon key={i} className="strip-wash" points={`${x(sp.in)},${WASH_Y + 3} ${x(sp.in + (sp.fade ?? 0.5))},${WASH_Y - 3} ${x(out)},${WASH_Y - 3} ${x(Math.min(len, out + fo))},${WASH_Y + 3}`}><title>{`Wash ${i + 1}`}</title></polygon>;
        })}
        {snapped && <line className="strip-snap" x1={x(snapped.t)} x2={x(snapped.t)} y1={RULER} y2={H} />}
        {hover !== null && <line className="strip-hover" x1={x(hover)} x2={x(hover)} y1={0} y2={H} />}
        <line className="strip-head" x1={x(t)} x2={x(t)} y1={0} y2={H} />
        <rect className="strip-head-cap" x={x(t) - 4} y={0} width={8} height={5} rx={1.5} />
      </svg>
      <div className="strip-lanes">
        <span><i />Activity: where the product changes</span>
        {clip.beats.length > 0 && <span className="lane-beat"><i />Beat: a moment the take marked</span>}
        {clashes.length > 0 && <span className="lane-clash"><i />A move during a change</span>}
        <span className={cx('lane-snap', snapped && 'on')} aria-live="polite">{snapped ? `Snapped to ${beatWords(snapped.label)}` : ''}</span>
      </div>
    </div>
  );
}
