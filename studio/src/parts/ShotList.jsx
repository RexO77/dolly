/**
 * The shot list: the clip as numbered shots, each with the frame it shows.
 * Above them, the two verbs that add a move at the playhead and any note
 * about the clip as a whole; below them, the washes.
 */
import { useEffect, useState } from 'react';
import { thumbnails } from '../model/picture.js';
import { useVersion, useTime, fmt } from '../hooks.js';
import { Button } from '../ui/controls.jsx';
import { Notes } from './Notes.jsx';
import { ShotRow } from './ShotRow.jsx';
import { Washes } from './Washes.jsx';
import { Stage } from './Stage.jsx';

/** The moment each shot's thumbnail shows: a little into a hold, the landing of a move. */
const thumbTime = (s) => (s.kind === 'hold' ? s.t0 + Math.min(0.4, (s.t1 - s.t0) / 2) : s.t1 - 0.02);

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

export function ShotList({ clip, transport, selectedId, onSelect, onFrame, onSay }) {
  useVersion(clip);
  const t = useTime(transport);
  const shots = clip.shots;
  const notes = clip.notes();
  const thumbs = useThumbs(clip, shots.map(thumbTime));
  const current = shots.find((s) => t >= s.t0 && t < s.t1)?.id;
  const firstBox = Object.keys(clip.boxes)[0];
  const add = (move) => move && onSelect(move.id);
  const general = notes.filter((n) => !n.shot);

  return (
    <section className="list" aria-label="Shots">
      <header className="list-head">
        <div>
          <h2>Shots</h2>
          <p className="list-sub">{shots.length} {shots.length === 1 ? 'shot' : 'shots'}, {fmt(clip.length)}s. Click one to change it.</p>
        </div>
      </header>
      <div className="verbs">
        <Button size="s" icon="lean" onClick={() => add(clip.leanInHere(transport.t, firstBox))} title="Add a lean in at the playhead: it springs in for 1.2s and settles">
          Lean in here<span className="mono">{fmt(t)}s</span>
        </Button>
        <Button size="s" icon="wide" onClick={() => add(clip.pullBackHere(transport.t))} title="Add a pull back to wide at the playhead">
          Pull back here<span className="mono">{fmt(t)}s</span>
        </Button>
      </div>
      {!clip.hasMoves && (
        <div className="shots-empty">
          <strong>One long wide shot, for now.</strong>
          <p>Play the take and pause just before something changes. Press Lean in here: the camera springs in and settles before the change plays.</p>
        </div>
      )}
      {general.length > 0 && <Notes clip={clip} notes={general} onSay={onSay} />}
      <ol className="shots">
        {shots.map((s, i) => (
          <ShotRow
            key={s.id}
            clip={clip}
            shot={s}
            thumb={thumbs[i]}
            current={s.id === current}
            open={s.id === selectedId}
            notes={notes.filter((n) => n.shot === s.id)}
            onToggle={() => onSelect(s.id === selectedId ? null : s.id)}
            onFrame={onFrame}
            onSay={onSay}
          />
        ))}
      </ol>
      <Washes clip={clip} transport={transport} />
      <Stage clip={clip} />
    </section>
  );
}
