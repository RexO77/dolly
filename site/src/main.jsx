import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
/* One brand: the Studio's type and tokens, bundled so the page never waits on a font service. */
import '@fontsource-variable/hanken-grotesk/wght.css';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import '../../studio/src/styles/tokens.css';
import './styles.css';
import { sound } from '../../studio/src/ui/sound.js';
import { App } from './App.jsx';

/* The landing page is silent: the Studio's sounds live in the Studio and its docs. */
sound.enabled = false;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
