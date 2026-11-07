// Procedural sound effects. Everything is synthesized with WebAudio; no audio files.
import { INK, type InkColor, type Kind } from './config';

class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private lastSplat = 0;
  private lastBlast = 0;
  muted = false;

  // Music sequencer state.
  private musicBus: GainNode | null = null;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private intensity = 0;

  constructor() {
    // Browsers only allow audio after a user gesture, so start the context on the first one.
    const unlock = () => this.unlock();
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
  }

  private unlock(): void {
    if (!this.ctx) {
      const ctx = new AudioContext();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(comp);
      // One second of white noise, reused by every noisy sound.
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0.32;
      this.musicBus.connect(this.master);
      this.ctx = ctx;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    return this.muted;
  }

  private ready(): AudioContext | null {
    return this.ctx && this.ctx.state === 'running' && !this.muted ? this.ctx : null;
  }

  /** Gain envelope: quick attack, exponential decay. */
  private env(ctx: AudioContext, peak: number, attack: number, decay: number, t = ctx.currentTime): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.master);
    return g;
  }

  private tone(ctx: AudioContext, type: OscillatorType, f0: number, f1: number, dur: number, out: AudioNode, t = ctx.currentTime): void {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(ctx: AudioContext, filter: BiquadFilterType, f0: number, f1: number, dur: number, out: AudioNode, t = ctx.currentTime): void {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    src.connect(f).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  /** Ink swap: a two-note chirp, rising into pink, falling into teal. */
  swap(to: InkColor): void {
    const ctx = this.ready();
    if (!ctx) return;
    const up = to === INK.PINK;
    const t = ctx.currentTime;
    this.tone(ctx, 'triangle', up ? 520 : 880, up ? 880 : 520, 0.06, this.env(ctx, 0.35, 0.005, 0.07, t), t);
    this.tone(ctx, 'square', up ? 1040 : 700, up ? 1400 : 460, 0.05, this.env(ctx, 0.08, 0.005, 0.06, t + 0.04), t + 0.04);
  }

  /** Shifter changes ink: a quiet wobble, rate-limited because many shifters can flip together. */
  private lastShift = 0;
  shift(): void {
    const ctx = this.ready();
    if (!ctx || ctx.currentTime - this.lastShift < 0.08) return;
    this.lastShift = ctx.currentTime;
    this.tone(ctx, 'sine', 300, 600, 0.12, this.env(ctx, 0.12, 0.01, 0.12));
  }

  /** Blob burst: wet noise squelch plus a small pitched pop. Bigger blobs sound lower. */
  splat(kind: Kind): void {
    const ctx = this.ready();
    if (!ctx) return;
    // Chain reactions kill many blobs at once; cap the rate so it does not turn into static.
    const now = ctx.currentTime;
    if (now - this.lastSplat < 0.03) return;
    this.lastSplat = now;
    const pitch = { brute: 0.5, splitter: 0.7, blob: 1, shifter: 1.2, runt: 1.6 }[kind];
    const j = 0.85 + Math.random() * 0.3;
    this.hiss(ctx, 'bandpass', 2400 * pitch * j, 300 * pitch, 0.12, this.env(ctx, 0.5, 0.004, 0.12));
    this.tone(ctx, 'sine', 420 * pitch * j, 110 * pitch, 0.09, this.env(ctx, 0.4, 0.003, 0.09));
  }

  /** Overprint blast: sub boom plus a lowpassed noise rush. Scales with blast radius. */
  blast(radius: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastBlast < 0.05) return;
    this.lastBlast = now;
    const size = Math.min(1, radius / 220);
    const dur = 0.3 + size * 0.5;
    this.tone(ctx, 'sine', 150 - size * 50, 38, dur, this.env(ctx, 0.5 + size * 0.4, 0.005, dur));
    this.tone(ctx, 'triangle', 90, 30, dur * 0.8, this.env(ctx, 0.25, 0.005, dur * 0.8));
    this.hiss(ctx, 'lowpass', 5000, 200, dur, this.env(ctx, 0.35 + size * 0.3, 0.01, dur));
  }

  /** Getting hit: harsh falling buzz and a short crunch. */
  hit(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const out = this.env(ctx, 0.35, 0.004, 0.28);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 4);
    }
    shaper.curve = curve;
    shaper.connect(out);
    this.tone(ctx, 'sawtooth', 320, 70, 0.28, shaper);
    this.tone(ctx, 'square', 160, 50, 0.22, shaper);
    this.hiss(ctx, 'highpass', 1500, 600, 0.08, this.env(ctx, 0.3, 0.002, 0.08));
  }

  // ---------- music ----------

  /** 0 at the start of a run, 1 once waves reach full speed. Drives tempo and layers. */
  setIntensity(i: number): void {
    this.intensity = Math.max(0, Math.min(1, i));
  }

  startMusic(): void {
    this.stopMusic();
    this.step = 0;
    this.nextTime = 0;
    if (this.musicBus && this.ctx) {
      this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicBus.gain.setValueAtTime(0.32, this.ctx.currentTime);
    }
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    // Fade out whatever is already queued so it does not cut off with a click.
    if (this.musicBus && this.ctx) {
      const t = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(t);
      this.musicBus.gain.setTargetAtTime(0, t, 0.08);
    }
  }

  /** Lookahead scheduler: queue every 16th note that starts in the next 120 ms. */
  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    // First tick, or the tab was in the background: resync instead of bursting to catch up.
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.12) {
      if (!this.muted) this.playStep(this.step, this.nextTime);
      const bpm = 96 + this.intensity * 68; // 96 to 164 BPM
      this.nextTime += 60 / bpm / 4;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, t: number): void {
    const ctx = this.ctx!;
    const bus = this.musicBus!;
    const i = this.intensity;
    const s16 = step % 16;
    const bar = (step / 16) | 0;
    // A minor, i - VI - III - VII.
    const root = [0, -4, 3, -2][bar];
    const A1 = 55;
    const hz = (semi: number) => A1 * Math.pow(2, semi / 12);

    // Kick on the beat; adds an off-beat push once things get busy.
    if (s16 % 4 === 0 || (i > 0.6 && s16 === 14)) {
      this.tone(ctx, 'sine', 140, 42, 0.16, this.envTo(ctx, bus, 0.9, 0.003, 0.18, t), t);
    }
    // Hats on 8ths, 16ths later.
    if (s16 % 2 === 0 || i > 0.45) {
      const accent = s16 % 4 === 2 ? 0.22 : 0.1;
      this.hiss(ctx, 'highpass', 7000, 6000, 0.03, this.envTo(ctx, bus, accent, 0.001, 0.035, t), t);
    }
    // Snare on 2 and 4 after the opening stretch.
    if (i > 0.2 && (s16 === 4 || s16 === 12)) {
      this.hiss(ctx, 'bandpass', 1800, 900, 0.12, this.envTo(ctx, bus, 0.35, 0.002, 0.12, t), t);
      this.tone(ctx, 'triangle', 220, 160, 0.06, this.envTo(ctx, bus, 0.2, 0.002, 0.06, t), t);
    }
    // Bass line.
    const bass = [0, null, 0, null, 7, null, 0, 12, null, 0, null, 3, 5, null, 7, null][s16];
    if (bass !== null) {
      const out = this.envTo(ctx, bus, 0.32, 0.004, 0.14, t);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 500 + i * 900;
      f.connect(out);
      const fq = hz(root + bass);
      this.tone(ctx, 'square', fq, fq, 0.14, f, t);
    }
    // Pentatonic arp joins at mid intensity.
    if (i > 0.5 && s16 % 2 === 0) {
      const penta = [12, 15, 17, 19, 22, 24, 22, 19];
      const fq = hz(root + 12 + penta[(s16 / 2) % 8]);
      this.tone(ctx, 'triangle', fq, fq, 0.1, this.envTo(ctx, bus, 0.12, 0.004, 0.1, t), t);
    }
  }

  private envTo(ctx: AudioContext, dest: AudioNode, peak: number, attack: number, decay: number, t: number): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest);
    return g;
  }
}

export const sfx = new Sfx();
