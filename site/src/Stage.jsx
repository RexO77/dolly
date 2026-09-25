/**
 * The hero: the real take of Wrenly, played through Dolly's camera live in
 * a canvas. The visitor can see the raw take, or direct it: roll the lens
 * to lean further or less, change the feel of the moves, turn the wash off,
 * or frame it as a card on a background. Every frame is the renderer's own
 * maths (camera.js), so what plays here is what would render.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Lens } from '../../studio/src/ui/Lens.jsx';
import { direct, drawFrame, shotAt, FEELS, LEAN_Z, BACKDROPS } from './camera.js';
import { useReducedMotion, media } from './hooks.js';
import { Cart, Seg, Switch } from './parts.jsx';
import { PlayButton, useIdle } from './Player.jsx';

const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;

function words(seg, raw) {
  if (raw) return 'the raw take, as recorded';
  if (!seg) return '';
  return seg.what.replace('list', 'the list').replace('issue', 'the issue');
}

export function Curve({ feel }) {
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

/** A background to frame the clip on, as a swatch of its own gradient. */
export function Backdrops({ value, onChange, label = 'Background' }) {
  const options = Object.fromEntries(Object.entries(BACKDROPS).map(([k, b]) => [k, (
    <>
      <span className="swatch" style={{ background: `linear-gradient(135deg, rgb(${b.from.join(' ')}), rgb(${b.to.join(' ')}))` }} aria-hidden="true" />
      {k}
    </>
  )]));
  return <Seg label={label} value={value} onChange={onChange} options={options} className="backdrops" />;
}

export function Stage({ tour, sharpMax }) {
  const reduced = useReducedMotion();
  const [mode, setMode] = useState('directed');
  const [lean, setLean] = useState(LEAN_Z);
  const [feel, setFeel] = useState('spring');
  const [wash, setWash] = useState(false); // off until the visitor asks: the lean carries the eye on its own
  const [framed, setFramed] = useState(false);
  const [backdrop, setBackdrop] = useState('dusk');
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

  const direction = useMemo(() => direct(tour, { lean, feel, wash, frame: framed ? { background: backdrop, window: true } : null }), [tour, lean, feel, wash, framed, backdrop]);
  const spec = mode === 'directed' ? direction.spec : null;
  const live = useRef({ spec, look: direction.look, segs: direction.segments });
  live.current = { spec, look: direction.look, segs: direction.segments };
  const length = tour.master.duration;

  /* Autoplay unless the visitor asked for less motion: then it waits for a press. */
  useEffect(() => setPlaying(!reduced), [reduced]);

  const draw = (t) => {
    const c = canvas.current;
    const v = video.current;
    if (!c || !v || v.readyState < 2) return;
    const { spec: s, look, segs } = live.current;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const view = drawFrame(ctx, v, tour, s, look, t, c.width, c.height);
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
  }, [spec, direction]);

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

  const [idle, wake] = useIdle(Boolean(playing));
  const lit = direction.segments.filter((s) => s.kind !== 'hold' || s.z > 1.0001);
  const soft = mode === 'directed' && lean > sharpMax + 1e-6;

  let note = 'The camera leans in, holds still while the product changes, and pulls back. Roll the lens, or turn on the wash.';
  if (mode === 'raw') note = 'What Dolly recorded: the whole screen, no cursor, no camera. Switch to Directed to see what the camera does with it.';
  else if (soft) note = `Past ${sharpMax.toFixed(2)}× the take runs out of real pixels, so text goes soft. The Studio would tell you, and offer to cap it.`;
  else if (lean <= 1.0005) note = wash ? 'Rolled all the way out: no lean, so the wash alone has to carry the eye.' : 'Rolled all the way out: no lean and no wash, so nothing points at the change. Try the wash.';
  else if (feel === 'bouncy') note = 'A bouncy spring overshoots, then corrects. The grammar never does: the camera arrives once and stays.';
  else if (framed) note = 'Framed: the clip sits on a background as a card, and grows to fill the screen as the camera leans in.';
  else if (wash) note = 'The wash: a warm veil over everything but the change, so the eye goes straight to it.';
  else if (Math.abs(lean - LEAN_Z) > 0.005) note = `Leaning to ${lean.toFixed(2)}×. Dolly's own is ${LEAN_Z}×, and the lens clicks into it.`;

  return (
    <div className="stage" role="region" aria-label="A live clip of a demo product, directed by Dolly">
      <div className="stage-bar">
        <p className="readout" aria-hidden="true">
          <span className="shot" ref={readShot}>shot 1</span>
          <span className="what" ref={readWhat}>hold wide</span>
        </p>
        <span className="readout"><span className="z" ref={readZ} aria-hidden="true">1.00×</span></span>
      </div>

      <div className="viewport">
        {/* The footage lights the room: a blurred copy of the take glows on the dark around it. */}
        <img className="ambient" src={media('take.webp')} alt="" aria-hidden="true" />
        <div className="frame player" ref={frameBox} data-idle={idle || undefined} onPointerMove={wake} onFocus={wake}>
          <img className="poster" src={media('take.webp')} alt="" width="1600" height="1000" hidden={ready} />
          <canvas ref={canvas} role="img" aria-label="Wrenly, a project tracker: the list filters to two issues, then one is opened and marked done" />
          {playing === false && ready && !started && (
            <button type="button" className="big-play" aria-label="Play the clip" onClick={() => setPlaying(true)}>
              <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor" /></svg>
            </button>
          )}
          <video ref={video} src={media('take.mp4')} poster={media('take.webp')} muted playsInline loop preload="auto" hidden />
          <div className="pb hero-pb">
            <PlayButton playing={Boolean(playing)} onClick={() => setPlaying((p) => !p)} label="the clip" />
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
            <span className="pb-read"><span ref={readTime}>00:00.00</span><span className="total"> / {fmt(length)}</span></span>
          </div>
        </div>
      </div>

      <div className="controls">
        <div className="control mode">
          <Seg label="What you see" value={mode} onChange={setMode} options={{ raw: 'Raw take', directed: 'Directed by Dolly' }} className="mode" />
        </div>
        <div className="control lean">
          <span className="control-label" id="lean-label">Lean</span>
          <Lens value={lean} onChange={(z) => directing(setLean)(z)} max={2} sharpMax={sharpMax} width={208} label="How far the camera leans in" />
        </div>
        <div className="control feel-control">
          <span className="control-label">Move</span>
          <Seg
            label="How the camera moves"
            value={feel}
            onChange={directing(setFeel)}
            className="feel"
            options={Object.fromEntries(Object.entries(FEELS).map(([k, f]) => [k, <><Curve feel={k} />{f.label}</>]))}
          />
        </div>
        <div className="control toggles">
          <Switch on={wash} onChange={directing(setWash)}>Wash</Switch>
          <Switch on={framed} onChange={directing(setFramed)}>Frame it</Switch>
        </div>
        {framed && (
          <div className="control frame-control">
            <span className="control-label">On</span>
            <Backdrops value={backdrop} onChange={directing(setBackdrop)} />
          </div>
        )}
      </div>
      <p className={`note${soft ? ' warn' : ''}`} aria-live="polite">{note}</p>
    </div>
  );
}
