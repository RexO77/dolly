/**
 * The hero: the real take of Wrenly, played through Dolly's camera live in
 * a canvas. The visitor can see the raw take, or direct it: lean further or
 * less, change the feel of the moves, turn the wash off. Every frame is the
 * renderer's own maths (camera.js), so what plays here is what would render.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { direct, drawFrame, shotAt, FEELS, LEAN_Z } from './camera.js';
import { useReducedMotion, media } from './hooks.js';
import { Cart } from './parts.jsx';

const LEAN = { min: 1.1, max: 1.6, step: 0.01 }; // the lean slider's range; the grammar's 1.35 is its detent
const SOFT = LEAN_Z * 1.1; // past this, checkSpec warns that text softens

const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;

function words(seg, raw) {
  if (raw) return 'the raw take, as recorded';
  if (!seg) return '';
  return seg.what.replace('list', 'the list').replace('issue', 'the issue');
}

function Curve({ feel }) {
  const f = FEELS[feel].curve;
  const pts = Array.from({ length: 25 }, (_, i) => {
    const u = i / 24;
    return `${(2 + u * 16).toFixed(2)},${(16 - f(u) * 12).toFixed(2)}`;
  }).join(' ');
  return (
    <svg width="20" height="18" viewBox="0 0 20 18" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Seg({ label, value, options, onChange, className = '' }) {
  const refs = useRef([]);
  const keys = Object.keys(options);
  const onKey = (e) => {
    const i = keys.indexOf(value);
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const next = keys[(i + d + keys.length) % keys.length];
    onChange(next);
    refs.current[keys.indexOf(next)]?.focus();
  };
  return (
    <div className={`seg ${className}`} role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {keys.map((k, i) => (
        <button
          key={k}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          role="radio"
          data-value={k}
          aria-checked={value === k}
          tabIndex={value === k ? 0 : -1}
          onClick={() => onChange(k)}
        >
          {options[k]}
        </button>
      ))}
    </div>
  );
}

export function Stage({ tour }) {
  const reduced = useReducedMotion();
  const [mode, setMode] = useState('directed');
  const [lean, setLean] = useState(LEAN_Z);
  const [feel, setFeel] = useState('spring');
  const [wash, setWash] = useState(true);
  const [playing, setPlaying] = useState(null);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);

  const video = useRef(null);
  const canvas = useRef(null);
  const frameBox = useRef(null);
  const trackRef = useRef(null);
  const cart = useRef(null);
  const readShot = useRef(null);
  const readWhat = useRef(null);
  const readZ = useRef(null);
  const readTime = useRef(null);
  const visible = useRef(true);
  const scrubbing = useRef(false);

  const direction = useMemo(() => direct(tour, { lean, feel, wash }), [tour, lean, feel, wash]);
  const spec = mode === 'directed' ? direction.spec : null;
  const live = useRef({ spec, segs: direction.segments });
  live.current = { spec, segs: direction.segments };
  const length = tour.master.duration;

  /* Autoplay unless the visitor asked for less motion: then it waits for a press. */
  useEffect(() => setPlaying(!reduced), [reduced]);

  const draw = (t) => {
    const c = canvas.current;
    const v = video.current;
    if (!c || !v || v.readyState < 2) return;
    const { spec: s, segs } = live.current;
    const view = drawFrame(c.getContext('2d'), v, tour, s, t, c.width, c.height);
    const { n, seg } = shotAt(segs, t);
    if (readShot.current) readShot.current.textContent = s ? `shot ${n}/${segs.length}` : 'no camera';
    if (readWhat.current) readWhat.current.textContent = words(seg, !s);
    if (readZ.current) readZ.current.textContent = `${view[2].toFixed(2)}×`;
    if (readTime.current) readTime.current.textContent = fmt(Math.min(t, length));
    if (cart.current) cart.current.style.transform = `translateX(${(Math.min(t, length) / length) * (trackRef.current?.clientWidth ?? 0)}px)`;
    trackRef.current?.setAttribute('aria-valuenow', t.toFixed(2));
    trackRef.current?.setAttribute('aria-valuetext', `${t.toFixed(1)} seconds`);
  };
  const drawRef = useRef(draw);
  drawRef.current = draw;

  /* Canvas at the frame's device pixels, no bigger than the proxy. */
  useLayoutEffect(() => {
    const el = frameBox.current;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.min(tour.proxy.width, Math.round(e.contentRect.width * devicePixelRatio));
      const h = Math.round((w * tour.proxy.height) / tour.proxy.width);
      const c = canvas.current;
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      drawRef.current(video.current.currentTime);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [tour]);

  /* One draw per decoded frame: the camera moves at the take's 30fps, like the render. */
  useEffect(() => {
    const v = video.current;
    let handle;
    let raf;
    const onFrame = (_now, meta) => {
      drawRef.current(meta?.mediaTime ?? v.currentTime);
      handle = v.requestVideoFrameCallback(onFrame);
    };
    const tick = () => {
      drawRef.current(v.currentTime);
      raf = requestAnimationFrame(tick);
    };
    if ('requestVideoFrameCallback' in v) handle = v.requestVideoFrameCallback(onFrame);
    else raf = requestAnimationFrame(tick);
    const onReady = () => {
      setReady(true);
      drawRef.current(v.currentTime);
    };
    const onSeeked = () => drawRef.current(v.currentTime);
    v.addEventListener('loadeddata', onReady);
    v.addEventListener('seeked', onSeeked);
    if (v.readyState >= 2) onReady();
    return () => {
      if (handle) v.cancelVideoFrameCallback(handle);
      cancelAnimationFrame(raf);
      v.removeEventListener('loadeddata', onReady);
      v.removeEventListener('seeked', onSeeked);
    };
  }, []);

  /* A change of direction shows at once, even paused. */
  useEffect(() => {
    drawRef.current(video.current.currentTime);
  }, [spec]);

  /* Play only while the visitor wants it, the stage is on screen and the tab is showing. */
  const sync = () => {
    const v = video.current;
    const want = playing && visible.current && !document.hidden && !scrubbing.current;
    if (want && v.paused) v.play().catch(() => setPlaying(false));
    if (!want && !v.paused) v.pause();
  };
  const syncRef = useRef(sync);
  syncRef.current = sync;
  useEffect(() => sync());
  useEffect(() => {
    if (playing) setStarted(true);
  }, [playing]);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => {
      visible.current = e.isIntersecting;
      syncRef.current();
    });
    io.observe(frameBox.current);
    const onVis = () => syncRef.current();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  /* Scrubbing along the track. */
  const seekTo = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * length;
    video.current.currentTime = Math.min(t, length - 0.02);
    drawRef.current(t);
  };
  const onDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubbing.current = true;
    sync();
    seekTo(e.clientX);
  };
  const onMove = (e) => scrubbing.current && seekTo(e.clientX);
  const onUp = () => {
    scrubbing.current = false;
    sync();
  };
  const onTrackKey = (e) => {
    const v = video.current;
    const d = { ArrowRight: 0.5, ArrowLeft: -0.5, PageUp: 2, PageDown: -2 }[e.key];
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      v.currentTime = e.key === 'Home' ? 0 : length - 0.05;
    } else if (d) {
      e.preventDefault();
      v.currentTime = Math.max(0, Math.min(length - 0.05, v.currentTime + d));
    } else if (e.key === ' ') {
      e.preventDefault();
      setPlaying((p) => !p);
    }
  };

  const directing = (fn) => (value) => {
    setMode('directed');
    fn(value);
  };

  const lit = direction.segments.filter((s) => s.kind !== 'hold' || s.z > 1.0001);
  const fill = ((lean - LEAN.min) / (LEAN.max - LEAN.min)) * 100;
  const detent = ((LEAN_Z - LEAN.min) / (LEAN.max - LEAN.min)) * 100;
  const soft = mode === 'directed' && lean > SOFT;

  let note = 'The camera leans in, holds still while the product changes, and pulls back. Try the controls.';
  if (mode === 'raw') note = 'What Dolly recorded: the whole screen, no cursor, no camera. Switch to directed to see what the camera does with it.';
  else if (soft) note = `Past ${SOFT.toFixed(2)}× the render warns you: text goes soft and the product loses its context.`;
  else if (feel === 'bouncy') note = 'A bouncy spring overshoots, then corrects. The grammar never does: the camera arrives once and stays.';
  else if (!wash) note = 'No wash: the lean alone has to carry the eye.';
  else if (Math.abs(lean - LEAN_Z) > 0.005) note = `Leaning to ${lean.toFixed(2)}×. Dolly's own direction is ${LEAN_Z}×: as far as a lean goes before text softens.`;

  return (
    <div className="stage" role="region" aria-label="A live clip of a demo product, directed by Dolly">
      <div className="stage-bar">
        <p className="readout" aria-hidden="true">
          <span className="shot" ref={readShot}>shot 1</span>
          <span className="what" ref={readWhat}>hold wide</span>
        </p>
        <span className="readout"><span className="z" ref={readZ} aria-hidden="true">1.00×</span></span>
      </div>

      <div className="frame" ref={frameBox}>
        <img src={media('take.webp')} alt="" width="1600" height="1000" hidden={ready} />
        <canvas ref={canvas} role="img" aria-label="Wrenly, a project tracker: the list filters to two issues, then one is opened and marked done" />
        {playing === false && ready && !started && (
          <button type="button" className="big-play" aria-label="Play the clip" onClick={() => setPlaying(true)}>
            <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor" /></svg>
          </button>
        )}
        <video ref={video} src={media('take.mp4')} poster={media('take.webp')} muted playsInline loop preload="auto" hidden />
      </div>

      <div className="track-row">
        <button type="button" className="play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((p) => !p)}>
          {playing ? (
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><rect x="4" y="3" width="3.2" height="12" rx="1" fill="currentColor" /><rect x="10.8" y="3" width="3.2" height="12" rx="1" fill="currentColor" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M5 3v12l10-6z" fill="currentColor" /></svg>
          )}
        </button>
        <div
          className="track"
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Time in the clip"
          aria-valuemin={0}
          aria-valuemax={length}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onTrackKey}
        >
          <div className="rails">
            <div className="sleepers" />
            {mode === 'directed' && lit.map((s) => (
              <span key={`${s.t0}-${s.kind}`} className={`lit${s.kind === 'hold' ? '' : ' move'}`} style={{ left: `${(s.t0 / length) * 100}%`, width: `${((s.t1 - s.t0) / length) * 100}%` }} />
            ))}
          </div>
          {Object.entries(tour.beats).map(([label, t]) => (
            <span key={label} className="beat" style={{ left: `${(t / length) * 100}%` }} title={label} />
          ))}
          <div className="cart" ref={cart}><Cart /></div>
        </div>
        <span className="time"><span ref={readTime}>00:00.00</span><span className="total"> / {fmt(length)}</span></span>
      </div>

      <div className="controls">
        <div className="control mode">
          <Seg label="What you see" value={mode} onChange={setMode} options={{ raw: 'Raw take', directed: 'Directed by Dolly' }} className="mode" />
        </div>
        <label className="control lean">
          <span className="control-label">Lean</span>
          <span className="lean-input">
            <input
              type="range"
              min={LEAN.min}
              max={LEAN.max}
              step={LEAN.step}
              value={lean}
              style={{ '--fill': `${fill}%` }}
              onChange={(e) => {
                const v = Number(e.target.value);
                directing(setLean)(Math.abs(v - LEAN_Z) < 0.015 ? LEAN_Z : v);
              }}
              aria-valuetext={`${lean.toFixed(2)} times`}
            />
            <span className="detent" style={{ left: `calc(10px + (100% - 20px) * ${detent / 100})` }} aria-hidden="true" />
          </span>
          <output>{lean.toFixed(2)}×</output>
        </label>
        <div className="control">
          <span className="control-label" id="feel-label">Move</span>
          <Seg
            label="How the camera moves"
            value={feel}
            onChange={directing(setFeel)}
            className="feel"
            options={Object.fromEntries(Object.entries(FEELS).map(([k, f]) => [k, <><Curve feel={k} />{f.label}</>]))}
          />
        </div>
        <button type="button" className="switch control" role="switch" aria-checked={wash} onClick={() => directing(setWash)(!wash)}>
          <span className="knob" aria-hidden="true" />
          Wash
        </button>
      </div>
      <p className={`note${soft ? ' warn' : ''}`} aria-live="polite">{note}</p>
    </div>
  );
}
