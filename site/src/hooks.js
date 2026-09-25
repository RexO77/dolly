import { useEffect, useRef, useState } from 'react';

/** A file in public/media, under the site's base path. */
export const media = (file) => `${import.meta.env.BASE_URL}media/${file}`;

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
export function useSequence(times, { reduced } = {}) {
  const [stage, setStage] = useState(0);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const run = () => {
    timers.current.forEach(clearTimeout);
    if (reduced) {
      setStage(times.length);
      return;
    }
    setStage(0);
    timers.current = times.map((t, i) => setTimeout(() => setStage(i + 1), t));
  };
  const reset = () => {
    timers.current.forEach(clearTimeout);
    setStage(0);
  };
  return { stage, run, reset, running: stage > 0 && stage < times.length };
}
