/**
 * The Studio: the picture and its film strip on the left, the shot list on
 * the right. Save writes the clip's camera file; Render makes the real clip
 * and lets you compare it with the preview.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { Clip } from './model/clip.js';
import { Transport, sharpness } from './model/picture.js';
import { useClipVersion, usePlayback, useTime, fmt } from './hooks.js';
import { Button, Segmented } from './ui/controls.jsx';
import { Preview } from './parts/Preview.jsx';
import { Strip } from './parts/Strip.jsx';
import { ShotList } from './parts/ShotList.jsx';

const isMac = /Mac/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl+';

export function App() {
  const [project, setProject] = useState(null);
  const [name, setName] = useState(() => new URLSearchParams(location.search).get('clip'));
  const [clip, setClip] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Clip.list().then((p) => {
      setProject(p);
      setName((n) => n ?? p.clips[0]?.name ?? null);
    }, (e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!name) return;
    setClip(null);
    history.replaceState(null, '', `?clip=${encodeURIComponent(name)}`);
    Clip.load(name).then(setClip, (e) => setError(e.message));
  }, [name]);

  if (error) return <div className="empty-state"><h1>Dolly could not open this clip</h1><p>{error}</p></div>;
  if (project && !project.clips.length) return <div className="empty-state"><h1>Nothing recorded yet</h1><p>Record a take first: <code>dolly record {project.alias ?? project.name} &lt;clip&gt;</code>, then open it here.</p></div>;

  return (
    <MotionConfig reducedMotion="user">
      <Studio key={name} project={project} clip={clip} name={name} onPick={setName} />
    </MotionConfig>
  );
}

function Studio({ project, clip, name, onPick }) {
  const video = useMemo(() => document.createElement('video'), []);
  const transport = useMemo(() => (clip ? new Transport(clip, video) : null), [clip, video]);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('picture');
  const [renderUrl, setRenderUrl] = useState(null);
  const [status, setStatus] = useState(null);
  const [rendering, setRendering] = useState(null);
  useClipVersion(clip);

  useEffect(() => {
    if (!transport) return undefined;
    transport.ready.then(() => {
      transport.seek(0);
      setReady(true);
    });
    if (clip.info.rendered) setRenderUrl(`/media/out/${encodeURIComponent(clip.name)}.mp4?v=${clip.info.rendered}`);
    return () => transport.destroy();
  }, [transport, clip]);

  const shot = clip && selected ? clip.shotById(selected) : null;
  useEffect(() => {
    if (clip && selected && !clip.shotById(selected)) setSelected(null);
  }, [clip, selected, clip?.version]);

  /* An open shot is the region: it plays on repeat, with a breath either side, so a change to it is seen at once. */
  const region = shot ? [Math.max(0, shot.t0 - 0.6), Math.min(clip.length, shot.t1 + 0.9)] : null;
  const regionKey = region ? region.map((v) => v.toFixed(2)).join('-') : '';
  useEffect(() => {
    if (!transport) return;
    transport.setRegion(region);
  }, [transport, regionKey]);
  const openShot = selected;
  useEffect(() => {
    if (!transport || !openShot || !clip) return;
    const s = clip.shotById(openShot);
    if (s) transport.seek(Math.max(0, s.t0 - 0.6));
  }, [transport, openShot]);
  const lastVersion = useRef(clip?.version);
  useEffect(() => {
    if (!transport || !shot || clip.liveBase !== null) return;
    if (lastVersion.current !== clip.version) transport.replay();
    lastVersion.current = clip.version;
  }, [clip?.version, clip?.liveBase]);

  useEffect(() => {
    /* A theme switch should not animate every surface: hold transitions for a frame. */
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const still = () => {
      document.documentElement.classList.add('no-motion');
      requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('no-motion')));
    };
    mq.addEventListener('change', still);
    return () => mq.removeEventListener('change', still);
  }, []);

  const save = async () => {
    try {
      const r = await clip.save();
      setStatus(`Saved to ${r.saved}`);
    } catch (e) {
      setStatus(`Not saved: ${e.message}`);
    }
  };
  const render = async () => {
    setRendering(0);
    try {
      const r = await clip.render((p) => setRendering(p));
      setRenderUrl(r.url);
      setMode('render');
      setStatus(`Rendered ${r.out}`);
    } catch (e) {
      setStatus(`Render failed: ${e.message}`);
    }
    setRendering(null);
  };

  const keys = useRef({});
  keys.current = { save, clip, transport, shot, setSelected, setMode };
  useEffect(() => {
    const onKey = (e) => {
      const { clip: c, transport: tp, shot: s } = keys.current;
      if (!c || !tp || e.target.closest('input, textarea, select, [contenteditable]')) return;
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) c.redo();
        else c.undo();
      } else if (cmd && e.key === 's') {
        e.preventDefault();
        keys.current.save();
      } else if (cmd || e.altKey) return;
      else if (e.key === ' ' && !e.target.closest('button')) {
        e.preventDefault();
        tp.toggle();
      } else if (e.key === ',' || e.key === '.') tp.step((e.key === ',' ? -1 : 1) * (e.shiftKey ? 10 : 1));
      else if (e.key === 'f' || e.key === 'F') keys.current.setMode((m) => (m === 'frame' ? 'picture' : 'frame'));
      else if (e.key === 'Escape') keys.current.setSelected(null);
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (e.target.closest('[role="slider"], [role="spinbutton"]')) return;
        e.preventDefault();
        const shots = c.shots;
        const i = s ? shots.findIndex((x) => x.id === s.id) : -1;
        const next = shots[Math.max(0, Math.min(shots.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
        keys.current.setSelected(next.id);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const { playing } = usePlayback(transport);
  const dirty = clip?.dirty;
  const saveState = status ?? (dirty ? 'Unsaved changes' : clip?.info.hasCamera ? 'Saved' : 'Not directed yet');

  return (
    <div className="app">
      <header className="bar">
        <div className="bar-left">
          <span className="brand">Dolly</span>
          <span className="bar-sep" aria-hidden="true">/</span>
          <span className="bar-project">{project?.name}</span>
          <span className="bar-sep" aria-hidden="true">/</span>
          <label className="picker">
            <span className="sr">Clip</span>
            <select value={name ?? ''} onChange={(e) => onPick(e.target.value)} disabled={clip?.dirty}>
              {project?.clips.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </label>
        </div>
        <div className="bar-right">
          <span className={dirty ? 'bar-status dirty' : 'bar-status'} aria-live="polite">{rendering !== null ? `Rendering ${Math.round(rendering * 100)}%` : saveState}</span>
          <Button variant="quiet" icon="undo" aria-label={`Undo (${mod}Z)`} title={`Undo (${mod}Z)`} disabled={!clip?.canUndo} onClick={() => { clip.undo(); setStatus(null); }} />
          <Button variant="quiet" icon="redo" aria-label={`Redo (${mod}Shift+Z)`} title={`Redo (${mod}Shift+Z)`} disabled={!clip?.canRedo} onClick={() => { clip.redo(); setStatus(null); }} />
          <Button onClick={() => { setStatus(null); save(); }} disabled={!dirty} title={`Save the camera (${mod}S)`}>Save</Button>
          <Button variant="primary" onClick={render} disabled={!clip || rendering !== null} className="render-btn">
            {rendering !== null ? 'Rendering' : 'Render'}
            {rendering !== null && <span className="render-progress" style={{ transform: `scaleX(${rendering})` }} />}
          </Button>
        </div>
      </header>

      {clip && transport ? (
        <main className="work">
          <section className="stage" aria-label="Picture">
            <div className="stage-tools">
              <Segmented
                label="View"
                value={mode === 'render' && !renderUrl ? 'picture' : mode}
                onChange={setMode}
                options={[
                  { value: 'picture', label: 'Picture', title: 'The clip as it will ship' },
                  { value: 'frame', label: 'Framing', title: 'The whole screen, with the shot’s framing to drag (F)' },
                  ...(renderUrl ? [{ value: 'render', label: 'Rendered', title: 'The rendered file, to compare' }] : []),
                ]}
              />
              <span className="stage-hint">{mode === 'frame' ? (shot ? 'Drag the framing to move it. Drag a corner to lean in or out.' : 'Open a shot to adjust its framing.') : mode === 'render' ? 'The rendered file. Switch to Picture to compare.' : shot ? (playing ? 'Playing this shot on repeat. Every change replays it.' : 'This shot plays on repeat while it is open: press space. Every change replays it.') : ''}</span>
            </div>
            {ready ? <Preview clip={clip} transport={transport} video={video} mode={mode} shot={shot} renderUrl={renderUrl} /> : <div className="preview preview-loading">Loading the take…</div>}
            <Strip clip={clip} transport={transport} selectedId={selected} onSelect={setSelected} />
            <TransportBar clip={clip} transport={transport} />
          </section>
          <ShotList clip={clip} transport={transport} selectedId={selected} onSelect={setSelected} onFrameMode={(id) => { setSelected(id); setMode('frame'); }} onSay={setStatus} />
        </main>
      ) : (
        <main className="work work-loading"><p>Loading {name}…</p></main>
      )}
    </div>
  );
}

function TransportBar({ clip, transport }) {
  const t = useTime(transport);
  const { playing, rate } = usePlayback(transport);
  const ratio = sharpness(clip, t);
  return (
    <div className="transport">
      <Button variant="quiet" icon={playing ? 'pause' : 'play'} aria-label={playing ? 'Pause (space)' : 'Play (space)'} onClick={() => transport.toggle()} />
      <Button variant="quiet" icon="back" aria-label="Back a frame (,)" onClick={() => transport.step(-1)} />
      <Button variant="quiet" icon="forward" aria-label="On a frame (.)" onClick={() => transport.step(1)} />
      <span className="clock"><span className="clock-now">{fmt(t)}</span><span className="clock-len"> / {fmt(clip.length)}s</span></span>
      <Segmented size="s" label="Speed" value={rate} onChange={(r) => transport.setRate(r)} options={[{ value: 1, label: '1×' }, { value: 0.5, label: '½×' }, { value: 0.25, label: '¼×' }]} />
      <span className="grow" />
      <span className={ratio < 1 ? 'readout soft' : 'readout'} title="Master pixels behind each delivered pixel. Under 1, the lean is upscaling the take and text softens.">
        {ratio < 1 ? `Soft here: upscaled ${(1 / ratio).toFixed(2)}×` : `Sharp · ${ratio.toFixed(2)} px/px`}
      </span>
    </div>
  );
}
