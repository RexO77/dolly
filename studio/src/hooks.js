import { useCallback, useEffect, useReducer, useState } from 'react';

/** Re-render whenever something that emits (a clip, the library) changes. */
export function useVersion(source) {
  const [, bump] = useReducer((n) => n + 1, 0);
  useEffect(() => source?.on(bump), [source]);
  return source?.version ?? 0;
}

/** The transport's clock, for the few components that follow the playhead. */
export function useTime(transport) {
  const [t, setT] = useState(transport?.t ?? 0);
  useEffect(() => transport?.on(setT), [transport]);
  return t;
}

/**
 * The playhead and the frame the video has ready. A seek moves the clock
 * first and lands on its frame a moment later, so a picture follows both.
 */
export function usePicture(transport) {
  const [state, setState] = useState({ t: transport.t, frame: transport.frame });
  useEffect(() => transport.on(() => setState((s) => (s.t === transport.t && s.frame === transport.frame ? s : { t: transport.t, frame: transport.frame }))), [transport]);
  return state;
}

/** Whether the transport is playing, and at what rate. */
export function usePlayback(transport) {
  const [state, setState] = useState({ playing: false, rate: 1 });
  useEffect(() => transport?.on(() => setState((s) => (s.playing === transport.playing && s.rate === transport.rate ? s : { playing: transport.playing, rate: transport.rate }))), [transport]);
  return state;
}

/**
 * Which screen is open: `?clip=<name>` is the editor for that clip, no clip
 * is the home screen. Going between them is a history step, so Back works.
 */
export function useRoute() {
  const read = () => new URLSearchParams(location.search).get('clip');
  const [clip, setClip] = useState(read);
  useEffect(() => {
    const onPop = () => setClip(read());
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  const go = useCallback((name) => {
    const url = new URL(location.href);
    if (name) url.searchParams.set('clip', name);
    else url.searchParams.delete('clip');
    history.pushState(null, '', url);
    setClip(name);
  }, []);
  return [clip, go];
}

/** The playhead's time, the way the Studio writes every time. */
export const fmt = (t) => t.toFixed(2);
export const cx = (...names) => names.filter(Boolean).join(' ');
const isMac = /Mac/.test(navigator.platform);
/** The modifier key as this OS writes it, ready to go before a key: `⌘S` or `Ctrl+S`. */
export const mod = isMac ? '⌘' : 'Ctrl+';
