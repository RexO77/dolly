/**
 * Dark (the default: Night), light, or the system's choice. Kept per person in
 * this browser, and applied before the first paint by `applyTheme()` in
 * main.jsx, so a reload never flashes the wrong theme.
 */
import { useState } from 'react';
import { Segmented } from './controls.jsx';

const KEY = 'dolly.theme';

export function storedTheme() {
  try {
    return localStorage.getItem(KEY) ?? 'dark';
  } catch {
    return 'dark';
  }
}

/** Set the theme on <html>, holding every transition for a frame so the switch is one clean cut. */
export function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.add('no-motion');
  root.dataset.theme = theme;
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('no-motion')));
}

export function ThemeControl() {
  const [theme, setTheme] = useState(storedTheme);
  const choose = (next) => {
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* No storage in a private window: the choice holds until the tab closes. */
    }
  };
  return (
    <Segmented
      size="s"
      label="Theme"
      value={theme}
      onChange={choose}
      options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]}
    />
  );
}
