/**
 * The home screen: every clip in the project with its poster, where it
 * stands and the one thing to do next, under a short explanation of the
 * three steps that stays out of the way once dismissed.
 */
import { useEffect, useState } from 'react';
import { STEPS, summaryOf } from '../model/project.js';
import { useVersion } from '../hooks.js';
import { Command } from '../ui/Command.jsx';
import { ThemeControl } from '../ui/ThemeControl.jsx';
import { ClipRow } from './ClipRow.jsx';

const INTRO_KEY = 'dolly.intro-seen';

function useIntro() {
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(INTRO_KEY) === '1';
    } catch {
      return false;
    }
  });
  const set = (value) => {
    setSeen(value);
    try {
      localStorage.setItem(INTRO_KEY, value ? '1' : '0');
    } catch {
      /* A private window keeps no storage; the intro just shows again next time. */
    }
  };
  return [seen, set];
}

function HowItWorks({ onDone }) {
  return (
    <section className="well intro" aria-labelledby="intro-title">
      <div className="intro-head">
        <h2 id="intro-title">Film it, direct it, render it. That is the whole job.</h2>
        <button type="button" className="link" onClick={onDone}>Got it</button>
      </div>
      <ol className="tiles intro-steps">
        {STEPS.map((step, i) => (
          <li key={step.key} className="intro-step">
            <h3><span>{String(i + 1).padStart(2, '0')}</span>{step.label}</h3>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function NoClips({ project }) {
  return (
    <div className="empty">
      <h2>No clips yet</h2>
      <p>A clip starts as a scenario: a short script of what the hand does on the page. Put one in <code>projects/{project.name}/scenarios/</code>, then record it.</p>
      <Command text={`dolly record ${project.alias ?? project.name} <clip>`} />
    </div>
  );
}

export function Home({ library, onOpen }) {
  useVersion(library);
  const [introSeen, setIntroSeen] = useIntro();
  const { project } = library;

  /* What is on disk changes from the terminal (a new take, a render), so read it again whenever the Studio comes back into view. */
  useEffect(() => {
    const again = () => document.visibilityState === 'visible' && library.refresh();
    addEventListener('focus', again);
    document.addEventListener('visibilitychange', again);
    return () => {
      removeEventListener('focus', again);
      document.removeEventListener('visibilitychange', again);
    };
  }, [library]);

  /* Open every recorded clip in the background, so each row can say how many shots it has and whether anything needs a look. */
  useEffect(() => {
    for (const c of project.clips) if (c.status.master) library.open(c.name).catch(() => {});
  }, [library, project]);

  const stages = project.clips.map((c) => library.stage(c.name));

  return (
    <div className="home">
      <div className="home-inner">
        <header className="topline">
          <span className="brand"><span className="brand-mark" aria-hidden="true" />Dolly <span className="crumb">Studio</span></span>
          {introSeen && <button type="button" className="link" onClick={() => setIntroSeen(false)}>How it works</button>}
        </header>

        <section className="home-head">
          <h1>{project.name}</h1>
          <p>{project.clips.length ? `${summaryOf(stages)}.` : 'Nothing here yet.'}</p>
        </section>

        {!introSeen && <HowItWorks onDone={() => setIntroSeen(true)} />}

        <section aria-labelledby="clips-title">
          <div className="clips-head">
            <h2 id="clips-title">Clips</h2>
          </div>
          <div className="well">
            {project.clips.length ? (
              <ol className="tiles">
                {project.clips.map((c, i) => <ClipRow key={c.name} library={library} summary={c} stage={stages[i]} onOpen={onOpen} />)}
              </ol>
            ) : <NoClips project={project} />}
          </div>
        </section>

        <footer className="home-foot">
          <span>Workspace <code>{project.workspace}</code></span>
          <ThemeControl />
        </footer>
      </div>
    </div>
  );
}
