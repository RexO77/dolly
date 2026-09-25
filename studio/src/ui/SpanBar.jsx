/**
 * Where a shot sits in the clip, and handles to change it: drag an end to
 * retime it, drag the middle to move the whole shot. Ends snap to the take's
 * beats (and to a lean's settle point before each); Shift drags freely.
 */
import { useRef, useState } from 'react';
import { cx } from '../hooks.js';

const SNAP_PX = 6;

export function SpanBar({ length, t0, t1, beats = [], snaps = [], onStart, onEnd, onShift, onSettle, width = 300, movable = true }) {
  const svg = useRef(null);
  const drag = useRef(null);
  const [snapped, setSnapped] = useState(null);
  const h = 28;
  const pad = 6;
  const x = (t) => pad + (t / length) * (width - pad * 2);
  const toT = (clientX) => {
    const r = svg.current.getBoundingClientRect();
    return ((clientX - r.left - pad) / (r.width - pad * 2)) * length;
  };
  const snap = (t, free) => {
    if (free) return { t, hit: null };
    let best = null;
    for (const s of snaps) {
      const d = Math.abs(x(s.t) - x(t));
      if (d < SNAP_PX && (!best || d < best.d)) best = { d, ...s };
    }
    return best ? { t: best.t, hit: best } : { t, hit: null };
  };

  const start = (which) => (e) => {
    e.stopPropagation();
    svg.current.setPointerCapture(e.pointerId);
    drag.current = { which, t: toT(e.clientX), t0, t1 };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const now = toT(e.clientX);
    if (d.which === 'start') {
      const s = snap(now, e.shiftKey);
      setSnapped(s.hit);
      onStart(s.t, true);
    } else if (d.which === 'end') {
      const s = snap(now, e.shiftKey);
      setSnapped(s.hit);
      onEnd(s.t, true);
    } else {
      const s = snap(d.t1 + (now - d.t), e.shiftKey);
      setSnapped(s.hit);
      onShift(s.t - d.t1, true);
    }
  };
  const end = () => {
    if (drag.current) onSettle?.();
    drag.current = null;
    setSnapped(null);
  };

  return (
    <div className="span">
      <svg ref={svg} className={cx('span-bar', drag.current && 'dragging')} width={width} height={h} viewBox={`0 0 ${width} ${h}`} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <line className="span-track" x1={x(0)} x2={x(length)} y1={h / 2} y2={h / 2} />
        {beats.map((b) => <circle key={b.label} className={cx('span-beat', snapped?.t === b.t && 'hit')} cx={x(b.t)} cy={h / 2} r={snapped?.t === b.t ? 3 : 2}><title>{b.label.replace(/[-_]+/g, ' ')}</title></circle>)}
        <rect className={cx('span-range', movable && 'movable')} x={x(t0)} y={6} width={Math.max(2, x(t1) - x(t0))} height={h - 12} rx={4} onPointerDown={movable ? start('shift') : undefined} />
        <g className="span-handle" onPointerDown={start('start')} role="slider" aria-label="Shot start" aria-valuenow={t0} tabIndex={-1}>
          <rect className="span-hit" x={x(t0) - 8} y={0} width={16} height={h} />
          <rect className="span-grip" x={x(t0) - 1.5} y={5} width={3} height={h - 10} rx={1.5} />
        </g>
        <g className="span-handle" onPointerDown={start('end')} role="slider" aria-label="Shot end" aria-valuenow={t1} tabIndex={-1}>
          <rect className="span-hit" x={x(t1) - 8} y={0} width={16} height={h} />
          <rect className="span-grip" x={x(t1) - 1.5} y={5} width={3} height={h - 10} rx={1.5} />
        </g>
        {snapped && <line className="span-snap" x1={x(snapped.t)} x2={x(snapped.t)} y1={0} y2={h} />}
      </svg>
      <span className={cx('span-note', snapped && 'on')} aria-live="polite">{snapped ? `Snapped to ${snapped.label.replace(/[-_]+/g, ' ')}` : ''}</span>
    </div>
  );
}
