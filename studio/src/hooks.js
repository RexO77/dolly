import { useEffect, useReducer, useState } from 'react';

/** Re-render whenever the clip changes. */
export function useClipVersion(clip) {
  const [, bump] = useReducer((n) => n + 1, 0);
  useEffect(() => clip?.on(bump), [clip]);
  return clip?.version ?? 0;
}

/** The transport's clock, for the few components that follow the playhead. */
export function useTime(transport) {
  const [t, setT] = useState(transport?.t ?? 0);
  useEffect(() => transport?.on(setT), [transport]);
  return t;
}

/** Whether the transport is playing, and at what rate. */
export function usePlayback(transport) {
  const [state, setState] = useState({ playing: false, rate: 1 });
  useEffect(() => transport?.on(() => setState((s) => (s.playing === transport.playing && s.rate === transport.rate ? s : { playing: transport.playing, rate: transport.rate }))), [transport]);
  return state;
}

export const fmt = (t) => t.toFixed(2);
export const cx = (...names) => names.filter(Boolean).join(' ');
