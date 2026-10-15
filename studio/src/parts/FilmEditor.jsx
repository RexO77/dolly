/**
 * Directing a launch film. On the left, the open shot as the film renderer
 * draws it (any moment of it, by the scrubber) and the film's shots in a
 * row; on the right, each shot's cut, subject, scale and length, the
 * ending, and the judge. Every picture here is a frame of the real render.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Film } from '../model/film.js';
import { cx, fmt } from '../hooks.js';
import { Button, Segmented, Value, Field } from '../ui/controls.jsx';
import { Icon } from '../ui/Icon.jsx';
import { RenderButton } from '../ui/RenderButton.jsx';
import { SoundToggle } from '../ui/SoundToggle.jsx';
import { sound } from '../ui/sound.js';
import { reveal } from './ShotRow.jsx';

const SCALE_WORDS = { extreme: 'Extreme close-up', macro: 'Close-up', medium: 'Medium', wide: 'Wide' };
const isMac = /Mac/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl+';

function useFilm(name) {
  const [film, setFilm] = useState(null);
  const [error, setError] = useState(null);
  const [, setVersion] = useState(0);
  useEffect(() => {
    let off = () => {};
    Film.load(name).then((f) => {
      off = f.on(setVersion);
      setFilm(f);
    }, (e) => setError(e.message));
    return () => off();
  }, [name]);
  return [film, error];
}

/** A still of the film renderer's, fetched when its moment changes; keeps the last one up while the next renders. */
function useStill(film, index, t, width) {
  const [url, setUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const version = film?.version;
  useEffect(() => {
    if (!film || index === null) return undefined;
    let live = true;
    setBusy(true);
    const timer = setTimeout(() => {
      film.still(index, t, width).then((u) => {
        if (!live) return;
        setUrl(u);
        setError(null);
        setBusy(false);
      }, (e) => {
        if (!live) return;
        setError(e.message);
        setBusy(false);
      });
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [film, index, t, width, version]);
  return { url, busy, error };
}

function Thumb({ film, shot, selected, onSelect, total }) {
  const { url } = useStill(film, shot.index, shot.length / 2, 320);
  return (
    <button type="button" className={cx('film-cell', selected && 'on')} style={{ flexGrow: shot.length / total }} onClick={() => { sound.select(); onSelect(shot.index); }} aria-pressed={selected} title={`Shot ${shot.index + 1}: ${SCALE_WORDS[shot.scale]}, ${fmt(shot.length)}s`}>
      <span className="film-cell-img">{url ? <img src={url} alt="" /> : null}</span>
      <span className="film-cell-label"><span className="mono">{String(shot.index + 1).padStart(2, '0')}</span> {SCALE_WORDS[shot.scale]}</span>
    </button>
  );
}

function subjectName(subject) {
  return typeof subject === 'string' ? subject : subject && subject.w === 1 && subject.h === 1 ? 'the whole window' : 'a custom area';
}

function ShotRow({ film, shot, open, onToggle, notes }) {
  const spec = film.spec.shots[shot.index];
  const beatNow = film.beats.reduce((best, b) => (Math.abs(b.t - (spec.at + 0.6)) < Math.abs(best.t - (spec.at + 0.6)) ? b : best), film.beats[0] ?? { label: '', t: 0 });
  const set = (patch) => film.setShot(shot.index, patch);
  return (
    <li className={cx('shot', open && 'open', notes.length && 'noted')}>
      <button type="button" className="shot-summary" onClick={() => { sound.select(); onToggle(); }} aria-expanded={open}>
        <span className="shot-n">{String(shot.index + 1).padStart(2, '0')}</span>
        <span className={cx('film-diagonal', shot.diagonal < 0 && 'down', !shot.diagonal && 'flat')} aria-hidden="true" />
        <span className="shot-text">
          <span className="shot-title">{SCALE_WORDS[shot.scale]} on {subjectName(spec.subject)}</span>
          <span className="shot-meta">{fmt(shot.cut)}s in the film · {fmt(shot.length)}s · from {fmt(shot.from)}s of the take</span>
        </span>
        {notes.length ? <span className="note-dot" aria-label={`${notes.length} note${notes.length > 1 ? 's' : ''}`} /> : <span />}
        <Icon name="chevron" className="shot-chevron" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="shot-body" {...reveal}>
            <div className="shot-controls">
              <Field label="Cuts on" hint="The moment the shot cuts in on: just before it, so the action starts as it opens.">
                <Segmented size="s" label="Cuts on" value={beatNow?.label} onChange={(label) => film.cutOn(shot.index, label)} options={film.beats.map((b) => ({ value: b.label, label: b.label }))} />
              </Field>
              <Field label="Timing">
                <div className="values">
                  <span className="values-label">from</span>
                  <Value label="Cuts in at, in the take" value={spec.at} step={0.01} min={0} max={film.take.master.duration - 0.5} format={(v) => `${v.toFixed(2)}s`} onChange={(v) => set({ at: v })} />
                  <span className="values-label">lasts</span>
                  <Value label="Lasts" value={spec.length} step={0.01} min={1} max={10} format={(v) => `${v.toFixed(2)}s`} onChange={(v) => set({ length: v })} />
                </div>
              </Field>
              <Field label="Looks at">
                <Segmented size="s" label="Looks at" value={typeof spec.subject === 'string' ? spec.subject : 'custom'} onChange={(v) => v !== 'custom' && set({ subject: v })} options={[...film.boxes.map((b) => ({ value: b, label: b })), ...(typeof spec.subject === 'string' ? [] : [{ value: 'custom', label: subjectName(spec.subject) }])]} />
              </Field>
              <Field label="Scale" hint={spec.scale ? undefined : 'Chosen from the size of what it looks at.'}>
                <Segmented size="s" label="Scale" value={spec.scale ?? 'auto'} onChange={(v) => set({ scale: v === 'auto' ? undefined : v })} options={[{ value: 'auto', label: 'Auto' }, { value: 'extreme', label: 'Extreme' }, { value: 'macro', label: 'Close' }, { value: 'medium', label: 'Medium' }, { value: 'wide', label: 'Wide' }]} />
              </Field>
              {notes.length > 0 && (
                <div className="list-notes">
                  {notes.map((n) => (
                    <div key={n.text} className="note" role="note">
                      <span className="note-text">{n.text.replace(/^./, (c) => c.toUpperCase())}</span>
                      {n.fix && <Button size="s" onClick={() => { sound.fix(); n.fix(); }}>{n.fixLabel}</Button>}
                    </div>
                  ))}
                </div>
              )}
              <div className="shot-actions">
                {shot.scale !== 'wide' && <Button size="s" onClick={() => film.flipDiagonal(shot.index)}>Flip the diagonal</Button>}
                <Button size="s" onClick={() => film.move(shot.index, -1)} disabled={shot.index === 0}>Earlier</Button>
                <Button size="s" onClick={() => film.move(shot.index, 1)} disabled={shot.index === film.spec.shots.length - 1}>Later</Button>
                <Button size="s" onClick={() => film.addAfter(shot.index)}>Add a shot after</Button>
                <Button size="s" variant="danger" onClick={() => film.remove(shot.index)} disabled={film.spec.shots.length <= 1}>Remove</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

/** The judge's notes, with a fix beside the ones that have a clear one. */
function withFixes(film, notes) {
  return notes.map((n) => {
    const i = n.shot ? n.shot - 1 : null;
    if (i !== null && /same scale and diagonal/.test(n.text)) return { ...n, fix: () => film.flipDiagonal(i), fixLabel: 'Flip its diagonal' };
    if (i !== null && /two short accents/.test(n.text)) return { ...n, fix: () => film.setShot(i, { length: 3.2 }), fixLabel: 'Let it run 3.2s' };
    if (/no wide shot/.test(n.text)) return { ...n, fix: () => film.edit((f) => f.shots.push({ at: Math.max(0, film.take.master.duration - 4), length: 3.6, subject: { x: 0, y: 0, w: 1, h: 1 }, scale: 'wide' })), fixLabel: 'Add a payoff' };
    return n;
  });
}

export function FilmEditor({ name, onHome }) {
  const [film, error] = useFilm(name);
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(0);
  const [t, setT] = useState(null);
  const [view, setView] = useState('picture');
  const [status, setStatus] = useState(null);
  const [judging, setJudging] = useState(false);
  const keys = useRef({});

  const shots = film?.shots ?? [];
  const shot = shots[Math.min(selected, shots.length - 1)] ?? null;
  const at = shot ? Math.min(t ?? shot.length / 2, shot.length) : 0;
  const { url, busy, error: stillError } = useStill(film, shot ? shot.index : null, at, 1280);

  const save = async () => {
    try {
      await film.save();
      sound.latch();
      setStatus('Saved');
    } catch (e) {
      sound.error();
      setStatus(`Not saved: ${e.message}`);
    }
  };
  const render = async () => {
    setStatus(null);
    try {
      await film.render();
      sound.done();
      setView('render');
      setStatus('Rendered');
      return true;
    } catch (e) {
      sound.error();
      setStatus(`The render stopped: ${e.message}`);
      return false;
    }
  };
  const judge = async () => {
    setJudging(true);
    try {
      await film.judge();
    } catch (e) {
      setStatus(e.message);
    }
    setJudging(false);
  };

  keys.current = { film, save };
  useEffect(() => {
    const onKey = (e) => {
      const { film: f, save: s } = keys.current;
      if (!f || e.target.closest('input, textarea, select, [contenteditable]')) return;
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) f.redo();
        else f.undo();
      } else if (cmd && e.key.toLowerCase() === 's') {
        e.preventDefault();
        s();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (error) return <div className="page-message"><h2>This clip has no launch film yet</h2><p>{error}</p></div>;
  if (!film) return <div className="page-message"><p>Opening the film…</p></div>;

  const notes = film.notes ? withFixes(film, film.notes) : [];
  const shotNotes = (i) => notes.filter((n) => n.shot === i + 1);
  const filmNotes = notes.filter((n) => !n.shot);

  return (
    <div className="editor film-editor">
      <header className="bar">
        <div className="bar-left">
          <Button variant="quiet" icon="back" onClick={onHome} title="Every clip in the project">Clips</Button>
          <span className="bar-title"><strong>Launch film</strong><span className="mono">{name}</span></span>
        </div>
        <span aria-hidden="true" />
        <div className="bar-right">
          <span className={cx('bar-status', film.dirty && !status && 'dirty')} aria-live="polite">{status ?? (film.dirty ? 'Unsaved changes' : 'Saved')}</span>
          <SoundToggle />
          <Button variant="quiet" icon="undo" aria-label={`Undo (${mod}Z)`} title={`Undo (${mod}Z)`} disabled={!film.canUndo} onClick={() => { film.undo(); sound.undo(); }} />
          <Button variant="quiet" icon="redo" aria-label={`Redo (${mod}Shift+Z)`} title={`Redo (${mod}Shift+Z)`} disabled={!film.canRedo} onClick={() => { film.redo(); sound.redo(); }} />
          <Button onClick={save} disabled={!film.dirty} title={`Write the shots to the film file (${mod}S)`}>Save</Button>
          <RenderButton progress={film.rendering} onRender={render} label={film.rendered ? 'Render again' : 'Render'} title="Save, then render the film with its sound" />
        </div>
      </header>
      <main className="work">
        <section className="stage" aria-label="Picture">
          <div className="stage-tools">
            <Segmented label="View" value={view === 'render' && !film.renderUrl ? 'picture' : view} onChange={setView} options={[{ value: 'picture', label: 'Shot', title: 'The open shot, as the renderer draws it' }, ...(film.renderUrl ? [{ value: 'render', label: 'Rendered', title: 'The rendered film, with its sound' }] : [])]} />
            <span className="coach">{view === 'render' ? 'The rendered film, with its sound.' : busy ? 'Rendering this frame…' : 'Every frame here is the film renderer’s own. Drag the time to see any moment of the shot.'}</span>
          </div>
          <div className="preview film-picture">
            {view === 'render' && film.renderUrl ? (
              <video className="preview-media" src={film.renderUrl} controls playsInline />
            ) : stillError ? (
              <p className="film-error">{stillError}</p>
            ) : url ? (
              <img className={cx('preview-media', busy && 'film-busy')} src={url} alt={`Shot ${shot.index + 1} at ${fmt(at)}s`} />
            ) : (
              <p className="film-error">Rendering the first frame…</p>
            )}
          </div>
          {view !== 'render' && shot && (
            <div className="film-scrub">
              <span className="mono">{fmt(at)}s</span>
              <input type="range" min={0} max={shot.length} step={1 / 24} value={at} onChange={(e) => setT(Number(e.target.value))} aria-label="Time in the shot" />
              <span className="mono">{fmt(shot.length)}s</span>
            </div>
          )}
          <div className="film-strip" role="group" aria-label="The film's shots">
            {shots.map((s) => <Thumb key={`${s.index}-${s.from}-${s.length}`} film={film} shot={s} total={film.length} selected={s.index === shot?.index} onSelect={(i) => { setSelected(i); setOpen(i); setT(null); }} />)}
            <span className="film-cell film-end" title="The copy, then the logo">End</span>
          </div>
        </section>
        <aside className="list" aria-label="Shots">
          <section className="washes">
            <header className="list-head section-head">
              <div>
                <h2>Shots</h2>
                <p className="list-sub">{shots.length} shots, {fmt(film.length)}s, then the copy and the logo. Each cuts in on a moment, looks at one thing, and flips its diagonal from the last.</p>
              </div>
            </header>
            <ol className="shots">
              {shots.map((s) => <ShotRow key={s.index} film={film} shot={s} open={open === s.index} notes={shotNotes(s.index)} onToggle={() => { setOpen(open === s.index ? -1 : s.index); setSelected(s.index); setT(null); }} />)}
            </ol>
          </section>
          <section className="washes">
            <header className="list-head section-head">
              <div>
                <h2>Ending</h2>
                <p className="list-sub">One line on black, then the logo, held still.</p>
              </div>
            </header>
            <div className="shot-controls">
              <Field label="Copy">
                <input className="text-input" value={film.spec.ending?.copy ?? ''} onChange={(e) => film.setEnding({ copy: e.target.value })} aria-label="The product's name, as the line starts" />
              </Field>
              <Field label="Tagline">
                <input className="text-input" value={film.spec.ending?.tagline ?? ''} onChange={(e) => film.setEnding({ tagline: e.target.value })} aria-label="The tagline, five words or fewer" />
              </Field>
            </div>
          </section>
          <section className="washes">
            <header className="list-head section-head">
              <div>
                <h2>The judge</h2>
                <p className="list-sub">Reads every shot’s middle frame like a film still, and the cut like an edit.</p>
              </div>
              <Button size="s" onClick={judge} disabled={judging}>{judging ? 'Judging…' : film.notes ? 'Judge it again' : 'Judge it'}</Button>
            </header>
            {film.notes && (
              <div className="list-notes">
                {filmNotes.map((n) => (
                  <div key={n.text} className={cx('note', n.level === 'ok' && 'note-ok')} role="note">
                    <span className="note-text">{n.text.replace(/^./, (c) => c.toUpperCase())}</span>
                    {n.fix && <Button size="s" onClick={() => { sound.fix(); n.fix(); }}>{n.fixLabel}</Button>}
                  </div>
                ))}
                {notes.some((n) => n.shot) && <p className="list-sub">The rest are on their shots.</p>}
              </div>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}
