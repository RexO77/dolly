/*
 * Dolly's controls. Buttons, a segmented choice, and numbers you can drag
 * or type. Each keeps one weight, signals state with tone, and presses in
 * a little.
 */
import { useId, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { cx } from '../hooks.js';
import { Icon } from './Icon.jsx';

export function Button({ variant = 'default', size = 'm', icon, children, className, ...props }) {
  return (
    <button type="button" className={cx('btn', `btn-${variant}`, `btn-${size}`, !children && 'btn-icon', className)} {...props}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

/** One of a few options; the active one sits on a pill that slides to it. */
export function Segmented({ options, value, onChange, label, size = 'm' }) {
  const id = useId();
  return (
    <div className={cx('seg', `seg-${size}`)} role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} className={cx('seg-item', on && 'on')} onClick={() => onChange(o.value)} title={o.title}>
            {on && <motion.span layoutId={`seg-${id}`} className="seg-pill" transition={{ type: 'spring', duration: 0.3, bounce: 0 }} />}
            <span className="seg-label">{o.icon ? <Icon name={o.icon} /> : null}{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * A number: drag it sideways to change it (Shift for ten times the step),
 * click it to type, arrow keys to nudge. Every change during a drag is live;
 * the drag lands as one undo step.
 */
export function Value({ value, onChange, onSettle, step = 0.01, min = -Infinity, max = Infinity, format = (v) => v.toFixed(2), label, className }) {
  const [editing, setEditing] = useState(false);
  const drag = useRef(null);
  const clamp = (v) => Math.max(min, Math.min(max, v));

  if (editing) {
    return (
      <input
        className={cx('value', 'value-input', className)}
        aria-label={label}
        defaultValue={format(value).replace(/[^\d.-]/g, '')}
        inputMode="decimal"
        autoFocus
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            e.currentTarget.dataset.cancel = '1';
            e.currentTarget.blur();
          }
        }}
        onBlur={(e) => {
          const v = Number(e.target.value);
          if (!e.target.dataset.cancel && Number.isFinite(v)) {
            onChange(clamp(v), false);
          }
          setEditing(false);
        }}
      />
    );
  }

  return (
    <span
      className={cx('value', className)}
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={value}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, v: value, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        if (!d.moved && Math.abs(dx) < 3) return;
        d.moved = true;
        onChange(clamp(d.v + dx * step * (e.shiftKey ? 10 : 1)), true);
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (d?.moved) onSettle?.();
        else setEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') setEditing(true);
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        onChange(clamp(value + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)), false);
      }}
    >
      {format(value)}
    </span>
  );
}

/** A labelled line in a panel: the label on the left, its control on the right. */
export function Field({ label, children, hint }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="field-control">{children}</div>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}
