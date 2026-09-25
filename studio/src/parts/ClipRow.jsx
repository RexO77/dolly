/**
 * One clip on the home screen: its poster, its name, where it stands in
 * plain words, and its next step, which is a button when the step happens
 * here and the exact command when it happens in the terminal.
 */
import { useState } from 'react';
import { clipLength } from '../model/project.js';
import { fmt } from '../hooks.js';
import { Button } from '../ui/controls.jsx';
import { Command } from '../ui/Command.jsx';
import { RenderButton } from '../ui/RenderButton.jsx';
import { Icon } from '../ui/Icon.jsx';
import { sound } from '../ui/sound.js';

function OpenLink({ onClick, children = 'Open' }) {
  return <button type="button" className="link" onClick={onClick}>{children}<Icon name="arrow" size={14} /></button>;
}

export function ClipRow({ library, summary, stage, onOpen }) {
  const [error, setError] = useState(null);
  const clip = library.loaded(summary.name);
  const length = clip ? clip.length : summary.duration && clipLength(summary.duration, summary.source);
  const moves = clip?.shots.filter((s) => s.kind !== 'hold').length;
  const open = () => onOpen(summary.name);
  const render = async () => {
    setError(null);
    try {
      await library.render(summary.name);
      sound.done();
      return true;
    } catch (e) {
      sound.error();
      setError(`The render stopped: ${e.message}`);
      return false;
    }
  };
  const rendering = clip?.rendering ?? null;
  const { next } = stage;

  return (
    <li className="clip">
      <button type="button" className="clip-poster" onClick={open} disabled={!summary.status.master} aria-label={`Open ${summary.name}`}>
        {summary.poster ? <img src={summary.poster} alt="" width="176" height="110" /> : <span className="clip-empty-frame">No take yet</span>}
      </button>

      <div className="clip-text">
        <div className="clip-name">
          <h3>{summary.title ?? summary.name}</h3>
          {summary.title && <span className="clip-meta">{summary.name}</span>}
        </div>
        <div className="clip-lines">
          <span className={`state state-${stage.key}`}>{stage.label}</span>
          {length ? <span className="clip-meta">{fmt(length)}s</span> : null}
          {clip && <span className="clip-count">{moves ? `${moves} camera ${moves === 1 ? 'move' : 'moves'}` : 'Wide throughout'}</span>}
          {stage.attention && <span className="attention">{stage.attention}</span>}
        </div>
        <p className="clip-detail" role={error ? 'alert' : undefined}>{error ?? stage.detail}</p>
      </div>

      <div className="clip-next">
        {rendering !== null || next?.kind === 'render' ? (
          <>
            <RenderButton variant="default" label={next?.label ?? 'Render'} progress={rendering} onRender={render} />
            <OpenLink onClick={open} />
          </>
        ) : next?.kind === 'open' ? (
          <Button onClick={open}>{next.label}</Button>
        ) : next?.kind === 'command' ? (
          <>
            <span className="clip-next-label">{next.label} from your terminal</span>
            <Command text={next.command} />
            {summary.status.master && <OpenLink onClick={open}>Watch it</OpenLink>}
          </>
        ) : null}
      </div>
    </li>
  );
}
