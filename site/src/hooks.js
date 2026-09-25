import { useEffect, useRef, useState } from 'react';
import { sound } from '../../studio/src/ui/sound.js';

/** A file in public/, under the site's base path. */
export const asset = (file) => `${import.meta.env.BASE_URL}${file}`;
/** A file in public/media. */
export const media = (file) => asset(`media/${file}`);

const query = '(prefers-reduced-motion: reduce)';

/** Whether the visitor asked for less motion, kept in step with the setting. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Copy text, and say so for a moment. Returns [copied, copy]. */
export function useCopy(ms = 1500) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    sound.select();
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), ms);
  };
  return [copied, copy];
}

/**
 * A short sequence of stages, run on demand: `run()` steps through `times`
 * (ms after the press) and `stage` is how far it has got. Nothing moves
 * until the visitor asks, and reduced motion jumps straight to the end.
 */
export function useSequence(times, { reduced, initial = 0 } = {}) {
  const [stage, setStage] = useState(initial);
  const [running, setRunning] = useState(false);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const run = () => {
    timers.current.forEach(clearTimeout);
    if (reduced) {
      setStage(times.length);
      return;
    }
    setStage(0);
    setRunning(true);
    timers.current = times.map((t, i) => setTimeout(() => {
      setStage(i + 1);
      if (i === times.length - 1) setRunning(false);
    }, t));
  };
  return { stage, run, running };
}

/**
 * Sound on the site is the visitor's choice, and off until they make it.
 * The Studio's sounds default to on, so the site reads the same stored
 * choice but treats "never chosen" as off.
 */
export function initSound() {
  try {
    sound.enabled = localStorage.getItem('dolly.sound') === 'on';
  } catch {
    sound.enabled = false;
  }
}

/** Whether sound is on, kept in step with every toggle on the page. */
export function useSoundOn() {
  const [on, setOn] = useState(sound.enabled);
  useEffect(() => sound.on(setOn), []);
  return on;
}

const THEME = 'dolly.theme';

/** Night unless the visitor picked Light: the same choice, and key, as the Studio's. */
export function storedTheme() {
  try {
    return localStorage.getItem(THEME) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function useTheme() {
  const [theme, setTheme] = useState(storedTheme);
  const choose = (next) => {
    const root = document.documentElement;
    /* Hold every transition for a frame, so the switch is one clean cut. */
    root.classList.add('no-motion');
    root.dataset.theme = next;
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('no-motion')));
    try {
      localStorage.setItem(THEME, next);
    } catch {
      /* A private window: the choice lasts until the tab closes. */
    }
    setTheme(next);
  };
  return [theme, choose];
}
