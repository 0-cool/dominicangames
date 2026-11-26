import * as THREE from 'three';
import { CarRadio, type Station } from './Radio.ts';
import type { VehicleModel } from '../vehicles/vehicleMeshes.ts';
import type { Vehicle } from '../vehicles/Vehicle.ts';
import type { WorldStreamer } from '../world/WorldStreamer.ts';

interface Volumes {
  master: number;
  music: number;
  sfx: number;
  ambience: number;
}
interface TrafficLike {
  nearest(x: number, z: number, n: number): { x: number; z: number; v: number; moto: boolean; id: number }[];
}

/**
 * 100 % synthesized, original audio (Web Audio API): engines, horns, crashes,
 * footsteps, city/sea/rain ambience, birds and insects, and a procedural
 * merengue/bachata loop coming out of colmados. No recorded or licensed audio.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private engine: { oscs: OscillatorNode[]; filter: BiquadFilterNode; gain: GainNode; lfoGain?: GainNode; moto: boolean } | null = null;
  private beds: Record<string, GainNode> = {};
  private musicPanner!: PannerNode;
  private seq: { next: number; step: number; genre: 'merengue' | 'bachata'; timer: number | null } | null = null;
  private birdTimer = 0;
  private dogTimer = 8;
  private seaDist: Float32Array | null = null;
  private seaGrid = { x0: 0, z0: 0, cell: 40, nx: 0, nz: 0 };
  private vol: Volumes;
  private radio: CarRadio | null = null;
  private skid: GainNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;

  constructor(v: Volumes) {
    this.vol = { ...v };
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const c = this.ctx;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master = c.createGain();
      this.master.connect(comp).connect(c.destination);
      this.sfx = c.createGain();
      this.amb = c.createGain();
      this.music = c.createGain();
      this.sfx.connect(this.master);
      this.amb.connect(this.master);
      this.music.connect(this.master);
      this.setVolumes(v);
      // shared noise buffer (2 s white noise)
      this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.makeBeds();
      this.musicPanner = this.panner(8, 1.6);
      const mg = c.createGain();
      mg.gain.value = 0.55;
      this.musicPanner.connect(mg).connect(this.music);
      this.radio = new CarRadio(c, this.music, this.noise);
      this.makeSkid();
    } catch {
      this.ctx = null;
    }
  }

  setVolumes(v: Volumes) {
    this.vol = { ...v };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(v.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(v.sfx, t, 0.05);
    this.amb.gain.setTargetAtTime(v.ambience, t, 0.05);
    this.music.gain.setTargetAtTime(v.music, t, 0.05);
  }

  resume() {
    void this.ctx?.resume();
    this.startMusic();
  }

  setPaused(p: boolean) {
    if (!this.ctx) return;
    if (p) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  private noiseSrc(loop = true): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    return s;
  }

  private panner(ref = 5, rolloff = 1.2): PannerNode {
    const p = this.ctx!.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = rolloff;
    p.maxDistance = 400;
    return p;
  }

  private makeBeds() {
    const c = this.ctx!;
    const bed = (name: string, type: BiquadFilterType, freq: number, q: number, lfoRate = 0, lfoDepth = 0) => {
      const src = this.noiseSrc();
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.amb);
      if (lfoRate) {
        const lfo = c.createOscillator();
        lfo.frequency.value = lfoRate;
        const lg = c.createGain();
        lg.gain.value = lfoDepth;
        lfo.connect(lg).connect(f.frequency);
        lfo.start();
      }
      src.start(0, Math.random() * 1.9);
      this.beds[name] = g;
    };
    bed('city', 'lowpass', 420, 0.6, 0.07, 120);
    bed('sea', 'bandpass', 520, 0.5, 0.11, 300);
    bed('rain', 'highpass', 1800, 0.3);
    bed('wind', 'bandpass', 380, 1.2, 0.05, 200);
    bed('crowd', 'bandpass', 900, 1.5, 2.3, 300);
    bed('roof', 'lowpass', 650, 0.8, 9, 180); // rain drumming on the roof, heard from inside a car
    // night insects: tremolo sines
    const ins = c.createOscillator();
    ins.frequency.value = 4400;
    const trem = c.createOscillator();
    trem.frequency.value = 27;
    const tg = c.createGain();
    tg.gain.value = 0.5;
    const ig = c.createGain();
    ig.gain.value = 0;
    trem.connect(tg).connect(ig.gain);
    ins.connect(ig).connect(this.amb);
    ins.start();
    trem.start();
    this.beds.insects = ig;
  }

  /** Tyre squeal: band-passed noise whose level and pitch follow how much the tyres slide. */
  private makeSkid() {
    const c = this.ctx!;
    const src = this.noiseSrc();
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1700;
    f.Q.value = 3.2;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.sfx);
    src.start(0, Math.random() * 1.9);
    this.skid = g;
    this.skidFilter = f;
  }

  private bedLevel(name: string, v: number) {
    this.beds[name]?.gain.setTargetAtTime(v, this.ctx!.currentTime, 0.4);
  }

  // ───────────── engine ─────────────
  startEngine(model: VehicleModel) {
    if (!this.ctx) return;
    this.stopEngine();
    const c = this.ctx;
    const moto = model === 'moto' || model === 'motoconcho' || model === 'delivery';
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2.5;
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = Math.tanh(x * (moto ? 3.2 : 2.2));
    }
    shaper.curve = curve;
    const gain = c.createGain();
    gain.gain.value = 0;
    filter.connect(shaper).connect(gain).connect(this.sfx);
    const oscs: OscillatorNode[] = [];
    const types: OscillatorType[] = moto ? ['square', 'sawtooth', 'square'] : ['sawtooth', 'sawtooth', 'square'];
    const mults = moto ? [1, 2, 0.5] : [1, 2.01, 0.5];
    const gains = moto ? [0.5, 0.25, 0.3] : [0.45, 0.25, 0.35];
    types.forEach((t, i) => {
      const o = c.createOscillator();
      o.type = t;
      o.frequency.value = 30 * mults[i];
      const g = c.createGain();
      g.gain.value = gains[i];
      o.connect(g).connect(filter);
      o.start();
      oscs.push(o);
    });
    let lfoGain: GainNode | undefined;
    if (moto) {
      // single-cylinder "putt" amplitude modulation
      const lfo = c.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 12;
      lfoGain = c.createGain();
      lfoGain.gain.value = 0.35;
      lfo.connect(lfoGain).connect(gain.gain);
      lfo.start();
      oscs.push(lfo);
    }
    this.engine = { oscs, filter, gain, lfoGain, moto };
    gain.gain.setTargetAtTime(0.25, c.currentTime, 0.2);
  }

  stopEngine() {
    if (!this.ctx || !this.engine) return;
    const e = this.engine;
    e.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    setTimeout(() => e.oscs.forEach((o) => o.stop()), 600);
    this.engine = null;
  }

  updateEngine(rpmN: number, throttle: number, speed: number, moto: boolean) {
    if (!this.ctx || !this.engine) return;
    const c = this.ctx;
    const t = c.currentTime;
    const e = this.engine;
    const rpm = 800 + rpmN * (moto ? 7600 : 5600);
    const fire = moto ? rpm / 60 : rpm / 30; // firing frequency
    const mults = moto ? [1, 2, 0.5] : [1, 2.01, 0.5];
    e.oscs.slice(0, 3).forEach((o, i) => o.frequency.setTargetAtTime(fire * mults[i] * (moto ? 0.5 : 1), t, 0.05));
    if (moto) e.oscs[3].frequency.setTargetAtTime(fire * 0.5, t, 0.05);
    e.filter.frequency.setTargetAtTime(240 + throttle * 1400 + rpmN * 1600, t, 0.08);
    e.gain.gain.setTargetAtTime(0.16 + throttle * 0.22 + Math.min(speed, 30) * 0.002, t, 0.1);
  }

  // ───────────── one-shots ─────────────
  private burst(dur: number, type: BiquadFilterType, freq: number, gain: number, pos?: THREE.Vector3 | { x: number; z: number }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const src = this.noiseSrc(false);
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g);
    if (pos) {
      const p = this.panner(4, 1.3);
      p.positionX.value = pos.x;
      p.positionY.value = 'y' in pos ? (pos as THREE.Vector3).y : 1;
      p.positionZ.value = pos.z;
      g.connect(p).connect(this.sfx);
    } else g.connect(this.sfx);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  private tone(freqs: number[], type: OscillatorType, dur: number, gain: number, pos?: { x: number; z: number }, glide?: number) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.015);
    g.gain.setValueAtTime(gain, t + dur * 0.75);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    g.connect(lp);
    if (pos) {
      const p = this.panner(6, 1.1);
      p.positionX.value = pos.x;
      p.positionY.value = 1;
      p.positionZ.value = pos.z;
      lp.connect(p).connect(this.sfx);
    } else lp.connect(this.sfx);
    for (const f of freqs) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (glide) o.frequency.exponentialRampToValueAtTime(f * glide, t + dur);
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  /** Car door (open/close) or motorbike stand. */
  door(open: boolean, moto: boolean) {
    if (moto) {
      this.burst(0.09, 'bandpass', 2600, 0.1);
      this.tone([180], 'triangle', 0.06, 0.06, undefined, 0.7);
      return;
    }
    if (open) {
      this.burst(0.05, 'highpass', 3000, 0.08); // latch
      setTimeout(() => this.burst(0.18, 'lowpass', 500, 0.16), 60);
    } else {
      this.burst(0.22, 'lowpass', 320, 0.38); // thud
      this.burst(0.04, 'highpass', 2600, 0.07);
    }
  }

  /** Landing after a jump or a fall. */
  land(intensity: number) {
    this.burst(0.12 + intensity * 0.12, 'lowpass', 380 + intensity * 200, 0.12 + intensity * 0.3);
  }

  /** Small switch click (headlights, radio). */
  click() {
    this.burst(0.025, 'highpass', 3800, 0.09);
  }

  /** Next radio station; null when the radio is switched off. */
  radioNext(): Station | null {
    return this.radio?.next() ?? null;
  }

  get radioStation(): Station | null {
    return this.radio?.station ?? null;
  }

  /** Lower the radio while mission dialogue is shown. */
  duckRadio(on: boolean) {
    this.radio?.setDuck(on);
  }

  footstep(intensity: number) {
    this.burst(0.07, 'bandpass', 1400 + Math.random() * 600, 0.12 * intensity);
  }

  crash(intensity: number, pos: THREE.Vector3) {
    this.burst(0.5 + intensity * 0.5, 'lowpass', 900, 0.9 * intensity, pos);
    this.tone([55, 62], 'sine', 0.35, 0.7 * intensity, pos, 0.6);
  }

  horn(moto: boolean) {
    this.tone(moto ? [640, 780] : [415, 520], 'square', 0.45, 0.22);
  }

  honkAt(x: number, z: number, moto: boolean) {
    this.tone(moto ? [660, 800] : [400 + Math.random() * 60, 505], 'square', 0.3 + Math.random() * 0.4, 0.3, { x, z });
  }

  shout(x: number, z: number) {
    // vowel-ish "¡Eh!" — sawtooth through formant filters
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(260 + Math.random() * 120, t);
    o.frequency.exponentialRampToValueAtTime(170, t + 0.4);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    const p = this.panner(4, 1.4);
    p.positionX.value = x;
    p.positionY.value = 1.6;
    p.positionZ.value = z;
    for (const [f, q] of [[530, 8], [1840, 10]]) {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      o.connect(bp).connect(g);
    }
    g.connect(p).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.45);
  }

  thunder(i: number) {
    this.burst(3.5, 'lowpass', 160, 1.2 * i);
  }

  chime() {
    [523, 659, 784].forEach((f, k) => setTimeout(() => this.tone([f], 'sine', 0.35, 0.25), k * 90));
  }

  success() {
    [523, 659, 784, 1046].forEach((f, k) => setTimeout(() => this.tone([f, f * 1.5], 'triangle', 0.45, 0.22), k * 130));
  }

  notify() {
    this.tone([880], 'sine', 0.12, 0.15);
    setTimeout(() => this.tone([1175], 'sine', 0.18, 0.15), 110);
  }

  // ───────────── procedural colmado music ─────────────
  private startMusic() {
    if (!this.ctx || this.seq) return;
    this.seq = { next: this.ctx.currentTime + 0.2, step: 0, genre: 'bachata', timer: null };
    this.seq.timer = window.setInterval(() => this.schedule(), 30);
  }

  private schedule() {
    const c = this.ctx;
    const s = this.seq;
    if (!c || !s) return;
    const bpm = s.genre === 'merengue' ? 136 : 124;
    const step = 60 / bpm / 4;
    // Original progressions: bachata Am–Dm–E7–Am, merengue C–G7 (I–V)
    const prog = s.genre === 'bachata' ? [[57, 60, 64], [62, 65, 69], [64, 68, 71], [57, 60, 64]] : [[60, 64, 67], [60, 64, 67], [67, 71, 74], [67, 71, 74]];
    const bass = s.genre === 'bachata' ? [45, 50, 52, 45] : [48, 48, 43, 43];
    const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
    while (s.next < c.currentTime + 0.12) {
      const t = s.next;
      const st = s.step % 16;
      const bar = Math.floor(s.step / 16) % 4;
      const chord = prog[bar];
      // güira scrape
      if (s.genre === 'merengue' ? st % 2 === 0 || st % 4 === 3 : st % 2 === 0) this.voiceNoise(t, s.genre === 'merengue' ? 0.05 : 0.07, 7000, st % 4 === 0 ? 0.11 : 0.06);
      // tambora / bongó
      if (s.genre === 'merengue' ? [0, 6, 8, 11, 14].includes(st) : [0, 4, 8, 10, 12].includes(st)) this.voiceDrum(t, st % 8 === 0 ? 120 : 190, 0.35);
      // bass
      if (st === 0 || st === (s.genre === 'merengue' ? 10 : 7) || st === 12) this.voiceTone(t, midi(bass[bar] + (st === 12 ? 7 : 0)), 'triangle', step * 2.5, 0.28, 600);
      // requinto arpeggio (bachata) / accordion stabs (merengue)
      if (s.genre === 'bachata') {
        const n = chord[[0, 1, 2, 1][st % 4]] + 12;
        this.voiceTone(t, midi(n), 'sawtooth', step * 1.4, 0.07, 2200, true);
      } else if (st % 4 === 2) chord.forEach((n) => this.voiceTone(t, midi(n + 12), 'square', step * 0.9, 0.035, 1800));
      s.step++;
      s.next += step;
      if (s.step % 256 === 0) s.genre = s.genre === 'bachata' ? 'merengue' : 'bachata';
    }
  }

  private voiceNoise(t: number, dur: number, hp: number, g: number) {
    const c = this.ctx!;
    const src = this.noiseSrc(false);
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const gn = c.createGain();
    gn.gain.setValueAtTime(g, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(gn).connect(this.musicPanner);
    src.start(t, Math.random(), dur + 0.02);
  }

  private voiceDrum(t: number, f0: number, g: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + 0.12);
    const gn = c.createGain();
    gn.gain.setValueAtTime(g, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(gn).connect(this.musicPanner);
    o.start(t);
    o.stop(t + 0.2);
  }

  private voiceTone(t: number, f: number, type: OscillatorType, dur: number, g: number, lp: number, pluck = false) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(lp, t);
    if (pluck) flt.frequency.exponentialRampToValueAtTime(lp * 0.25, t + dur);
    const gn = c.createGain();
    gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(g, t + 0.006);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(flt).connect(gn).connect(this.musicPanner);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private buildSeaGrid(world: WorldStreamer) {
    const b = world.manifest.bounds;
    const cell = this.seaGrid.cell;
    const nx = Math.ceil((b.maxX - b.minX) / cell);
    const nz = Math.ceil((b.maxZ - b.minZ) / cell);
    this.seaGrid = { x0: b.minX, z0: b.minZ, cell, nx, nz };
    const pts: number[] = [];
    for (const poly of world.map.water) for (const ring of poly) for (const p of ring) pts.push(p[0], p[1]);
    const grid = new Float32Array(nx * nz).fill(9999);
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const x = b.minX + (i + 0.5) * cell;
        const z = b.minZ + (j + 0.5) * cell;
        let best = 9999;
        for (let k = 0; k < pts.length; k += 2) best = Math.min(best, Math.hypot(pts[k] - x, pts[k + 1] - z));
        grid[i * nz + j] = best;
      }
    this.seaDist = grid;
  }

  private seaDistance(x: number, z: number): number {
    if (!this.seaDist) return 9999;
    const g = this.seaGrid;
    const i = Math.floor((x - g.x0) / g.cell);
    const j = Math.floor((z - g.z0) / g.cell);
    if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) return 9999;
    return this.seaDist[i * g.nz + j];
  }

  update(dt: number, camera: THREE.Camera, player: THREE.Vector3, veh: Vehicle | null, traffic: TrafficLike, world: WorldStreamer, night: number, rain: number) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (!this.seaDist) this.buildSeaGrid(world);
    const L = this.ctx.listener;
    const p = camera.position;
    const f = new THREE.Vector3();
    camera.getWorldDirection(f);
    if (L.positionX) {
      const t = this.ctx.currentTime;
      L.positionX.setTargetAtTime(p.x, t, 0.02);
      L.positionY.setTargetAtTime(p.y, t, 0.02);
      L.positionZ.setTargetAtTime(p.z, t, 0.02);
      L.forwardX.setTargetAtTime(f.x, t, 0.02);
      L.forwardY.setTargetAtTime(f.y, t, 0.02);
      L.forwardZ.setTargetAtTime(f.z, t, 0.02);
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    }
    const sd = this.seaDistance(player.x, player.z);
    const near = traffic.nearest(player.x, player.z, 6).filter((a) => (a.x - player.x) ** 2 + (a.z - player.z) ** 2 < 70 * 70).length;
    this.bedLevel('city', (0.1 + near * 0.025) * (1 - night * 0.4));
    this.bedLevel('sea', Math.max(0, 1 - sd / 160) * 0.5);
    const speed = veh ? Math.abs(veh.speed) : 0;
    const inCar = !!veh && !veh.spec.twoWheels;
    const rush = Math.min(1, speed / 38) ** 2 * (veh?.spec.twoWheels ? 0.4 : 0.14);
    // inside a car the rain is muffled and drums on the roof instead
    this.bedLevel('rain', rain * (inCar ? 0.12 : 0.35));
    this.bedLevel('roof', inCar ? rain * 0.3 : 0);
    this.bedLevel('wind', 0.05 + rain * 0.12 + rush);
    if (this.skid && this.skidFilter) {
      let slide = 0;
      if (veh && speed > 3) {
        const v = veh.body.linvel();
        const f = veh.forward;
        const lateral = Math.abs(v.x * f.z - v.z * f.x);
        slide = THREE.MathUtils.smoothstep(lateral, 2.2, 7.5);
        if (veh.input.handbrake) slide = Math.max(slide, Math.min(1, speed / 14) * 0.6);
        if (veh.input.brake > 0.85 && speed > 14) slide = Math.max(slide, 0.35);
        if (veh.spec.twoWheels) slide *= 0.6;
      }
      const t = this.ctx.currentTime;
      this.skid.gain.setTargetAtTime(slide * 0.22, t, slide > 0 ? 0.05 : 0.12);
      this.skidFilter.frequency.setTargetAtTime(1500 + slide * 600 + Math.min(speed, 30) * 10, t, 0.1);
    }
    this.radio?.update(!!veh);
    this.bedLevel('insects', night * 0.012 * (1 - rain));
    this.bedLevel('crowd', 0.02 * (1 - night * 0.5));
    // birds by day, dogs at night
    this.birdTimer -= dt;
    if (night < 0.4 && rain < 0.3 && this.birdTimer <= 0) {
      this.birdTimer = 1.5 + Math.random() * 4;
      const a = Math.random() * Math.PI * 2;
      const pos = { x: player.x + Math.cos(a) * 18, z: player.z + Math.sin(a) * 18 };
      const base = 2600 + Math.random() * 1600;
      for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) setTimeout(() => this.tone([base], 'sine', 0.09, 0.05, pos, 1.35), k * 120);
    }
    this.dogTimer -= dt;
    if (night > 0.6 && this.dogTimer <= 0) {
      this.dogTimer = 12 + Math.random() * 25;
      const a = Math.random() * Math.PI * 2;
      const pos = { x: player.x + Math.cos(a) * 45, z: player.z + Math.sin(a) * 45 };
      for (let k = 0; k < 2; k++) setTimeout(() => this.burst(0.14, 'bandpass', 700, 0.25, pos), k * 260);
    }
    // music from the nearest colmado / bar
    let best: { x: number; z: number; kind: string } | null = null;
    let bd = 60;
    for (const s of world.shops()) {
      if (s.kind !== 'colmado' && s.kind !== 'bar') continue;
      const d = Math.hypot(s.x - player.x, s.z - player.z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (this.seq && best) {
      this.musicPanner.positionX.setTargetAtTime(best.x, this.ctx.currentTime, 0.3);
      this.musicPanner.positionY.value = 2;
      this.musicPanner.positionZ.setTargetAtTime(best.z, this.ctx.currentTime, 0.3);
      if (best.kind === 'bar' && night > 0.5) this.seq.genre = 'merengue';
    } else if (this.seq) this.musicPanner.positionY.value = -500;
    void veh;
  }

  dispose() {
    if (this.seq?.timer) clearInterval(this.seq.timer);
    this.seq = null;
    void this.ctx?.close();
    this.ctx = null;
  }
}
