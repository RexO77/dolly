import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { Library } from './model/library.js';
import { applyTheme, storedTheme } from './ui/ThemeControl.jsx';
/* The type ships with the Studio, so it looks the same offline. */
import '@fontsource-variable/hanken-grotesk/wght.css';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import './styles/tokens.css';
import './styles/studio.css';

applyTheme(storedTheme());
const library = new Library();
const root = createRoot(document.getElementById('root'));

root.render(<App library={library} />);
