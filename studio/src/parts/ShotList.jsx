/**
 * The shot list: the clip as numbered shots, each with the frame it shows.
 * The selected shot opens to its controls: when it happens, what it frames,
 * how far it leans in, how it moves, and any note on it with its fix.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { resolve } from '../model/clip.js';
import { thumbnails } from '../model/picture.js';
import { useClipVersion, useTime, cx, fmt } from '../hooks.js';
import { Button, Segmented, Value, Field } from '../ui/controls.jsx';
import { Lens } from '../ui/Lens.jsx';
import { SpanBar } from '../ui/SpanBar.jsx';
import { Curve } from '../ui/Curve.jsx';
import { Icon } from '../ui/Icon.jsx';

/** A shot's title, in the words a shot list uses. */
export function titleOf(s) {
  const on = s.target.kind === 'box' ? ` on ${s.target.name}` : '';
  if (s.kind === 'hold') {
    if (s.target.kind === 'wide') return s.t0 === 0 ? 'Establish, wide' : 'Hold wide';
    return s.target.kind === 'box' ? `Hold on ${s.target.name}` : 'Hold';
  }
  if (s.kind === 'lean') return `Lean in${on}`;
  if (s.kind === 'pull') return 'Pull back to wide';
  return `Hop${s.target.kind === 'box' ? ` to ${s.target.name}` : ''}`;
}

const reveal = { initial: { height: 0, opacity: 0 }, animate: { height: 'auto', opacity: 1 }, exit: { height: 0, opacity: 0 }, transition: { duration: 0.22, ease: [0.23, 1, 0.32, 1] } };

function useThumbs(clip, times) {
  const [thumbs, setThumbs] = useState([]);
  const key = times.map((t) => t.toFixed(2)).join(',');
  useEffect(() => {
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      thumbnails(clip, times, 96, { signal: ctl.signal }).then((urls) => !ctl.signal.aborted && setThumbs(urls));
    }, 300);
    return () => {
      ctl.abort();
      clearTimeout(timer);
    };
  }, [clip, key, clip.version]);
  return thumbs;
}

export function ShotList({ clip, transport, selectedId, onSelect, onFrameMode, onSay }) {
  useClipVersion(clip);
  const t = useTime(transport);
  const shots = clip.shots;
  const notes = clip.notes();
  const thumbs = useThumbs(clip, shots.map((s) => (s.kind === 'hold' ? s.t0 + Math.min(0.4, (s.t1 - s.t0) / 2) : s.t1 - 0.02)));
  const current = shots.find((s) => t >= s.t0 && t < s.t1)?.id;
  const boxNames = Object.keys(clip.boxes);

  const lean = () => {
    const before = new Set(clip.shots.map((s) => s.id));
    clip.leanInHere(transport.t, boxNames[0]);
    const added = clip.shots.find((s) => !before.has(s.id) && s.kind !== 'hold');
    if (added) onSelect(added.id);
  };
  const pull = () => {
    const before = new Set(clip.shots.map((s) => s.id));
    clip.pullBackHere(transport.t);
    const added = clip.shots.find((s) => !before.has(s.id) && s.kind !== 'hold');
    if (added) onSelect(added.id);
  };

  return (
    <section className="list" aria-label="Shots">
      <header className="list-head">
        <div>
          <h2 className="list-title">Shots</h2>
          <p className="list-sub">{shots.length} shots over {fmt(clip.length)}s{notes.length ? `, ${notes.length} ${notes.length === 1 ? 'note' : 'notes'}` : ''}</p>
        </div>
        <div className="list-verbs">
          <Button size="s" icon="lean" onClick={lean} title="A lean in from the playhead, settled 1.2s later">Lean in at {fmt(t)}s</Button>
          <Button size="s" icon="wide" onClick={pull} title="A pull back to wide from the playhead">Pull back at {fmt(t)}s</Button>
        </div>
      </header>
      <ol className="shots">
        {shots.map((s, i) => (
          <ShotRow
            key={s.id}
            clip={clip}
            shot={s}
            index={i}
            thumb={thumbs[i]}
            current={s.id === current}
            open={s.id === selectedId}
            notes={notes.filter((n) => n.shot === s.id)}
            onToggle={() => onSelect(s.id === selectedId ? null : s.id)}
            onFrameMode={onFrameMode}
            onSay={onSay}
          />
        ))}
      </ol>
      <Washes clip={clip} transport={transport} />
    </section>
  );
}

function ShotRow({ clip, shot, index, thumb, current, open, notes, onToggle, onFrameMode, onSay }) {
  const row = useRef(null);
  const moveShot = shot.kind !== 'hold';
  const key = clip.spec.camera[clip.keyIndex(shot.id)];
  const z = resolve(key)[2];
  const boxNames = Object.keys(clip.boxes);
  const curve = clip.curve(shot.id);
  const lands = shot.target.kind === 'box' ? shot.target.name : shot.target.kind;
  const landOptions = [{ value: 'wide', label: 'Wide' }, ...boxNames.map((b) => ({ value: b, label: b }))];
  if (shot.target.kind === 'frame') landOptions.push({ value: 'frame', label: 'Its own framing' });

  useEffect(() => {
    if (open) row.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open]);

  const setLands = (v) => {
    if (v === 'wide') clip.frameShot(shot, [0.5, 0.5, 1]);
    else if (v !== 'frame') clip.frameOnBox(shot, v);
  };
  const setZoom = (v, live) => {
    const [cx, cy] = resolve(clip.spec.camera[clip.keyIndex(shot.id)]);
    clip.frameShot(clip.shotById(shot.id), [z <= 1.0005 ? 0.5 : cx, z <= 1.0005 ? 0.5 : cy, v], { live });
  };
  const fresh = () => clip.shotById(shot.id) ?? shot;

  return (
    <li ref={row} className={cx('shot', current && 'current', open && 'open', notes.length && 'noted')}>
      <button type="button" className="shot-summary" onClick={onToggle} aria-expanded={open}>
        <span className="shot-n">{String(index + 1).padStart(2, '0')}</span>
        <span className="shot-thumb">{thumb ? <img src={thumb} alt="" /> : null}</span>
        <span className="shot-text">
          <span className="shot-title">{titleOf(shot)}</span>
          <span className="shot-meta">
            {fmt(shot.t0)}–{fmt(shot.t1)} · {fmt(shot.t1 - shot.t0)}s{moveShot ? ` · ${curve.name === 'custom' ? 'shaped' : curve.name}` : ''}
          </span>
        </span>
        {notes.length > 0 && <span className="shot-flag" aria-label={`${notes.length} note`} />}
        <Icon name="chevron" className="shot-chevron" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="shot-body" {...reveal}>
            <div className="shot-controls">
              <Field label="When">
                <SpanBar
                  length={clip.length}
                  t0={shot.t0}
                  t1={shot.t1}
                  beats={clip.beats}
                  snaps={clip.snapTimes()}
                  movable={moveShot}
                  onStart={(v, live) => clip.setKeyTime(fresh().fromId, v, { live })}
                  onEnd={(v, live) => clip.setKeyTime(fresh().id, v, { live })}
                  onShift={(dt, live) => clip.shiftShot(fresh(), dt, { live })}
                  onSettle={() => clip.settle()}
                />
                <div className="values">
                  <span className="values-label">from</span>
                  <Value label="Starts at" value={shot.t0} step={0.01} min={0} max={clip.length} format={(v) => `${v.toFixed(2)}s`} onChange={(v, live) => clip.setKeyTime(fresh().fromId, v, { live })} onSettle={() => clip.settle()} />
                  <span className="values-label">for</span>
                  <Value label="Lasts" value={shot.t1 - shot.t0} step={0.01} min={0.1} format={(v) => `${v.toFixed(2)}s`} onChange={(v, live) => clip.setKeyTime(fresh().id, fresh().t0 + v, { live })} onSettle={() => clip.settle()} />
                </div>
              </Field>
              <Field label={moveShot ? 'Lands on' : 'Frames'}>
                <Segmented size="s" label={moveShot ? 'Lands on' : 'Frames'} value={lands} options={landOptions} onChange={setLands} />
              </Field>
              <Field label="Zoom">
                <Lens value={z} onChange={setZoom} onSettle={() => clip.settle()} max={Math.max(2, Math.ceil(z * 4) / 4)} />
              </Field>
              {moveShot && (
                <Field label="Moves" hint={curve.name === 'spring' ? 'The lean: no bounce, settled on its mark.' : curve.name === 'smooth' ? 'Even in and even out.' : 'Drag a handle to shape it.'}>
                  <div className="curve-block">
                    <Curve ease={curve.ease} readOnly={curve.name !== 'custom'} onChange={(e, live) => clip.setCurve(shot.id, e, { live })} onSettle={() => clip.settle()} />
                    <Segmented
                      size="s"
                      label="Curve"
                      value={curve.name}
                      onChange={(v) => clip.setCurve(shot.id, v === 'custom' ? [...curve.ease] : v)}
                      options={[{ value: 'spring', label: 'Spring' }, { value: 'smooth', label: 'Smooth' }, { value: 'custom', label: 'Shape it' }]}
                    />
                  </div>
                </Field>
              )}
              {notes.map((n, i) => (
                <div key={i} className="note" role="note">
                  <span className="note-text">{n.text}</span>
                  {n.fix && <Button size="s" variant="note" icon="fix" onClick={() => {
                    n.fix.apply();
                    const now = clip.shotById(shot.id);
                    onSay?.(now ? `${n.fix.label}: this shot now runs ${fmt(now.t0)}–${fmt(now.t1)}s` : n.fix.label);
                  }}>{n.fix.label}</Button>}
                </div>
              ))}
              <div className="shot-actions">
                <Button size="s" icon="frame" onClick={() => onFrameMode(shot.id)}>Adjust on the picture</Button>
                {moveShot && <Button size="s" variant="quiet" onClick={() => clip.removeMove(shot)}>Remove this move</Button>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function Washes({ clip, transport }) {
  const [open, setOpen] = useState(null);
  const spots = clip.spec.spots;
  const boxNames = Object.keys(clip.boxes);
  const nameOf = (sp) => boxNames.find((b) => ['x', 'y', 'w', 'h'].every((k) => Math.abs(clip.boxes[b][k] - sp[k]) < 1e-6)) ?? null;
  return (
    <section className="washes" aria-label="Washes">
      <header className="list-head list-head-sub">
        <div>
          <h2 className="list-title">Washes</h2>
          <p className="list-sub">{spots.length ? 'The warm light that dims everything but the subject.' : 'None yet. A wash dims everything but the subject, so the eye lands on it.'}</p>
        </div>
        <Button size="s" icon="wash" onClick={() => setOpen(clip.addWash(transport.t, boxNames[0]))}>Add a wash here</Button>
      </header>
      {spots.length > 0 && (
        <ol className="shots">
          {spots.map((sp, i) => {
            const name = nameOf(sp);
            const end = sp.out ?? clip.length;
            return (
              <li key={i} className={cx('shot', 'wash-row', open === i && 'open')}>
                <button type="button" className="shot-summary" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                  <span className="shot-n">W{i + 1}</span>
                  <span className="wash-swatch" aria-hidden="true" />
                  <span className="shot-text">
                    <span className="shot-title">{name ? `Wash on ${name}` : 'Wash'}</span>
                    <span className="shot-meta">{fmt(sp.in)}–{sp.out === undefined ? 'end' : fmt(sp.out)} · fades {fmt(sp.fade ?? 0.5)}s</span>
                  </span>
                  <Icon name="chevron" className="shot-chevron" />
                </button>
                <AnimatePresence initial={false}>
                  {open === i && (
                    <motion.div className="shot-body" {...reveal}>
                      <div className="shot-controls">
                        <Field label="When">
                          <SpanBar
                            length={clip.length}
                            t0={sp.in}
                            t1={end}
                            beats={clip.beats}
                            snaps={clip.snapTimes()}
                            onStart={(v, live) => clip.setWash(i, { in: Math.round(Math.min(v, end - 0.1) * 1000) / 1000 }, { live })}
                            onEnd={(v, live) => clip.setWash(i, { out: Math.round(Math.max(v, sp.in + 0.1) * 1000) / 1000 }, { live })}
                            onShift={(dt, live) => clip.setWash(i, { in: Math.round(Math.max(0, clip.spec.spots[i].in + dt) * 1000) / 1000, out: clip.spec.spots[i].out === undefined ? undefined : Math.round((clip.spec.spots[i].out + dt) * 1000) / 1000 }, { live })}
                            onSettle={() => clip.settle()}
                          />
                        </Field>
                        <Field label="Fades">
                          <div className="values">
                            <span className="values-label">in over</span>
                            <Value label="Fades in over" value={sp.fade ?? 0.5} step={0.005} min={0} max={3} format={(v) => `${v.toFixed(2)}s`} onChange={(v, live) => clip.setWash(i, { fade: Math.round(v * 1000) / 1000 }, { live })} onSettle={() => clip.settle()} />
                            <span className="values-label">out over</span>
                            <Value label="Fades out over" value={sp.fadeOut ?? (sp.fade ?? 0.5) * 0.7} step={0.005} min={0} max={3} format={(v) => `${v.toFixed(2)}s`} onChange={(v, live) => clip.setWash(i, { fadeOut: Math.round(v * 1000) / 1000 }, { live })} onSettle={() => clip.settle()} />
                          </div>
                        </Field>
                        {boxNames.length > 0 && (
                          <Field label="On">
                            <Segmented size="s" label="Wash on" value={name ?? 'custom'} onChange={(v) => v !== 'custom' && clip.washOnBox(i, v)} options={[...boxNames.map((b) => ({ value: b, label: b })), ...(name ? [] : [{ value: 'custom', label: 'Measured rect' }])]} />
                          </Field>
                        )}
                        <div className="shot-actions">
                          <Button size="s" onClick={() => { transport.pause(); transport.seek(sp.in + (sp.fade ?? 0.5)); }}>Go to it</Button>
                          <Button size="s" variant="quiet" onClick={() => { clip.removeWash(i); setOpen(null); }}>Remove this wash</Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
