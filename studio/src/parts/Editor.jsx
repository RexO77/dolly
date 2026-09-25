/**
 * The editor for one clip: the picture, its film strip and transport on the
 * left, the shot list on the right. Save writes the clip's camera file;
 * Render makes the real clip and shows it beside the preview to compare.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Transport } from '../model/picture.js';
import { useVersion, usePlayback } from '../hooks.js';
import { Button, Segmented } from '../ui/controls.jsx';
import { EditorBar } from './EditorBar.jsx';
import { Preview } from './Preview.jsx';
import { Strip } from './Strip.jsx';
import { TransportBar } from './TransportBar.jsx';
import { ShotList } from './ShotList.jsx';
import { useEditorKeys } from './useEditorKeys.js';
import { sound } from '../ui/sound.js';

/** An open shot plays on a loop, with this much breathing room either side, so a change to it is seen at once. */
const LOOP_BEFORE = 0.6;
const LOOP_AFTER = 0.9;

export function Editor({ library, name, onHome }) {
  const [clip, setClip] = useState(() => library.loaded(name));
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!clip) library.open(name).then(setClip, (e) => setError(e.message));
  }, [library, name, clip]);

  if (error) {
    return (
      <div className="page-message">
        <h2>Dolly could not open {name}</h2>
        <p>{error}</p>
        <div><Button onClick={onHome}>Back to all clips</Button></div>
      </div>
    );
  }
  if (!clip) {
    return (
      <div className="editor">
        <EditorBar library={library} name={name} onHome={onHome} />
        <main className="work-loading"><p>Opening {name}. The first time, Dolly reads the whole take, so give it a moment.</p></main>
      </div>
    );
  }
  return <Director library={library} clip={clip} onHome={onHome} />;
}

function Coach({ mode, shot, playing, hasMoves }) {
  if (mode === 'frame') return shot ? 'Drag the frame to move it. Drag a corner to zoom in or out.' : 'Open a shot on the right to frame it here.';
  if (mode === 'render') return 'This is the rendered file. Flip to Preview to compare.';
  if (shot) return playing ? `Shot ${shot.n + 1} plays on a loop. Every change replays it.` : <>Shot {shot.n + 1} is open. Press <kbd>space</kbd> to play it on a loop.</>;
  if (!hasMoves) return <>Press <kbd>space</kbd> to watch the take. Pause where something changes, and lean in there.</>;
  return <>Press <kbd>space</kbd> to play. Click a shot to change it.</>;
}

function Director({ library, clip, onHome }) {
  const video = useMemo(() => document.createElement('video'), []);
  const transport = useMemo(() => new Transport(clip, video), [clip, video]);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('picture');
  const [status, setStatus] = useState(null);
  useVersion(clip);
  const { playing } = usePlayback(transport);

  useEffect(() => {
    transport.ready.then(() => {
      transport.seek(0);
      setReady(true);
    });
    return () => transport.destroy();
  }, [transport]);

  const shot = selected ? clip.shotById(selected) : null;
  useEffect(() => {
    if (selected && !clip.shotById(selected)) setSelected(null);
  }, [clip, selected, clip.version]);

  /* The open shot is the region the transport loops. */
  const region = shot ? [Math.max(0, shot.t0 - LOOP_BEFORE), Math.min(clip.length, shot.t1 + LOOP_AFTER)] : null;
  const regionKey = region ? region.map((v) => v.toFixed(2)).join('-') : '';
  useEffect(() => {
    transport.setRegion(region);
  }, [transport, regionKey]);
  useEffect(() => {
    const s = selected && clip.shotById(selected);
    if (s) transport.seek(Math.max(0, s.t0 - LOOP_BEFORE));
  }, [transport, selected, clip]);
  /* Every settled change to the open shot replays it from the top of its loop. */
  const lastVersion = useRef(clip.version);
  useEffect(() => {
    if (shot && clip.liveBase === null && lastVersion.current !== clip.version) transport.replay();
    lastVersion.current = clip.version;
  }, [clip.version, clip.liveBase]);

  const save = async () => {
    setStatus(null);
    try {
      await clip.save();
      sound.latch();
      await library.refresh();
      setStatus('Saved');
    } catch (e) {
      sound.error();
      setStatus(`Not saved: ${e.message}`);
    }
  };
  const render = async () => {
    setStatus(null);
    try {
      const r = await clip.render();
      sound.done();
      await library.refresh();
      setMode('render');
      setStatus(`Rendered to ${r.out}`);
      return true;
    } catch (e) {
      sound.error();
      setStatus(`The render stopped: ${e.message}`);
      return false;
    }
  };

  useEditorKeys({ clip, transport, shot, save, select: setSelected, toggleFraming: () => setMode((m) => (m === 'frame' ? 'picture' : 'frame')) });

  const renderUrl = clip.renderUrl;
  const view = mode === 'render' && !renderUrl ? 'picture' : mode;

  return (
    <div className="editor">
      <EditorBar library={library} name={clip.name} clip={clip} status={status} onHome={onHome} onSave={save} onRender={render} onStatus={setStatus} />
      <main className="work">
        <section className="stage" aria-label="Picture">
          <div className="stage-tools">
            <Segmented
              label="View"
              value={view}
              onChange={setMode}
              options={[
                { value: 'picture', label: 'Preview', title: 'The clip as it will render' },
                { value: 'frame', label: 'Framing', title: 'The whole screen, with the open shot’s frame to drag (F)' },
                ...(renderUrl ? [{ value: 'render', label: 'Rendered', title: 'The rendered file, to compare with the preview' }] : []),
              ]}
            />
            <span className="coach" aria-live="polite"><Coach mode={view} shot={shot} playing={playing} hasMoves={clip.hasMoves} /></span>
          </div>
          {ready ? <Preview clip={clip} transport={transport} video={video} mode={view} shot={shot} renderUrl={renderUrl} /> : <div className="preview preview-loading">Loading the take…</div>}
          <Strip clip={clip} transport={transport} selectedId={selected} onSelect={setSelected} />
          <TransportBar clip={clip} transport={transport} />
        </section>
        <ShotList clip={clip} transport={transport} selectedId={selected} onSelect={setSelected} onFrame={(id) => { setSelected(id); setMode('frame'); }} onSay={setStatus} />
      </main>
    </div>
  );
}
