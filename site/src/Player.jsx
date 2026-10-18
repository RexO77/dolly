/**
 * A demo's playback, the way a video player does it: the controls sit on
 * the picture, in a bar along its bottom edge over a soft dark fade. The
 * bar is there while paused, fades a moment after play starts, and comes
 * back on hover or focus. On touch, and for reduced motion, it stays.
 */
import { useEffect, useRef, useState } from 'react';
import { Icon } from './parts.jsx';
import { useReducedMotion } from './hooks.js';

const IDLE_MS = 1400; // how long the bar lingers after play starts, or after the pointer stops

/**
 * A clock from 0 to `T` seconds. `play()` runs it (from the start once it
 * has finished), `pause()` holds it, `seek(t)` moves it. With reduced
 * motion, play jumps straight to `still` instead of running.
 */
export function useClock(T, { still = T, initial = 0 } = {}) {
  const reduced = useReducedMotion();
  const [t, setT] = useState(initial);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);
  const live = useRef(t);
  live.current = t;
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const pause = () => {
    cancelAnimationFrame(raf.current);
    setPlaying(false);
  };
  const play = () => {
    cancelAnimationFrame(raf.current);
    if (reduced) {
      setT(still);
      return;
    }
    const from = live.current >= T - 1e-3 ? 0 : live.current;
    const began = performance.now() - from * 1000;
    setPlaying(true);
    const tick = (now) => {
      const next = Math.min(T, (now - began) / 1000);
      setT(next);
      if (next < T) raf.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf.current = requestAnimationFrame(tick);
  };
  const seek = (to) => {
    pause();
    setT(Math.max(0, Math.min(T, to)));
  };
  return { t, T, playing, play, pause, toggle: () => (playing ? pause() : play()), seek };
}

/** Whether the bar should rest: playing, and nobody near it for a moment. */
export function useIdle(playing) {
  const [idle, setIdle] = useState(false);
  const timer = useRef(0);
  const wake = () => {
    setIdle(false);
    clearTimeout(timer.current);
    if (playing) timer.current = setTimeout(() => setIdle(true), IDLE_MS);
  };
  useEffect(() => {
    wake();
    return () => clearTimeout(timer.current);
  }, [playing]);
  return [idle && playing, wake];
}

export const clock = (t) => `${t.toFixed(2)}s`;

export function PlayButton({ playing, onClick, label = 'the demo' }) {
  return (
    <button type="button" className="pb-play" aria-label={playing ? `Pause ${label}` : `Play ${label}`} onClick={onClick}>
      <Icon name={playing ? 'pause' : 'play'} />
    </button>
  );
}

/**
 * The player: `children` is the picture; the bar holds play, a scrub line
 * (`line`, drawn in a 0 to 1 box, or a plain progress line) with its
 * playhead, and a readout on the right.
 */
export function Player({ clock: c, label, line, level, readout, marks = [], children, className = '' }) {
  const [idle, wake] = useIdle(c.playing);
  const scrub = useRef(null);
  const dragging = useRef(false);
  const at = (clientX) => {
    const r = scrub.current.getBoundingClientRect();
    return (Math.max(0, Math.min(1, (clientX - r.left) / r.width))) * c.T;
  };
  const u = c.T ? c.t / c.T : 0;
  return (
    <div className={`player ${className}`} data-idle={idle || undefined} onPointerMove={wake} onFocus={wake}>
      {children}
      <div className="pb">
        <PlayButton playing={c.playing} onClick={c.toggle} label={label} />
        <div
          ref={scrub}
          className="pb-scrub"
          role="slider"
          tabIndex={0}
          aria-label={`Time in ${label}`}
          aria-valuemin={0}
          aria-valuemax={Number(c.T.toFixed(2))}
          aria-valuenow={Number(c.t.toFixed(2))}
          aria-valuetext={`${c.t.toFixed(1)} of ${c.T.toFixed(1)} seconds`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            dragging.current = true;
            c.seek(at(e.clientX));
          }}
          onPointerMove={(e) => dragging.current && c.seek(at(e.clientX))}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
          onKeyDown={(e) => {
            const d = { ArrowRight: 0.25, ArrowLeft: -0.25, ArrowUp: 0.25, ArrowDown: -0.25 }[e.key];
            if (d) {
              e.preventDefault();
              c.seek(c.t + d);
            } else if (e.key === 'Home' || e.key === 'End') {
              e.preventDefault();
              c.seek(e.key === 'Home' ? 0 : c.T);
            } else if (e.key === ' ' || e.key === 'k') {
              e.preventDefault();
              c.toggle();
            }
          }}
        >
          <svg viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
            {line ? (
              <polyline className="pb-line" points={line} />
            ) : (
              <>
                <line className="pb-line" x1="0" x2="100" y1="10" y2="10" />
                <line className="pb-done" x1="0" x2={u * 100} y1="10" y2="10" />
              </>
            )}
          </svg>
          {marks.map((m) => <span key={m} className="pb-mark" style={{ left: `${(m / c.T) * 100}%` }} aria-hidden="true" />)}
          <span className="pb-head" style={{ left: `${u * 100}%`, ...(level !== undefined ? { top: `${10 + 17 - Math.max(0, Math.min(1, level)) * 14}px` } : {}) }} aria-hidden="true" />
        </div>
        <span className="pb-read">{readout}</span>
      </div>
    </div>
  );
}

/** A curve for the scrub line: `f(t)` in 0 to 1 over `T` seconds, as polyline points in the bar's 100 x 20 box. */
export function scrubLine(f, T, n = 120) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = (i / n) * T;
    return `${((i / n) * 100).toFixed(2)},${(17 - Math.max(0, Math.min(1, f(t))) * 14).toFixed(2)}`;
  }).join(' ');
}

/* A rendered video reads like one: minutes and seconds, nothing finer. */
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/* Only one video plays at a time: pressing play on one pauses the rest. */
const PLAYING = 'dolly:video-play';

/**
 * A rendered video in the same player: the bar on the picture, a scrub line
 * that fills as it plays, and, for a video with sound, a mute switch. It
 * never starts on its own; it starts muted, pauses off screen and in a
 * hidden tab, and stops on its last frame.
 */
export function VideoPlayer({ src, poster, label, width, height, duration = 0, sound = false, className = '' }) {
  const video = useRef(null);
  const scrub = useRef(null);
  const dragging = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(true);
  const [t, setT] = useState(0);
  const [T, setTotal] = useState(duration);
  const [idle, wake] = useIdle(playing);
  useEffect(() => {
    video.current.muted = muted;
  }, [muted]);

  /* The playhead follows every frame while playing, not the browser's four-a-second timeupdate. */
  useEffect(() => {
    if (!playing) return undefined;
    let raf;
    const tick = () => {
      setT(video.current.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => {
    const v = video.current;
    const onOther = (e) => e.detail !== v && v.pause();
    const io = new IntersectionObserver(([e]) => !e.isIntersecting && v.pause());
    const onVis = () => document.hidden && v.pause();
    addEventListener(PLAYING, onOther);
    io.observe(v);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      removeEventListener(PLAYING, onOther);
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const toggle = () => {
    const v = video.current;
    if (v.paused) v.play().catch(() => setPlaying(false));
    else v.pause();
  };
  const seek = (to) => {
    const v = video.current;
    const d = v.duration || T;
    if (!d) return;
    v.currentTime = Math.max(0, Math.min(d, to));
    setT(v.currentTime);
  };
  const at = (clientX) => {
    const r = scrub.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * T;
  };
  const u = T ? t / T : 0;

  return (
    <div className={`player ${className}`} data-idle={idle || undefined} onPointerMove={wake} onFocus={wake}>
      <div className="screen">
        <video
          ref={video}
          src={src}
          poster={poster}
          width={width}
          height={height}
          muted={muted}
          playsInline
          preload="none"
          aria-label={label}
          onClick={toggle}
          onPlay={() => {
            setPlaying(true);
            setStarted(true);
            dispatchEvent(new CustomEvent(PLAYING, { detail: video.current }));
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onLoadedMetadata={(e) => setTotal(e.currentTarget.duration)}
          onSeeked={(e) => setT(e.currentTarget.currentTime)}
        />
        {!started && (
          <button type="button" className="big-play" aria-label={`Play ${label}`} onClick={toggle}>
            <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor" /></svg>
          </button>
        )}
      </div>
      <div className="pb">
        <PlayButton playing={playing} onClick={toggle} label={label} />
        <div
          ref={scrub}
          className="pb-scrub"
          role="slider"
          tabIndex={0}
          aria-label={`Time in ${label}`}
          aria-valuemin={0}
          aria-valuemax={Number(T.toFixed(2))}
          aria-valuenow={Number(t.toFixed(2))}
          aria-valuetext={`${t.toFixed(1)} of ${T.toFixed(1)} seconds`}
          onPointerDown={(e) => {
            if (!T) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            dragging.current = true;
            seek(at(e.clientX));
          }}
          onPointerMove={(e) => dragging.current && seek(at(e.clientX))}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
          onKeyDown={(e) => {
            const d = { ArrowRight: 1, ArrowLeft: -1, ArrowUp: 1, ArrowDown: -1 }[e.key];
            if (d) {
              e.preventDefault();
              seek(t + d);
            } else if (e.key === 'Home' || e.key === 'End') {
              e.preventDefault();
              seek(e.key === 'Home' ? 0 : T);
            } else if (e.key === ' ' || e.key === 'k') {
              e.preventDefault();
              toggle();
            }
          }}
        >
          <svg viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
            <line className="pb-line" x1="0" x2="100" y1="10" y2="10" />
            <line className="pb-done" x1="0" x2={u * 100} y1="10" y2="10" />
          </svg>
          <span className="pb-head" style={{ left: `${u * 100}%` }} aria-hidden="true" />
        </div>
        <span className="pb-read">{mmss(t)}<span className="total"> / {mmss(T)}</span></span>
        {sound && (
          <button type="button" className="pb-play pb-sound" aria-pressed={!muted} aria-label={muted ? `Turn on the sound of ${label}` : `Mute ${label}`} onClick={() => setMuted((m) => !m)}>
            <Icon name={muted ? 'mute' : 'sound'} />
          </button>
        )}
      </div>
    </div>
  );
}
