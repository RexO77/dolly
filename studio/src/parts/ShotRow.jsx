/**
 * One shot. Closed, it is a line: its number, the frame it shows, what it
 * does and when. Open, it has its controls: its timing, what it frames, how
 * far in it leans, how it moves, and any note on it with the fix.
 */
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { resolve, shotTitle } from '../model/clip.js';
import { cx, fmt } from '../hooks.js';
import { Button, Segmented, Value, Field } from '../ui/controls.jsx';
import { Lens } from '../ui/Lens.jsx';
import { Tilt } from '../ui/Tilt.jsx';
import { SpanBar } from '../ui/SpanBar.jsx';
import { Curve } from '../ui/Curve.jsx';
import { Icon } from '../ui/Icon.jsx';
import { Notes } from './Notes.jsx';
import { sound } from '../ui/sound.js';

export const reveal = { initial: { height: 0, opacity: 0 }, animate: { height: 'auto', opacity: 1 }, exit: { height: 0, opacity: 0 }, transition: { duration: 0.22, ease: [0.23, 1, 0.32, 1] } };

const MOTION_HINT = {
  spring: 'Springs in and settles, with no bounce. The grammar’s own move.',
  smooth: 'Eases in and out, evenly.',
  custom: 'Drag a handle to shape it.',
};

export function ShotRow({ clip, shot, thumb, current, open, notes, onToggle, onFrame, onSay }) {
  const row = useRef(null);
  const isMove = shot.kind !== 'hold';
  const z = resolve(clip.spec.camera[clip.keyIndex(shot.id)])[2];
  const boxNames = Object.keys(clip.boxes);
  const curve = clip.curve(shot.id);
  const frames = shot.target.kind === 'box' ? shot.target.name : shot.target.kind;
  const frameOptions = [{ value: 'wide', label: 'Wide' }, ...boxNames.map((b) => ({ value: b, label: b }))];
  if (shot.target.kind === 'frame') frameOptions.push({ value: 'frame', label: 'Custom' });

  useEffect(() => {
    if (open) row.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open]);

  /* Handlers find the shot again by id: a drag can move it between renders. */
  const fresh = () => clip.shotById(shot.id) ?? shot;
  const setFrames = (v) => {
    if (v === 'wide') clip.frameShot(shot, [0.5, 0.5, 1]);
    else if (v !== 'frame') clip.frameOnBox(shot, v);
  };
  const setZoom = (v, live) => {
    const [x, y] = resolve(clip.spec.camera[clip.keyIndex(shot.id)]);
    clip.frameShot(fresh(), [z <= 1.0005 ? 0.5 : x, z <= 1.0005 ? 0.5 : y, v], { live });
  };
  const settle = () => clip.settle();

  return (
    <li ref={row} className={cx('shot', current && 'current', open && 'open', notes.length && 'noted')}>
      <button type="button" className="shot-summary" onClick={() => { sound.select(); onToggle(); }} aria-expanded={open}>
        <span className="shot-n">{String(shot.n + 1).padStart(2, '0')}</span>
        <span className="shot-thumb">{thumb ? <img src={thumb} alt="" /> : null}</span>
        <span className="shot-text">
          <span className="shot-title">{shotTitle(shot)}</span>
          <span className="shot-meta">
            {fmt(shot.t0)}–{fmt(shot.t1)} · {fmt(shot.t1 - shot.t0)}s{isMove ? ` · ${curve.name === 'custom' ? 'shaped' : curve.name}` : ''}
          </span>
        </span>
        {notes.length > 0 ? <span className="shot-flag" role="img" aria-label={`${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`} /> : <span />}
        <Icon name="chevron" className="shot-chevron" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="shot-body" {...reveal}>
            <div className="shot-controls">
              <Field label="Timing">
                <SpanBar
                  length={clip.length}
                  t0={shot.t0}
                  t1={shot.t1}
                  beats={clip.beats}
                  snaps={clip.snapTimes()}
                  movable={isMove}
                  onStart={(v, live) => clip.setKeyTime(fresh().fromId, v, { live })}
                  onEnd={(v, live) => clip.setKeyTime(fresh().id, v, { live })}
                  onShift={(dt, live) => clip.shiftShot(fresh(), dt, { live })}
                  onSettle={settle}
                />
                <div className="values">
                  <span className="values-label">starts</span>
                  <Value label="Starts at" value={shot.t0} step={0.01} min={0} max={clip.length} format={(v) => `${v.toFixed(2)}s`} onChange={(v, live) => clip.setKeyTime(fresh().fromId, v, { live })} onSettle={settle} />
                  <span className="values-label">lasts</span>
                  <Value label="Lasts" value={shot.t1 - shot.t0} step={0.01} min={0.1} format={(v) => `${v.toFixed(2)}s`} onChange={(v, live) => clip.setKeyTime(fresh().id, fresh().t0 + v, { live })} onSettle={settle} />
                </div>
              </Field>
              <Field label={isMove ? 'Lands on' : 'Frames'}>
                <Segmented size="s" label={isMove ? 'Lands on' : 'Frames'} value={frames} options={frameOptions} onChange={setFrames} />
              </Field>
              <Field label="Zoom">
                <Lens value={z} onChange={setZoom} onSettle={settle} max={Math.max(2, Math.ceil(z * 4) / 4)} sharpMax={clip.info.master.width / clip.info.output.width} />
              </Field>
              <Field label="Tilt" hint={clip.stage ? undefined : 'Tilting puts the clip on a stage: a card in 3D over a background.'}>
                <Tilt tilt={shot.tilt} onChange={(t, live) => clip.setTilt(fresh(), t, { live })} onSettle={settle} />
              </Field>
              {isMove && (
                <Field label="Motion" hint={MOTION_HINT[curve.name]}>
                  <div className="curve-block">
                    <Curve ease={curve.ease} readOnly={curve.name !== 'custom'} onChange={(e, live) => clip.setCurve(shot.id, e, { live })} onSettle={settle} />
                    <Segmented
                      size="s"
                      label="Motion"
                      value={curve.name}
                      onChange={(v) => clip.setCurve(shot.id, v === 'custom' ? [...curve.ease] : v)}
                      options={[{ value: 'spring', label: 'Spring' }, { value: 'smooth', label: 'Smooth' }, { value: 'custom', label: 'Shape it' }]}
                    />
                  </div>
                </Field>
              )}
              {notes.length > 0 && <Notes clip={clip} notes={notes} shotId={shot.id} onSay={onSay} />}
              <div className="shot-actions">
                <Button size="s" icon="frame" onClick={() => onFrame(shot.id)}>Frame it on the picture</Button>
                {isMove && <Button size="s" variant="danger" onClick={() => clip.removeMove(shot)}>Remove this move</Button>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
