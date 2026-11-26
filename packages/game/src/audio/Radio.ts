/**
 * Car radio: four fictional Dominican stations whose music is generated on the fly (original patterns, no
 * samples, no recordings): bachata, merengue, dembow and perico ripiao (típico). Each station plays endless
 * songs — a new key, tempo, chord progression, melody and arrangement every song — with a short station
 * ident between songs. Everything is synthesised with Web Audio and scheduled slightly ahead of time.
 */

export type Genre = 'bachata' | 'merengue' | 'dembow' | 'tipico';

export interface Station {
  id: string;
  name: string;
  genre: Genre;
}

/** Fictional stations (names and frequencies are invented). */
export const STATIONS: readonly Station[] = [
  { id: 'bachata', name: 'Bachata Mía 104.1', genre: 'bachata' },
  { id: 'merengue', name: 'Merengazo 97.7', genre: 'merengue' },
  { id: 'dembow', name: 'La Calle 89.5 · Dembow', genre: 'dembow' },
  { id: 'tipico', name: 'Típico del Cibao 92.3', genre: 'tipico' },
];

/** Loudness trims measured offline (RMS after the intro) so every station plays at about the same level. */
export const GENRE_TRIM: Record<Genre, number> = { bachata: 1.33, merengue: 1.27, dembow: 0.73, tipico: 0.95 };

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

/** Small deterministic PRNG so a song can be re-generated from its seed (tests, offline renders). */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

interface ToneOpts {
  attack?: number;
  pluck?: boolean;
  vibrato?: number;
  detune?: number;
  glideFrom?: number;
}

/** Synth voices that write into one destination node. */
export class Voices {
  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly out: AudioNode,
    private readonly noiseBuf: AudioBuffer,
  ) {}

  private env(t: number, peak: number, attack: number, dur: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.01, dur));
    g.connect(this.out);
    return g;
  }

  tone(t: number, freq: number, type: OscillatorType, dur: number, gain: number, cutoff: number, o: ToneOpts = {}) {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = type;
    if (o.glideFrom) {
      osc.frequency.setValueAtTime(o.glideFrom, t);
      osc.frequency.exponentialRampToValueAtTime(freq, t + Math.min(0.12, dur * 0.5));
    } else osc.frequency.setValueAtTime(freq, t);
    if (o.detune) osc.detune.value = o.detune;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = o.pluck ? 2.5 : 0.7;
    if (o.pluck) {
      f.frequency.setValueAtTime(cutoff * 2.2, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff * 0.35), t + dur);
    } else f.frequency.value = cutoff;
    osc.connect(f).connect(this.env(t, gain, o.attack ?? 0.004, dur));
    let lfo: OscillatorNode | null = null;
    if (o.vibrato) {
      lfo = c.createOscillator();
      lfo.frequency.value = 5.6;
      const lg = c.createGain();
      lg.gain.value = freq * o.vibrato;
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noise(t: number, dur: number, hp: number, gain: number, lp = 14000) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const h = c.createBiquadFilter();
    h.type = 'highpass';
    h.frequency.value = hp;
    const l = c.createBiquadFilter();
    l.type = 'lowpass';
    l.frequency.value = lp;
    src.connect(h).connect(l).connect(this.env(t, gain, 0.002, dur));
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  drum(t: number, f0: number, f1: number, dur: number, gain: number) {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
    osc.connect(this.env(t, gain, 0.002, dur));
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  kick(t: number, g: number) {
    this.drum(t, 160, 42, 0.32, g);
    this.noise(t, 0.012, 2500, g * 0.25, 6000);
  }

  snare(t: number, g: number) {
    this.noise(t, 0.16, 1500, g, 9000);
    this.drum(t, 240, 170, 0.09, g * 0.45);
  }
}

type Section = 'intro' | 'verse' | 'chorus' | 'break' | 'outro';

const SCALES = { minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11] };

/** Chord progressions as scale-degree roots (0-based) — common, generic harmony. */
const PROGRESSIONS: Record<Genre, number[][]> = {
  bachata: [
    [0, 3, 4, 0],
    [0, 5, 3, 4],
    [0, 3, 6, 4],
  ],
  merengue: [
    [0, 4, 4, 0],
    [0, 3, 4, 0],
    [0, 5, 3, 4],
  ],
  dembow: [
    [0, 5, 6, 4],
    [0, 3, 5, 4],
    [0, 0, 5, 6],
  ],
  tipico: [
    [0, 4, 4, 0],
    [0, 3, 4, 4],
    [0, 0, 4, 0],
  ],
};

const GENRE: Record<Genre, { bpm: [number, number]; mode: 'minor' | 'major'; root: [number, number] }> = {
  bachata: { bpm: [124, 132], mode: 'minor', root: [55, 62] },
  merengue: { bpm: [138, 150], mode: 'major', root: [53, 60] },
  dembow: { bpm: [112, 120], mode: 'minor', root: [50, 56] },
  tipico: { bpm: [148, 160], mode: 'major', root: [55, 62] },
};

/** One procedurally generated song. `play` schedules one 16th-note step. */
export class Song {
  readonly bpm: number;
  readonly bars: number;
  private readonly root: number;
  private readonly scale: number[];
  private readonly prog: number[];
  private readonly motif: (number | null)[];
  private readonly answer: (number | null)[];
  private readonly rand: () => number;

  constructor(
    readonly genre: Genre,
    readonly seed: number,
  ) {
    const r = rng(seed * 7919 + genre.length * 131);
    this.rand = r;
    const g = GENRE[genre];
    this.bpm = Math.round(g.bpm[0] + r() * (g.bpm[1] - g.bpm[0]));
    this.root = Math.round(g.root[0] + r() * (g.root[1] - g.root[0]));
    this.scale = SCALES[g.mode];
    const progs = PROGRESSIONS[genre];
    this.prog = progs[Math.floor(r() * progs.length)];
    this.bars = 32;
    // a two-bar hook (8th notes; null = rest) and its answer phrase, in scale degrees
    const phrase = (restP: number) => Array.from({ length: 16 }, (_, i) => (i % 2 === 1 && r() < restP ? null : Math.floor(r() * 9) - 1));
    this.motif = phrase(0.45);
    this.answer = phrase(0.6);
  }

  get stepDur() {
    return 60 / this.bpm / 4;
  }

  section(bar: number): Section {
    if (bar < 4) return 'intro';
    if (bar >= this.bars - 2) return 'outro';
    if (bar >= 20 && bar < 22) return 'break';
    return (bar >= 12 && bar < 20) || bar >= 24 ? 'chorus' : 'verse';
  }

  /** MIDI note of a scale degree relative to the song root (degrees may be negative or above 7). */
  note(degree: number, octave = 0) {
    const n = this.scale.length;
    const o = Math.floor(degree / n);
    const d = ((degree % n) + n) % n;
    return this.root + this.scale[d] + 12 * (o + octave);
  }

  private chordDeg(bar: number) {
    return this.prog[bar % this.prog.length];
  }

  private chord(bar: number, octave = 0) {
    const d = this.chordDeg(bar);
    return [this.note(d, octave), this.note(d + 2, octave), this.note(d + 4, octave)];
  }

  play(v: Voices, t: number, bar: number, st: number) {
    const sec = this.section(bar);
    const full = sec === 'chorus';
    const drums = sec !== 'break';
    const dur = this.stepDur;
    const ch = this.chord(bar);
    const bass = this.note(this.chordDeg(bar), -2);
    const fade = sec === 'outro' ? 1 - ((bar - (this.bars - 2)) * 16 + st) / 32 : 1;
    const G = (x: number) => x * fade;
    const hook = (bar % 4 < 2 ? this.motif : this.answer)[(bar % 2) * 8 + (st >> 1)];
    switch (this.genre) {
      case 'bachata': {
        if (drums) {
          v.noise(t, 0.06, 6500, G(st % 4 === 0 ? 0.07 : 0.04)); // güira
          if (st % 2 === 0) v.drum(t, st % 4 === 0 ? 330 : 250, st % 4 === 0 ? 300 : 225, 0.09, G(0.16)); // bongó martillo
          if (st === 14) v.drum(t, 110, 70, 0.25, G(0.3)); // bajo de bongó
        }
        if (st === 0 || st === 6 || st === 8 || st === 12) v.tone(t, midi(bass + (st === 12 ? 7 : 0)), 'triangle', dur * 3, G(0.24), 520);
        // requinto: 16th arpeggios, the bachata signature
        if (sec !== 'intro' || bar >= 2) {
          const arp = ch[[0, 1, 2, 1][st % 4]] + 12;
          v.tone(t, midi(arp), 'sawtooth', dur * 1.6, G(full ? 0.055 : 0.04), 2600, { pluck: true });
        }
        if (st % 4 === 2) ch.forEach((n) => v.tone(t, midi(n), 'triangle', dur * 1.4, G(0.025), 1800, { pluck: true })); // segunda
        if (full && hook !== null && hook !== undefined && st % 2 === 0) v.tone(t, midi(this.note(hook, 1)), 'sawtooth', dur * 2.6, G(0.05), 3200, { pluck: true, vibrato: 0.004 });
        break;
      }
      case 'merengue': {
        if (drums) {
          v.noise(t, 0.045, 7000, G(st % 2 === 0 ? 0.06 : 0.035)); // güira chi-ki
          if ([0, 3, 6, 8, 11, 14].includes(st)) v.drum(t, st % 8 === 0 ? 120 : 200, st % 8 === 0 ? 80 : 150, 0.14, G(st === 3 || st === 11 ? 0.2 : 0.3)); // tambora
          if (st === 6 || st === 14) v.noise(t, 0.03, 3000, G(0.08), 6000); // golpe de mano
        }
        if (st === 0 || st === 8 || st === 7 || st === 15) v.tone(t, midi(bass + (st === 8 ? 7 : 0)), 'triangle', dur * 2, G(0.24), 600);
        if (st % 4 === 2) ch.forEach((n) => v.tone(t, midi(n + 12), 'square', dur * 0.8, G(0.022), 2200)); // piano / acordeón stabs
        // saxophone line: hook in the chorus, fast runs in the verse
        if (full && hook !== null && hook !== undefined) v.tone(t, midi(this.note(hook + (st % 2), 1)), 'sawtooth', dur * 1.1, G(0.035), 2800, { vibrato: 0.003, attack: 0.01 });
        else if (sec === 'verse' && bar % 4 === 3 && st >= 8) v.tone(t, midi(this.note(st - 6, 1)), 'sawtooth', dur * 0.9, G(0.03), 2600);
        break;
      }
      case 'dembow': {
        if (drums) {
          if (st === 0 || st === 8) v.kick(t, G(0.5));
          if (st === 3 || st === 6 || st === 11 || st === 14) v.snare(t, G(0.2)); // the 3-3-2 dembow snare
          if (st % 2 === 0) v.noise(t, 0.03, 8000, G(0.035)); // hi-hat
          if (full && st % 4 === 3) v.noise(t, 0.02, 9000, G(0.02));
        }
        // 808-style sub bass with slides
        if (st === 0 || st === 10) v.tone(t, midi(bass), 'sine', dur * (st === 0 ? 7 : 5), G(0.38), 400, st === 10 ? { glideFrom: midi(bass + 5) } : {});
        // synth stab motif
        if ((st === 2 || st === 5 || st === 9) && sec !== 'intro') ch.forEach((n) => v.tone(t, midi(n + 12), 'square', dur * 0.7, G(0.018), 1500));
        if (full && hook !== null && hook !== undefined && st % 2 === 0) v.tone(t, midi(this.note(hook, 1)), 'square', dur * 1.8, G(0.03), 2400, { detune: 6 });
        break;
      }
      case 'tipico': {
        if (drums) {
          v.noise(t, 0.04, 7500, G(st % 4 === 0 ? 0.07 : 0.045)); // güira 16ths
          if ([0, 2, 5, 8, 10, 13].includes(st)) v.drum(t, st % 8 === 0 ? 115 : 210, st % 8 === 0 ? 75 : 160, 0.12, G(0.28)); // tambora
        }
        // marimba (marimbula) bass: plucked
        if (st % 4 === 0) v.tone(t, midi(bass + (st === 4 || st === 12 ? 7 : 0)), 'sine', dur * 2.5, G(0.3), 700, { pluck: true });
        // accordion: fast melodic runs (always busy in perico ripiao), chords on the off-beats
        if (hook !== null && hook !== undefined) {
          const n = this.note(hook + (st % 2 === 1 ? 1 : 0), 1);
          v.tone(t, midi(n), 'square', dur * 0.95, G(full ? 0.032 : 0.024), 3000, { vibrato: 0.006, detune: 4 });
          v.tone(t, midi(n), 'sawtooth', dur * 0.95, G(full ? 0.018 : 0.012), 2200, { vibrato: 0.006, detune: -5 });
        }
        if (st % 4 === 2) ch.forEach((n) => v.tone(t, midi(n + 12), 'square', dur * 0.6, G(0.016), 2000));
        break;
      }
    }
    void this.rand;
  }

  /** Short station ident between songs: rising three-note sting. */
  static ident(v: Voices, t: number) {
    [0, 4, 7, 12].forEach((s, i) => v.tone(t + i * 0.09, midi(72 + s), 'triangle', 0.5 - i * 0.05, 0.05, 5000));
    v.drum(t, 90, 50, 0.5, 0.3);
    v.noise(t + 0.3, 0.4, 5000, 0.03);
  }
}

/** Schedules songs for one station; `scheduleUntil` is called every frame (look-ahead scheduling). */
export class StationPlayer {
  private song: Song;
  private bar = 0;
  private step = 0;
  private next: number;
  private songIndex: number;
  private identUntil = 0;

  constructor(
    readonly station: Station,
    private readonly voices: Voices,
    startTime: number,
    seed = Math.floor(Math.random() * 1e6),
  ) {
    this.songIndex = seed;
    this.song = new Song(station.genre, seed);
    this.next = startTime;
  }

  get currentSong() {
    return this.song;
  }

  scheduleUntil(until: number) {
    while (this.next < until) {
      if (this.next < this.identUntil) {
        this.next = this.identUntil;
        continue;
      }
      this.song.play(this.voices, this.next, this.bar, this.step);
      this.next += this.song.stepDur;
      if (++this.step === 16) {
        this.step = 0;
        if (++this.bar >= this.song.bars) {
          Song.ident(this.voices, this.next + 0.1);
          this.identUntil = this.next + 1.2;
          this.bar = 0;
          this.song = new Song(this.station.genre, ++this.songIndex);
        }
      }
    }
  }
}

/**
 * The radio of the vehicle the player is driving: a "car speaker" EQ, a station switcher with tuning
 * static and smooth fades when getting in or out.
 */
export class CarRadio {
  private readonly bus: GainNode;
  private readonly voicesOut: GainNode;
  private player: StationPlayer | null = null;
  private index = 0; // index into STATIONS, or -1 = off
  private inVehicle = false;
  private duck = 1;

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
    private readonly noiseBuf: AudioBuffer,
  ) {
    const c = ctx;
    this.bus = c.createGain();
    this.bus.gain.value = 0;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 85;
    const presence = c.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 2400;
    presence.gain.value = 2.5;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 9500;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.voicesOut = c.createGain();
    this.voicesOut.gain.value = 0.9;
    this.voicesOut.connect(hp).connect(presence).connect(lp).connect(comp).connect(this.bus).connect(out);
    this.index = Math.floor(Math.random() * STATIONS.length);
  }

  get station(): Station | null {
    return this.index >= 0 ? STATIONS[this.index] : null;
  }

  /** Next station (…→ off → first station). Returns the new station, or null when the radio is off. */
  next(): Station | null {
    this.index = this.index + 1 >= STATIONS.length ? -1 : this.index + 1;
    this.tuneStatic();
    this.restart();
    return this.station;
  }

  private restart() {
    this.player = null;
    const s = this.station;
    if (s) this.voicesOut.gain.value = 0.9 * GENRE_TRIM[s.genre];
    if (s && this.inVehicle) this.player = new StationPlayer(s, new Voices(this.ctx, this.voicesOut, this.noiseBuf), this.ctx.currentTime + 0.4);
  }

  private tuneStatic() {
    const c = this.ctx;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + 0.35);
    bp.Q.value = 1.4;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    src.connect(bp).connect(g).connect(this.bus);
    src.start(t, Math.random(), 0.4);
  }

  /** Lower the music while mission dialogue is on screen. */
  setDuck(on: boolean) {
    this.duck = on ? 0.45 : 1;
  }

  update(inVehicle: boolean) {
    const t = this.ctx.currentTime;
    if (inVehicle !== this.inVehicle) {
      this.inVehicle = inVehicle;
      if (inVehicle) this.restart();
    }
    const target = inVehicle && this.station ? 0.5 * this.duck : 0;
    this.bus.gain.setTargetAtTime(target, t, inVehicle ? 0.25 : 0.12);
    if (!inVehicle && this.bus.gain.value < 0.002) this.player = null;
    this.player?.scheduleUntil(t + 0.25);
  }
}
