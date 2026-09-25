/** Notes that need the person, each with its one-click fix beside it where the fix is clear. */
import { fmt } from '../hooks.js';
import { Button } from '../ui/controls.jsx';

export function Notes({ clip, notes, shotId, onSay }) {
  const apply = (fix) => {
    fix.apply();
    const now = shotId && clip.shotById(shotId);
    onSay?.(now ? `${fix.label}: this shot now runs ${fmt(now.t0)} to ${fmt(now.t1)}s` : `Done: ${fix.label.toLowerCase()}`);
  };
  return (
    <div className="list-notes">
      {notes.map((n) => (
        <div key={n.text} className="note" role="note">
          <span className="note-text">{n.text}</span>
          {n.fix && <Button size="s" variant="note" icon="check" onClick={() => apply(n.fix)}>{n.fix.label}</Button>}
        </div>
      ))}
    </div>
  );
}
