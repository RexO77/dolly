/**
 * The curve a move arrives on, drawn as it renders: a cubic Bezier over the
 * move's length. Drag a handle to shape it, or focus one and use the arrows.
 */
import { useRef } from 'react';

export function Curve({ ease, onChange, onSettle, size = 132, pad = 14, readOnly = false }) {
  const svg = useRef(null);
  const drag = useRef(null);
  const inner = size - pad * 2;
  const px = (v) => pad + v * inner;
  const py = (v) => pad + (1 - v) * inner;
  const [x1, y1, x2, y2] = ease;

  const at = (e) => {
    const r = svg.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (((e.clientX - r.left) / r.width) * size - pad) / inner)),
      y: Math.max(-0.4, Math.min(1.4, 1 - (((e.clientY - r.top) / r.height) * size - pad) / inner)),
    };
  };
  const set = (which, p) => {
    const next = [...ease];
    next[which * 2] = Math.round(p.x * 1000) / 1000;
    next[which * 2 + 1] = Math.round(p.y * 1000) / 1000;
    return next;
  };
  const handle = (which, hx, hy) => (
    <circle
      className="curve-handle"
      cx={px(hx)}
      cy={py(hy)}
      r={5.5}
      tabIndex={readOnly ? -1 : 0}
      role="slider"
      aria-label={which ? 'Arrival handle' : 'Departure handle'}
      aria-valuetext={`${hx.toFixed(2)}, ${hy.toFixed(2)}`}
      onPointerDown={readOnly ? undefined : (e) => {
        e.stopPropagation();
        svg.current.setPointerCapture(e.pointerId);
        drag.current = which;
      }}
      onKeyDown={readOnly ? undefined : (e) => {
        const d = e.shiftKey ? 0.1 : 0.02;
        const map = { ArrowLeft: [0, -d], ArrowRight: [0, d], ArrowUp: [1, d], ArrowDown: [1, -d] };
        if (!map[e.key]) return;
        e.preventDefault();
        e.stopPropagation();
        const next = [...ease];
        next[which * 2 + map[e.key][0]] = Math.round((next[which * 2 + map[e.key][0]] + map[e.key][1]) * 1000) / 1000;
        onChange(next, false);
      }}
    />
  );

  return (
    <svg
      ref={svg}
      className={readOnly ? 'curve curve-read' : 'curve'}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      onPointerMove={(e) => {
        if (drag.current === null) return;
        onChange(set(drag.current, at(e)), true);
      }}
      onPointerUp={() => {
        if (drag.current !== null) onSettle?.();
        drag.current = null;
      }}
    >
      {[0.25, 0.5, 0.75].map((g) => <line key={`v${g}`} className="curve-grid" x1={px(g)} x2={px(g)} y1={py(0)} y2={py(1)} />)}
      {[0.25, 0.5, 0.75].map((g) => <line key={`h${g}`} className="curve-grid" x1={px(0)} x2={px(1)} y1={py(g)} y2={py(g)} />)}
      <rect className="curve-frame" x={pad} y={pad} width={inner} height={inner} rx={2} />
      <line className="curve-ref" x1={px(0)} y1={py(0)} x2={px(1)} y2={py(1)} />
      {!readOnly && <line className="curve-arm" x1={px(0)} y1={py(0)} x2={px(x1)} y2={py(y1)} />}
      {!readOnly && <line className="curve-arm" x1={px(1)} y1={py(1)} x2={px(x2)} y2={py(y2)} />}
      <path className="curve-path" d={`M${px(0)},${py(0)} C${px(x1)},${py(y1)} ${px(x2)},${py(y2)} ${px(1)},${py(1)}`} />
      {!readOnly && handle(0, x1, y1)}
      {!readOnly && handle(1, x2, y2)}
    </svg>
  );
}
