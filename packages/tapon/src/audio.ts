import { STATIONS, StationPlayer, Voices } from '@sd/game/radio';

export interface Volumes {
  master: number;
  music: number;
  sfx: number;
}

/**
 * El Tapón sound: the moto's single-cylinder engine, traffic, horns and every gameplay cue (all synthesised,
 * no recordings), plus original procedural dembow / merengue / bachata / típico from the shared radio module.
 * Every cue that matters also has a visual (popups, warnings, banners).
 */
export class TaponAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private engine: { a: OscillatorNode; b: OscillatorNode; lp: BiquadFilterNode; g: GainNode; am: GainNode; lfo: OscillatorNode } | null = null;
  private rumble: GainNode | null = null;
  private station: StationPlayer | null = null;
  private stationIdx = 2;
  muted = false;
  private vol: Volumes;

  constructor(v: Volumes) {
    this.vol = { ...v };
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC({ latencyHint: 'interactive' }));
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 4;
      this.master = c.createGain();
      this.master.connect(comp).connect(c.destination);
      this.sfx = c.createGain();
      this.music = c.createGain();
      this.sfx.connect(this.master);
      this.music.connect(this.master);
      this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.setVolumes(v);
    } catch {
      this.ctx = null;
    }
  }

  setVolumes(v: Volumes) {
    this.vol = { ...v };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : v.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(v.sfx, t, 0.05);
    this.music.gain.setTargetAtTime(v.music * 0.7, t, 0.05);
  }

  toggleMute() {
    this.muted = !this.muted;
    this.setVolumes(this.vol);
    return this.muted;
  }

  resume() {
    void this.ctx?.resume();
  }
  suspend() {
    void this.ctx?.suspend();
  }
  /** Releases the audio device (browsers allow only a few AudioContexts per page). */
  close() {
    this.stopRun();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
  /** Mute without toggling (e.g. restoring the player's preference). */
  setMuted(m: boolean) {
    this.muted = m;
    this.setVolumes(this.vol);
  }

  // ───────────────────────── loops ─────────────────────────
  startRun() {
    const c = this.ctx;
    if (!c) return;
    this.stopRun();
    const g = c.createGain();
    g.gain.value = 0;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const a = c.createOscillator();
    a.type = 'sawtooth';
    const b = c.createOscillator();
    b.type = 'square';
    const am = c.createGain();
    am.gain.value = 0.6;
    const lfo = c.createOscillator();
    const lfoG = c.createGain();
    lfoG.gain.value = 0.4;
    lfo.connect(lfoG).connect(am.gain);
    a.connect(lp);
    b.connect(lp);
    lp.connect(am).connect(g).connect(this.sfx);
    a.start();
    b.start();
    lfo.start();
    g.gain.setTargetAtTime(0.07, c.currentTime, 0.2);
    this.engine = { a, b, lp, g, am, lfo };
    // traffic rumble
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const rl = c.createBiquadFilter();
    rl.type = 'lowpass';
    rl.frequency.value = 320;
    const rg = c.createGain();
    rg.gain.value = 0.05;
    src.connect(rl).connect(rg).connect(this.sfx);
    src.start();
    this.rumble = rg;
    this.station = new StationPlayer(STATIONS[this.stationIdx], new Voices(c, this.music, this.noise), c.currentTime + 0.3);
  }

  stopRun() {
    const c = this.ctx;
    if (!c) return;
    if (this.engine) {
      const e = this.engine;
      e.g.gain.setTargetAtTime(0, c.currentTime, 0.1);
      setTimeout(() => {
        try {
          e.a.stop();
          e.b.stop();
          e.lfo.stop();
        } catch {
          /* context already closed */
        }
      }, 500);
      this.engine = null;
    }
    if (this.rumble) {
      this.rumble.gain.setTargetAtTime(0, c.currentTime, 0.2);
      this.rumble = null;
    }
    this.station = null;
  }

  /** Next music station (between runs). */
  nextStation() {
    this.stationIdx = (this.stationIdx + 1) % STATIONS.length;
    return STATIONS[this.stationIdx].name;
  }

  update(speed: number) {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const t = c.currentTime;
    if (this.engine) {
      const f = 34 + speed * 3.4;
      this.engine.a.frequency.setTargetAtTime(f, t, 0.08);
      this.engine.b.frequency.setTargetAtTime(f / 2, t, 0.08);
      this.engine.lfo.frequency.setTargetAtTime(f / 2, t, 0.08);
      this.engine.lp.frequency.setTargetAtTime(700 + speed * 45, t, 0.1);
    }
    this.station?.scheduleUntil(t + 0.25);
  }

  // ───────────────────────── one-shots ─────────────────────────
  private tone(f: number, type: OscillatorType, dur: number, gain: number, opts: { to?: number; delay?: number; pan?: number; lp?: number } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + (opts.delay ?? 0);
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = o;
    if (opts.lp) {
      const f2 = c.createBiquadFilter();
      f2.type = 'lowpass';
      f2.frequency.value = opts.lp;
      node = node.connect(f2);
    }
    node = node.connect(g);
    if (opts.pan !== undefined) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      node = node.connect(p);
    }
    node.connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(dur: number, type: BiquadFilterType, freq: number, gain: number, opts: { delay?: number; to?: number; q?: number } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + (opts.delay ?? 0);
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    if (opts.q) f.Q.value = opts.q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t, Math.random() * 1.5, dur + 0.05);
  }

  laneChange() {
    this.burst(0.14, 'bandpass', 900, 0.05, { to: 2400, q: 1.2 });
  }
  closeCall() {
    this.burst(0.25, 'bandpass', 700, 0.12, { to: 3000, q: 1 });
    this.tone(1568, 'triangle', 0.18, 0.08, { delay: 0.05 });
    this.tone(2093, 'triangle', 0.22, 0.07, { delay: 0.12 });
  }
  dodge() {
    this.tone(988, 'triangle', 0.09, 0.05);
  }
  horn(pair: [number, number], pan: number, near: number) {
    const dur = 0.18 + Math.random() * 0.25;
    const g = 0.05 + near * 0.08;
    this.tone(pair[0], 'square', dur, g, { pan, lp: 2200 });
    this.tone(pair[1], 'square', dur, g * 0.8, { pan, lp: 2200 });
    if (Math.random() < 0.4) {
      this.tone(pair[0], 'square', dur * 0.7, g, { pan, lp: 2200, delay: dur + 0.08 });
      this.tone(pair[1], 'square', dur * 0.7, g * 0.8, { pan, lp: 2200, delay: dur + 0.08 });
    }
  }
  crash() {
    this.burst(0.6, 'lowpass', 1400, 0.5);
    this.tone(70, 'sine', 0.4, 0.5, { to: 40 });
    this.tone(523, 'square', 0.12, 0.1, { delay: 0.04, lp: 3000 });
    this.tone(659, 'square', 0.1, 0.08, { delay: 0.09, lp: 3000 });
    this.burst(0.3, 'highpass', 3500, 0.1, { delay: 0.05 });
  }
  lifeLost() {
    [660, 523, 392].forEach((f, i) => this.tone(f, 'triangle', 0.16, 0.09, { delay: 0.25 + i * 0.12 }));
  }
  pothole() {
    this.tone(90, 'sine', 0.25, 0.4, { to: 50 });
    this.burst(0.2, 'lowpass', 500, 0.25);
  }
  /** The funny one: a slide whistle down and a soft *plof* when a plantain lands. */
  plantain() {
    this.tone(1500, 'sine', 0.38, 0.09, { to: 380 });
    this.tone(150, 'sine', 0.18, 0.3, { to: 70, delay: 0.36 });
    this.burst(0.12, 'lowpass', 700, 0.18, { delay: 0.36 });
    this.tone(420, 'triangle', 0.08, 0.06, { delay: 0.5, to: 640 });
  }
  pickup() {
    [1047, 1319, 1568].forEach((f, i) => this.tone(f, 'triangle', 0.16, 0.08, { delay: i * 0.07 }));
  }
  ride() {
    [784, 988, 1175, 1568, 1319, 1568].forEach((f, i) => this.tone(f, 'square', 0.12, 0.05, { delay: i * 0.09, lp: 3500 }));
  }
  /** Traffic officer's whistle: two trilled blasts. */
  whistle() {
    const c = this.ctx;
    if (!c) return;
    for (const d of [0, 0.32]) {
      const t = c.currentTime + d;
      const o = c.createOscillator();
      o.frequency.value = 2950;
      const lfo = c.createOscillator();
      lfo.frequency.value = 30;
      const lg = c.createGain();
      lg.gain.value = 140;
      lfo.connect(lg).connect(o.frequency);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.02);
      g.gain.setValueAtTime(0.07, t + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      o.connect(g).connect(this.sfx);
      o.start(t);
      lfo.start(t);
      o.stop(t + 0.3);
      lfo.stop(t + 0.3);
    }
  }
  siren() {
    for (let i = 0; i < 3; i++) {
      this.tone(620, 'sine', 0.55, 0.06, { to: 1250, delay: i * 0.6 });
      this.tone(1250, 'sine', 0.05, 0.001, { delay: i * 0.6 + 0.55 });
    }
  }
  warning() {
    this.tone(880, 'square', 0.1, 0.05, { lp: 2000 });
    this.tone(880, 'square', 0.1, 0.05, { lp: 2000, delay: 0.16 });
  }
  stage() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 'sawtooth', 0.2, 0.05, { delay: i * 0.08, lp: 2600 }));
  }
  gameOver() {
    [392, 370, 349, 311].forEach((f, i) => this.tone(f, 'sawtooth', i === 3 ? 0.7 : 0.3, 0.08, { delay: i * 0.32, lp: 1400, to: i === 3 ? 250 : undefined }));
  }
  click() {
    this.burst(0.03, 'highpass', 3500, 0.06);
  }
}
