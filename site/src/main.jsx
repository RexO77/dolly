import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
/* One brand: the Studio's type and tokens, bundled so the page never waits on a font service. */
import '@fontsource-variable/hanken-grotesk/wght.css';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import '../../studio/src/styles/tokens.css';
import './styles.css';
import { initSound } from './hooks.js';
import { App } from './App.jsx';

initSound();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
