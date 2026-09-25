/**
 * The editor's bar: the way back to every clip, which clip this is, where
 * it stands in the three steps (you are always on Direct here), and the
 * clip's own actions: undo, redo, Save, Render.
 */
import { STEPS } from '../model/project.js';
import { useVersion, cx, mod } from '../hooks.js';
import { Button } from '../ui/controls.jsx';
import { Icon } from '../ui/Icon.jsx';
import { RenderButton } from '../ui/RenderButton.jsx';
import { sound } from '../ui/sound.js';
import { SoundToggle } from '../ui/SoundToggle.jsx';

function Steps({ rendered }) {
  const state = { film: 'done', direct: 'here', render: rendered ? 'done' : 'todo' };
  return (
    <ol className="steps" aria-label="Steps">
      {STEPS.map((step, i) => (
        <li key={step.key}>
          {i > 0 && <span className="step-sep" aria-hidden="true" />}
          <span className={cx('step', `step-${state[step.key]}`)} aria-current={state[step.key] === 'here' ? 'step' : undefined} title={step.text}>
            <span className="step-mark">{state[step.key] === 'done' ? <Icon name="check" size={12} /> : i + 1}</span>
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function EditorBar({ library, name, clip, status, onHome, onSave, onRender, onStatus }) {
  useVersion(clip);
  useVersion(library);
  const summary = library.summary(name);
  const stage = library.stage(name);
  const dirty = clip?.dirty;
  const upToDate = stage.step === 3 && !dirty;
  const saved = status ?? (dirty ? 'Unsaved changes' : clip?.info.hasCamera ? 'Saved' : 'Not saved yet');
  const undo = () => {
    clip.undo();
    sound.undo();
    onStatus(null);
  };
  const redo = () => {
    clip.redo();
    sound.redo();
    onStatus(null);
  };

  return (
    <header className="bar">
      <div className="bar-left">
        <Button variant="quiet" icon="back" onClick={onHome} title="Every clip in the project">Clips</Button>
        <span className="bar-title">
          <strong>{summary?.title ?? name}</strong>
          {summary?.title && <span className="mono">{name}</span>}
        </span>
      </div>
      <Steps rendered={upToDate} />
      <div className="bar-right">
        {clip && (
          <>
            <span className={cx('bar-status', dirty && !status && 'dirty')} aria-live="polite">{saved}</span>
            <SoundToggle />
            <Button variant="quiet" icon="undo" aria-label={`Undo (${mod}Z)`} title={`Undo (${mod}Z)`} disabled={!clip.canUndo} onClick={undo} />
            <Button variant="quiet" icon="redo" aria-label={`Redo (${mod}Shift+Z)`} title={`Redo (${mod}Shift+Z)`} disabled={!clip.canRedo} onClick={redo} />
            <Button onClick={onSave} disabled={!dirty} title={`Write the shots to the clip’s camera file (${mod}S)`}>Save</Button>
            <RenderButton progress={clip.rendering} onRender={onRender} label={upToDate ? 'Render again' : 'Render'} title="Save, then make the finished clip in out/" />
          </>
        )}
      </div>
    </header>
  );
}
