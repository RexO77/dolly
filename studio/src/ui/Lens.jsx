/**
 * Zoom as a lens ring: a scale that slides under a fixed index, the way a
 * camera's zoom barrel turns. Wide sits at 1; the grammar's lean at 1.35 is
 * a detent the ring settles into (hold Shift to pass it).
 */
import { useRef } from 'react';
import { LEAN_Z } from '../model/clip.js';

const PPU = 280; // pixels per unit of zoom
const SNAP = 0.012;

export function Lens({ value, onChange, onSettle, max = 2, width = 248, label = 'Zoom' }) {
  const drag = useRef(null);
  const h = 44;
  const mid = width / 2;
  const x = (z) => mid + (z - value) * PPU;
  const clamp = (z) => Math.max(1, Math.min(max, z));
  const detent = (z, free) => {
    if (free) return z;
    if (Math.abs(z - LEAN_Z) < SNAP) return LEAN_Z;
    if (Math.abs(z - 1) < SNAP) return 1;
    return z;
  };
  const ticks = [];
  for (let z = 1; z <= max + 1e-9; z = Math.round((z + 0.025) * 1000) / 1000) {
    const px = x(z);
    if (px < -8 || px > width + 8) continue;
    const lean = Math.abs(z - LEAN_Z) < 1e-6;
    const quarter = Math.abs((z * 100) % 25) < 1e-6;
    /* Labels keep clear of the lean: 1.25 sits too close to it to carry one. */
    const major = lean || (quarter && Math.abs(z - LEAN_Z) > 0.12);
    const tickMajor = lean || quarter;
    ticks.push(<line key={`t${z}`} className={lean ? 'lens-tick lens-lean' : tickMajor ? 'lens-tick lens-major' : 'lens-tick'} x1={px} x2={px} y1={lean ? 20 : tickMajor ? 24 : 28} y2={h - 4} />);
    if (major || lean) {
      ticks.push(<text key={`l${z}`} className={lean ? 'lens-label lens-lean' : 'lens-label'} x={px} y={lean ? 15 : 19} textAnchor="middle">{z === 1 ? 'wide' : lean ? 'lean' : z.toFixed(2).replace(/0$/, '')}</text>);
    }
  }
  const readout = value <= 1.0005 ? 'Wide' : `${value.toFixed(3)}×`;

  return (
    <div className="lens" style={{ width }}>
      <svg
        className="lens-ring"
        width={width}
        height={h}
        viewBox={`0 0 ${width} ${h}`}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={1}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={readout}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, v: value };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dz = -(e.clientX - drag.current.x) / PPU;
          onChange(detent(clamp(drag.current.v + dz), e.shiftKey), true);
        }}
        onPointerUp={() => {
          if (drag.current) onSettle?.();
          drag.current = null;
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.1 : 0.01;
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(clamp(value + step), false);
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(clamp(value - step), false);
          else if (e.key === 'Home') onChange(1, false);
          else if (e.key === 'l' || e.key === 'L') onChange(LEAN_Z, false);
          else return;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {ticks}
        <line className="lens-index" x1={mid} x2={mid} y1={20} y2={h} />
      </svg>
      <span className="lens-readout">{readout}</span>
    </div>
  );
}
