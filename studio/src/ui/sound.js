/**
 * The Studio's sounds, made on the spot with Web Audio: no files. Each is
 * a few milliseconds of something physical (a detent, a latch, a shutter),
 * quiet enough to sit under work, and every one of them is optional: the
 * speaker button in the bar turns them off, and that choice is kept.
 *
 * Browsers only start audio after a gesture, so the context wakes on the
 * first press anywhere and every sound before that is silently dropped.
 */

/* ─────────────────────────────────────────────────────────
 * THE SOUNDS
 *
 *   tick     a mark on the lens ring passing the index (faster, brighter)
 *   detent   the ring clicking into wide or the lean
 *   stop     the ring reaching the end of its travel
 *   snap     a shot's edge landing on a beat
 *   select   opening a shot, picking an option
 *   play     the transport starting; pause, the transport stopping
 *   latch    Save: two quick clicks, a case closing
 *   undo     a short soft slide back; redo, the same forward
 *   fix      a note's fix applied: a low settle
 *   done     a render finished: two soft bells
 *   error    something refused: a low, dull knock
 * ───────────────────────────────────────────────────────── */

const KEY = 'dolly.sound';
const VOLUME = 0.55;
const TICK_GAP = 14; // ms: ticks closer than this merge, so a fast flick buzzes softly instead of clipping

class Sound {
  constructor() {
    this.ctx = null;
    this.out = null;
    this.noiseBuffer = null;
    this.lastTick = 0;
    this.listeners = new Set();
    try {
      this.enabled = localStorage.getItem(KEY) !== 'off';
    } catch {
      this.enabled = true;
    }
    if (typeof window !== 'undefined') {
      const wake = () => this.wake();
      window.addEventListener('pointerdown', wake, { capture: true });
      window.addEventListener('keydown', wake, { capture: true });
    }
  }

  wake() {
    if (!this.enabled) return;
    if (!this.ctx) {
      const Context = window.AudioContext ?? window.webkitAudioContext;
      if (!Context) return;
      this.ctx = new Context({ latencyHint: 'interactive' });
      this.out = this.ctx.createGain();
      this.out.gain.value = VOLUME;
      /* A gentle limiter, so a stack of ticks never clips. */
      const limit = this.ctx.createDynamicsCompressor();
      limit.threshold.value = -14;
      limit.ratio.value = 8;
      this.out.connect(limit).connect(this.ctx.destination);
      const n = Math.round(this.ctx.sampleRate * 0.25);
      this.noiseBuffer = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < n; i += 1) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setEnabled(on) {
    this.enabled = on;
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      /* A private window: the choice lasts this session. */
    }
    if (on) {
      this.wake();
      this.select();
    }
    for (const fn of this.listeners) fn(on);
  }

  ready() {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  }

  /* ── Voices ── */

  /** A burst of filtered noise: the click of two hard parts meeting. */
  click({ at = 0, freq = 3200, q = 6, gain = 0.2, decay = 0.018 } = {}) {
    const { ctx } = this;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = freq;
    band.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(band).connect(env).connect(this.out);
    src.start(t, Math.random() * 0.2);
    src.stop(t + decay + 0.01);
  }

  /** A short pitched body under a click: weight, so a detent feels heavier than a tick. */
  tone({ at = 0, freq = 440, to = freq, gain = 0.12, attack = 0.002, decay = 0.08, type = 'sine' } = {}) {
    const { ctx } = this;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, t + decay);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    osc.connect(env).connect(this.out);
    osc.start(t);
    osc.stop(t + attack + decay + 0.02);
  }

  /** A soft slide of air: undo and redo. */
  swish({ from, to, gain = 0.07, length = 0.07 }) {
    const { ctx } = this;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 2.2;
    band.frequency.setValueAtTime(from, t);
    band.frequency.exponentialRampToValueAtTime(to, t + length);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + length * 0.35);
    env.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(band).connect(env).connect(this.out);
    src.start(t, Math.random() * 0.1);
    src.stop(t + length + 0.02);
  }

  /* ── The Studio's sounds ── */

  /** `speed` 0 to 1: a quick roll ticks brighter and a touch softer, like a real ring spun fast. */
  tick(speed = 0) {
    if (!this.ready()) return;
    const now = performance.now();
    if (now - this.lastTick < TICK_GAP) return;
    this.lastTick = now;
    const s = Math.max(0, Math.min(1, speed));
    this.click({ freq: 2600 + s * 1800 + Math.random() * 300, q: 9, gain: 0.16 - s * 0.05, decay: 0.012 });
  }

  detent() {
    if (!this.ready()) return;
    this.click({ freq: 2100, q: 5, gain: 0.26, decay: 0.02 });
    this.tone({ freq: 190, to: 150, gain: 0.16, decay: 0.05 });
  }

  stop() {
    if (!this.ready()) return;
    this.click({ freq: 1200, q: 3, gain: 0.22, decay: 0.03 });
    this.tone({ freq: 110, gain: 0.12, decay: 0.06 });
  }

  snap() {
    if (!this.ready()) return;
    this.click({ freq: 3600, q: 7, gain: 0.18, decay: 0.014 });
    this.tone({ freq: 1320, to: 990, gain: 0.05, decay: 0.05, type: 'triangle' });
  }

  select() {
    if (!this.ready()) return;
    this.click({ freq: 1800, q: 4, gain: 0.12, decay: 0.016 });
  }

  play() {
    if (!this.ready()) return;
    this.click({ freq: 1500, q: 4, gain: 0.14, decay: 0.02 });
    this.tone({ freq: 520, to: 780, gain: 0.05, decay: 0.07, type: 'triangle' });
  }

  pause() {
    if (!this.ready()) return;
    this.click({ freq: 1300, q: 4, gain: 0.12, decay: 0.02 });
    this.tone({ freq: 700, to: 470, gain: 0.045, decay: 0.07, type: 'triangle' });
  }

  latch() {
    if (!this.ready()) return;
    this.click({ freq: 2400, q: 5, gain: 0.2, decay: 0.018 });
    this.click({ at: 0.055, freq: 1600, q: 4, gain: 0.24, decay: 0.026 });
    this.tone({ at: 0.055, freq: 240, to: 200, gain: 0.08, decay: 0.05 });
  }

  undo() {
    if (!this.ready()) return;
    this.swish({ from: 2400, to: 900 });
  }

  redo() {
    if (!this.ready()) return;
    this.swish({ from: 900, to: 2400 });
  }

  fix() {
    if (!this.ready()) return;
    this.tone({ freq: 392, gain: 0.07, decay: 0.16, type: 'triangle' });
    this.tone({ at: 0.06, freq: 587, gain: 0.06, decay: 0.2, type: 'triangle' });
  }

  done() {
    if (!this.ready()) return;
    this.tone({ freq: 880, gain: 0.09, attack: 0.004, decay: 0.7 });
    this.tone({ freq: 1760, gain: 0.025, attack: 0.004, decay: 0.4 });
    this.tone({ at: 0.12, freq: 1318.5, gain: 0.08, attack: 0.004, decay: 0.9 });
    this.tone({ at: 0.12, freq: 2637, gain: 0.02, attack: 0.004, decay: 0.5 });
  }

  error() {
    if (!this.ready()) return;
    this.tone({ freq: 150, to: 110, gain: 0.14, decay: 0.12, type: 'triangle' });
    this.click({ freq: 700, q: 2, gain: 0.12, decay: 0.03 });
  }
}

export const sound = new Sound();
