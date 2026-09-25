/**
 * The picture: one clock over the master (with slow motion), and drawing a
 * frame of it through the camera, either as delivered or as the whole screen
 * with the camera's frame on it.
 */
import { viewBox, spotAlpha } from '../../../engine/camera/math.mjs';
import { WASH, WASH_ALPHA, SPOT_RADIUS } from '../../../engine/camera/grammar.mjs';

export class Transport {
  constructor(clip, video) {
    this.clip = clip;
    this.video = video;
    this.t = 0;
    this.playing = false;
    this.rate = 1;
    this.loop = true;
    /** A region [start, end] to play on repeat, or null for the whole clip. */
    this.region = null;
    this.listeners = new Set();
    this.seeking = false;
    this.pending = null;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = `/media/master/${encodeURIComponent(clip.name)}.mp4`;
    this.ready = new Promise((resolve) => video.addEventListener('loadeddata', resolve, { once: true }));
    this.onSeeked = () => {
      this.seeking = false;
      if (this.pending !== null) {
        const m = this.pending;
        this.pending = null;
        this.seeking = true;
        video.currentTime = m;
        return;
      }
      this.emit();
    };
    video.addEventListener('seeked', this.onSeeked);
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this.t);
  }

  seek(t) {
    this.t = Math.max(0, Math.min(this.clip.length, t));
    const m = this.clip.masterTime(this.t);
    this.emit();
    if (this.seeking) {
      this.pending = m;
      return;
    }
    this.seeking = true;
    this.video.currentTime = m;
  }

  setRegion(region) {
    this.region = region;
    this.emit();
  }

  /** Play the region (or the clip) from its start. */
  replay() {
    this.seek(this.region ? this.region[0] : 0);
    if (!this.playing) this.play();
    else this.base = { wall: performance.now(), t: this.t };
  }

  play() {
    const [start, end] = this.region ?? [0, this.clip.length];
    if (this.t >= end - 0.02 || this.t < start) this.seek(start);
    this.video.playbackRate = this.rate;
    this.video.play();
    this.playing = true;
    this.base = { wall: performance.now(), t: this.t };
    const tick = () => {
      if (!this.playing) return;
      let t = this.base.t + ((performance.now() - this.base.wall) / 1000) * this.rate;
      const [start, end] = this.region ?? [0, this.clip.length];
      if (t >= end) {
        if (!this.loop) {
          this.pause();
          this.seek(end);
          return;
        }
        t = start;
        this.base = { wall: performance.now(), t: start };
        this.video.currentTime = this.clip.masterTime(start);
      }
      this.t = t;
      const want = this.clip.masterTime(t);
      if (Math.abs(this.video.currentTime - want) > 0.12) this.video.currentTime = want;
      this.emit();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    this.emit();
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.video.pause();
    this.emit();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  setRate(rate) {
    this.rate = rate;
    this.video.playbackRate = rate;
    if (this.playing) this.base = { wall: performance.now(), t: this.t };
    this.emit();
  }

  step(frames) {
    this.pause();
    this.seek(this.t + frames / this.clip.info.master.fps);
  }

  destroy() {
    this.pause();
    this.listeners.clear();
    this.video.removeEventListener('seeked', this.onSeeked);
    this.video.removeAttribute('src');
    this.video.load();
  }
}

function wash(c, X, Y, RW, RH, radius, alpha, W, H) {
  const level = Math.trunc(255 * WASH_ALPHA * alpha) / 255;
  if (level <= 0) return;
  c.save();
  c.beginPath();
  c.rect(0, 0, W, H);
  c.roundRect(X, Y, RW, RH, Math.max(0, Math.min(radius, RW / 2, RH / 2)));
  c.fillStyle = `rgba(${WASH.join(',')},${level})`;
  c.fill('evenodd');
  c.restore();
}

/** The frame as delivered at t. */
export function drawDelivered(c, video, clip, t, OW, OH) {
  const { master, css } = clip.info;
  const v = viewBox(master.width, master.height, OW, OH, clip.view(t));
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(video, v.x0, v.y0, v.vw, v.vh, 0, 0, OW, OH);
  const k = OW / v.vw;
  for (const s of clip.spec.spots) {
    wash(c, (s.x * master.width - v.x0) * k, (s.y * master.height - v.y0) * k, s.w * master.width * k, s.h * master.height * k, (s.radius ?? SPOT_RADIUS) * css * k, spotAlpha(s, t), OW, OH);
  }
  return v;
}

/**
 * The whole screen at w x h, washed, and where the camera's crop falls on
 * it (in canvas pixels) so a frame can be drawn over it.
 */
export function drawScreen(c, video, clip, t, w, h, view = clip.view(t)) {
  const { master, css, output } = clip.info;
  const k = Math.min(w / master.width, h / master.height);
  const ox = (w - master.width * k) / 2;
  const oy = (h - master.height * k) / 2;
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.clearRect(0, 0, w, h);
  c.drawImage(video, 0, 0, master.width, master.height, ox, oy, master.width * k, master.height * k);
  for (const s of clip.spec.spots) {
    c.save();
    c.beginPath();
    c.rect(ox, oy, master.width * k, master.height * k);
    c.clip();
    wash(c, ox + s.x * master.width * k, oy + s.y * master.height * k, s.w * master.width * k, s.h * master.height * k, (s.radius ?? SPOT_RADIUS) * css * k, spotAlpha(s, t), w, h);
    c.restore();
  }
  const v = viewBox(master.width, master.height, output.width, output.height, view);
  return { x: ox + v.x0 * k, y: oy + v.y0 * k, w: v.vw * k, h: v.vh * k, k, ox, oy, pw: master.width * k, ph: master.height * k };
}

/** Master pixels per delivered pixel at t: under 1, the lean upscales and the picture softens. */
export function sharpness(clip, t) {
  const { master, output } = clip.info;
  return viewBox(master.width, master.height, output.width, output.height, clip.view(t)).vw / output.width;
}

/** Real frames of the delivered clip at `times`, `width` px wide, drawn one after another. */
export async function thumbnails(clip, times, width, { signal } = {}) {
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = `/media/master/${encodeURIComponent(clip.name)}.mp4`;
  await new Promise((resolve) => video.addEventListener('loadeddata', resolve, { once: true }));
  const { width: OW, height: OH } = clip.info.output;
  const full = document.createElement('canvas');
  full.width = OW;
  full.height = OH;
  const out = [];
  for (const t of times) {
    if (signal?.aborted) break;
    await new Promise((resolve) => {
      video.addEventListener('seeked', resolve, { once: true });
      video.currentTime = clip.masterTime(t);
    });
    drawDelivered(full.getContext('2d'), video, clip, t, OW, OH);
    const c = document.createElement('canvas');
    c.width = width * 2;
    c.height = Math.round((width * 2 * OH) / OW);
    const cc = c.getContext('2d');
    cc.imageSmoothingQuality = 'high';
    cc.drawImage(full, 0, 0, c.width, c.height);
    out.push(c.toDataURL('image/jpeg', 0.86));
  }
  video.removeAttribute('src');
  video.load();
  return out;
}
