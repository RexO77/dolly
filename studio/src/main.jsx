import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { Library } from './model/library.js';
import { applyTheme, storedTheme } from './ui/ThemeControl.jsx';
import './styles/tokens.css';
import './styles/studio.css';

applyTheme(storedTheme());
const library = new Library();
const root = createRoot(document.getElementById('root'));

root.render(<App library={library} />);
