/**
 * The picture. "Picture" is the clip as it will ship. "Frame" is the whole
 * screen with the selected shot's frame on it: drag inside the frame to
 * reframe the shot, drag a corner to lean in or out. "Render" plays the
 * rendered file, to compare.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { resolve } from '../model/clip.js';
import { drawDelivered, drawScreen } from '../model/picture.js';
import { useClipVersion, useTime, cx } from '../hooks.js';

export function Preview({ clip, transport, video, mode, shot, renderUrl }) {
  const box = useRef(null);
  const canvas = useRef(null);
  const rendered = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [frame, setFrame] = useState(null);
  const version = useClipVersion(clip);
  const t = useTime(transport);

  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  /* The canvas is the delivered size in Picture view (so what you see is the render's own pixels, scaled), the box's size in Frame view. */
  const { width: OW, height: OH } = clip.info.output;
  const fit = Math.min(size.w / OW, size.h / OH) || 0;
  const cssW = Math.floor(OW * fit);
  const cssH = Math.floor(OH * fit);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !cssW || video.readyState < 2) return;
    const dpr = devicePixelRatio;
    if (mode === 'frame') {
      const w = Math.round(size.w * dpr);
      const h = Math.round(size.h * dpr);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const ctx = c.getContext('2d');
      const target = shot ? resolve(clip.spec.camera[clip.keyIndex(shot.id)]) : clip.view(t);
      const r = drawScreen(ctx, video, clip, t, w, h, target);
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.ox, r.oy, r.pw, r.ph);
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = 'rgba(16, 16, 16, 0.55)';
      ctx.fill('evenodd');
      ctx.restore();
      setFrame({ x: r.x / dpr, y: r.y / dpr, w: r.w / dpr, h: r.h / dpr, k: r.k / dpr, zoom: target[2] });
    } else {
      if (c.width !== OW || c.height !== OH) {
        c.width = OW;
        c.height = OH;
      }
      drawDelivered(c.getContext('2d'), video, clip, t, OW, OH);
      setFrame(null);
    }
  }, [t, version, mode, shot, size, cssW, clip, video, OW, OH]);

  useEffect(() => {
    const v = rendered.current;
    if (mode !== 'render' || !v) return;
    if (Math.abs(v.currentTime - t) > 0.1) v.currentTime = t;
    if (transport.playing && v.paused) v.play();
    if (!transport.playing && !v.paused) v.pause();
  }, [mode, t, transport]);

  const drag = useRef(null);
  const onFrameDown = (e) => {
    if (!shot || !frame) return;
    e.preventDefault();
    transport.pause();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, corner: e.target.dataset.corner, view: resolve(clip.spec.camera[clip.keyIndex(shot.id)]), frame };
  };
  const onFrameMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const { master } = clip.info;
    const dx = (e.clientX - d.x) / d.frame.k;
    const dy = (e.clientY - d.y) / d.frame.k;
    let [cx, cy, z] = d.view;
    if (d.corner) {
      const grow = d.corner.includes('l') ? -dx : dx;
      const vw = Math.max(master.width / 3, Math.min(master.width, d.frame.w / d.frame.k + grow * 2));
      z = master.width / vw;
    } else {
      cx += dx / master.width;
      cy += dy / master.height;
    }
    clip.frameShot(clip.shotById(shot.id) ?? shot, [Math.max(0, Math.min(1, cx)), Math.max(0, Math.min(1, cy)), Math.max(1, Math.min(3, z))], { live: true });
  };
  const onFrameUp = () => {
    if (drag.current) clip.settle();
    drag.current = null;
  };

  return (
    <div className="preview" ref={box}>
      {mode === 'render' && renderUrl ? (
        <video ref={rendered} className="preview-media" src={renderUrl} muted playsInline style={{ width: cssW, height: cssH }} />
      ) : (
        <canvas ref={canvas} className={cx('preview-media', mode === 'frame' && 'preview-screen')} style={mode === 'frame' ? { width: size.w, height: size.h } : { width: cssW, height: cssH }} />
      )}
      {mode === 'frame' && frame && (
        <div
          className={cx('frame', !shot && 'frame-idle')}
          style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
          onPointerDown={onFrameDown}
          onPointerMove={onFrameMove}
          onPointerUp={onFrameUp}
          aria-label="The shot's frame: drag to reframe it, drag a corner to lean in or out"
          role="group"
        >
          {['tl', 'tr', 'bl', 'br'].map((c) => <span key={c} className={`frame-corner frame-${c}`} data-corner={c} />)}
          <span className="frame-tag">{frame.zoom <= 1.0005 ? 'Wide' : `${frame.zoom.toFixed(2)}×`}</span>
        </div>
      )}
    </div>
  );
}
