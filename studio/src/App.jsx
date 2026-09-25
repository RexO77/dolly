/**
 * The Studio: the home screen (every clip and its next step) or the editor
 * for one clip, by the URL. The library keeps every clip that has been
 * opened, so moving between the two never loses an edit.
 */
import { useEffect, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { useRoute, useVersion } from './hooks.js';
import { Home } from './parts/Home.jsx';
import { Editor } from './parts/Editor.jsx';

/** Closing the tab with edits that are not saved asks first. */
function useUnsavedGuard(library) {
  useEffect(() => {
    const guard = (e) => {
      if (library.dirty) e.preventDefault();
    };
    addEventListener('beforeunload', guard);
    return () => removeEventListener('beforeunload', guard);
  }, [library]);
}

export function App({ library }) {
  const [clip, go] = useRoute();
  const [error, setError] = useState(null);
  useVersion(library);
  useUnsavedGuard(library);
  useEffect(() => {
    library.refresh().catch((e) => setError(e.message));
  }, [library]);

  if (error) {
    return (
      <div className="page-message">
        <h2>The Studio could not read this project</h2>
        <p>{error}</p>
      </div>
    );
  }
  if (!library.project) return <div className="page-message"><p>Opening the project…</p></div>;

  return (
    <MotionConfig reducedMotion="user">
      {clip ? <Editor key={clip} library={library} name={clip} onHome={() => go(null)} /> : <Home library={library} onOpen={go} />}
    </MotionConfig>
  );
}
