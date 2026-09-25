/**
 * Washes: the spotlight, which is the page's warm ground laid over
 * everything but the subject, so the eye lands on the one part left clear.
 * Each has its timing, its fades, and what it leaves clear.
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { r3 } from '../model/clip.js';
import { cx, fmt } from '../hooks.js';
import { Button, Segmented, Value, Field } from '../ui/controls.jsx';
import { SpanBar } from '../ui/SpanBar.jsx';
import { Icon } from '../ui/Icon.jsx';
import { reveal } from './ShotRow.jsx';

const WHAT = 'A warm, light veil over everything but the subject, so the eye goes straight to it.';

function WashRow({ clip, transport, spot, index, open, onToggle, onRemove }) {
  const boxNames = Object.keys(clip.boxes);
  const name = boxNames.find((b) => ['x', 'y', 'w', 'h'].every((k) => Math.abs(clip.boxes[b][k] - spot[k]) < 1e-6)) ?? null;
  const end = spot.out ?? clip.length;
  const fade = spot.fade ?? 0.5;
  const set = (patch, live) => clip.setWash(index, patch, { live });
  const settle = () => clip.settle();
  const shift = (dt, live) => {
    const now = clip.spec.spots[index];
    set({ in: r3(Math.max(0, now.in + dt)), out: now.out === undefined ? undefined : r3(now.out + dt) }, live);
  };

  return (
    <li className={cx('shot', 'wash-row', open && 'open')}>
      <button type="button" className="shot-summary" onClick={onToggle} aria-expanded={open}>
        <span className="shot-n">W{index + 1}</span>
        <span className="wash-swatch" aria-hidden="true" />
        <span className="shot-text">
          <span className="shot-title">{name ? `Wash, clear on ${name}` : 'Wash'}</span>
          <span className="shot-meta">{fmt(spot.in)}–{spot.out === undefined ? 'end' : fmt(spot.out)} · fades {fmt(fade)}s</span>
        </span>
        <span />
        <Icon name="chevron" className="shot-chevron" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="shot-body" {...reveal}>
            <div className="shot-controls">
              <Field label="Timing">
                <SpanBar
                  length={clip.length}
                  t0={spot.in}
                  t1={end}
                  beats={clip.beats}
                  snaps={clip.snapTimes()}
                  onStart={(v, live) => set({ in: r3(Math.min(v, end - 0.1)) }, live)}
                  onEnd={(v, live) => set({ out: r3(Math.max(v, spot.in + 0.1)) }, live)}
                  onShift={shift}
                  onSettle={settle}
                />
              </Field>
              <Field label="Fades">
                <div className="values">
                  <span className="values-label">in over</span>
                  <Value label="Fades in over" value={fade} step={0.005} min={0} max={3} format={(v) => `${v.toFixed(2)}s`} onChange={(v, live) => set({ fade: r3(v) }, live)} onSettle={settle} />
                  <span className="values-label">out over</span>
                  <Value label="Fades out over" value={spot.fadeOut ?? fade * 0.7} step={0.005} min={0} max={3} format={(v) => `${v.toFixed(2)}s`} onChange={(v, live) => set({ fadeOut: r3(v) }, live)} onSettle={settle} />
                </div>
              </Field>
              {boxNames.length > 0 && (
                <Field label="Clear on">
                  <Segmented size="s" label="Clear on" value={name ?? 'custom'} onChange={(v) => v !== 'custom' && clip.washOnBox(index, v)} options={[...boxNames.map((b) => ({ value: b, label: b })), ...(name ? [] : [{ value: 'custom', label: 'Custom area' }])]} />
                </Field>
              )}
              <div className="shot-actions">
                <Button size="s" onClick={() => { transport.pause(); transport.seek(spot.in + fade); }}>Go to it</Button>
                <Button size="s" variant="danger" onClick={onRemove}>Remove this wash</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export function Washes({ clip, transport }) {
  const [open, setOpen] = useState(null);
  const spots = clip.spec.spots;
  const firstBox = Object.keys(clip.boxes)[0];
  return (
    <section className="washes" aria-label="Washes">
      <header className="list-head section-head">
        <div>
          <h2>Washes</h2>
          <p className="list-sub">{spots.length ? WHAT : `None yet. ${WHAT}`}</p>
        </div>
        <Button size="s" icon="wash" onClick={() => setOpen(clip.addWash(transport.t, firstBox))}>Add a wash here</Button>
      </header>
      {spots.length > 0 && (
        <ol className="shots">
          {spots.map((spot, i) => (
            <WashRow
              key={i}
              clip={clip}
              transport={transport}
              spot={spot}
              index={i}
              open={open === i}
              onToggle={() => setOpen(open === i ? null : i)}
              onRemove={() => {
                clip.removeWash(i);
                setOpen(null);
              }}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
