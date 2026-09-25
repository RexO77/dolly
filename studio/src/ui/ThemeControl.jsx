/**
 * Light, dark, or the system's choice (the default). Kept per person in
 * this browser, and applied before the first paint by `applyTheme()` in
 * main.jsx, so a reload never flashes the wrong theme.
 */
import { useState } from 'react';
import { Segmented } from './controls.jsx';

const KEY = 'dolly.theme';

export function storedTheme() {
  try {
    return localStorage.getItem(KEY) ?? 'system';
  } catch {
    return 'system';
  }
}

/** Set the theme on <html>, holding every transition for a frame so the switch is one clean cut. */
export function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.add('no-motion');
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
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
      options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
    />
  );
}
