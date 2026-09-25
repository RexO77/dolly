import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { Library } from './model/library.js';
import { applyTheme, storedTheme } from './ui/ThemeControl.jsx';
import './styles/tokens.css';
import './styles/studio.css';

applyTheme(storedTheme());
const library = new Library();
const root = createRoot(document.getElementById('root'));

/* PROTO: three visual directions behind a picker, in development only (the built Studio never has it).
 * Once one is chosen: replace this block with `root.render(<App library={library} />);`, delete
 * studio/src/proto/, and fold the chosen direction into tokens.css and studio.css. */
if (import.meta.env.DEV) {
  const { Directions } = await import('./proto/Directions.jsx');
  root.render(<Directions>{(key) => <App key={key} library={library} />}</Directions>);
} else {
  root.render(<App library={library} />);
}
/* /PROTO */
