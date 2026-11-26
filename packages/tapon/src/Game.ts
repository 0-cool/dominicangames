import type { TaponStats } from '@sd/shared';
import { TaponAudio, type Volumes } from './audio.ts';
import { PLAYER_X, PX, VIEW_W } from './config.ts';
import { planPath, predictFree } from './sim/fairness.ts';
import { KINDS } from './sim/kinds.ts';
import { InputRecorder, SIM_STEP, SIM_VERSION } from './sim/replay.ts';
import { World, sprites } from './sim/world.ts';
import { SpriteCache } from './render/images.ts';
import { FONT_NUM, FONT_TXT, Renderer, laneS, laneY } from './render/Renderer.ts';
import { Street } from './render/street.ts';

export type TaponState = 'loading' | 'menu' | 'playing' | 'paused' | 'over';

/** A run the server registered beforehand (its seed makes the run verifiable); `ref` is opaque to the game. */
export interface RunTicket {
  seed: number;
  ref: unknown;
}

/** Everything needed to submit (and replay) a finished run. */
export interface FinishedRun {
  score: number;
  stats: TaponStats;
  seed: number;
  steps: number;
  inputs: number[];
  simVersion: number;
  /** The ticket the run was played with (null = local run that cannot enter the high-score table). */
  ticket: RunTicket | null;
}

export type TaponGameEvent =
  | { type: 'state'; state: TaponState }
  | { type: 'started'; ticket: RunTicket | null }
  | { type: 'gameOver'; run: FinishedRun }
  | { type: 'muted'; muted: boolean };

export interface TaponOptions {
  canvas: HTMLCanvasElement;
  onEvent?: (e: TaponGameEvent) => void;
  /** Called when a run starts: a server ticket (seed) for the run, or null to play an unranked local run. */
  takeTicket?: () => RunTicket | null;
  /** Best score shown in the HUD. */
  best?: number;
  volumes?: Volumes;
  debug?: boolean;
}

const STEP = SIM_STEP;

/**
 * El Tapón: owns the canvas, the fixed-step loop, input and the glue between simulation, renderer and audio.
 * In the menu the road keeps running with an autopilot (attract mode).
 */
export class TaponGame {
  state: TaponState = 'loading';
  world: World;
  readonly audio: TaponAudio;
  private cache: SpriteCache;
  private renderer!: Renderer;
  private street: Street;
  private g: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private fps = 60;
  private fpsAcc = { t: 0, n: 0 };
  private scale = 0;
  private resizeObs: ResizeObserver | null = null;
  private keys: (e: KeyboardEvent) => void;
  private disposed = false;
  private recorder = new InputRecorder();
  private ticket: RunTicket | null = null;
  best: number;

  constructor(private readonly opts: TaponOptions) {
    const g = opts.canvas.getContext('2d', { alpha: false });
    if (!g) throw new Error('Canvas 2D no disponible');
    this.g = g;
    this.best = opts.best ?? 0;
    this.audio = new TaponAudio(opts.volumes ?? { master: 0.8, music: 0.6, sfx: 0.9 });
    const all = sprites();
    this.cache = new SpriteCache((id) => all.get(id));
    this.street = new Street(this.cache, 7);
    this.world = new World(Math.floor(Math.random() * 1e9));
    this.keys = (e) => this.onKey(e);
  }

  private emit(e: TaponGameEvent) {
    this.opts.onEvent?.(e);
  }

  private setState(s: TaponState) {
    this.state = s;
    this.emit({ type: 'state', state: s });
  }

  async init() {
    // the HUD fonts must be loaded before the first frame (nothing else on the page may be using them yet)
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts) await Promise.all([fonts.load(`64px ${FONT_NUM}`), fonts.load(`800 20px ${FONT_TXT}`), fonts.ready]).catch(() => undefined);
    this.measure();
    await this.rasterizeAll();
    this.renderer = new Renderer(this.g, this.cache, sprites(), this.street);
    this.renderer.scale = this.scale;
    const sky = this.street.skyline();
    await this.cache.add('skyline', sky.svg, sky.w, sky.h, this.scale * 0.5);
    await this.street.prime(this.world.dist);
    // disposed while loading (e.g. the player left the page): never start the loop
    if (this.disposed) return;
    window.addEventListener('keydown', this.keys);
    this.resizeObs = new ResizeObserver(() => this.onResize());
    this.resizeObs.observe(this.opts.canvas);
    if (this.opts.debug) (window as unknown as { __TAPON__: TaponGame }).__TAPON__ = this;
    this.setState('menu');
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.frame(Math.min(0.1, Math.max(0, (now - this.last) / 1000)));
      this.last = now;
    };
    this.raf = requestAnimationFrame(loop);
  }

  private measure() {
    const c = this.opts.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(640, Math.min(2560, Math.round((c.clientWidth || VIEW_W) * dpr)));
    const h = Math.round((w * 9) / 16);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    this.scale = w / VIEW_W;
  }

  private rasterizing = false;
  private async rasterizeAll() {
    this.rasterizing = true;
    await this.cache.load(sprites().keys(), this.scale);
    this.rasterizing = false;
  }

  private onResize() {
    const before = this.scale;
    this.measure();
    if (this.renderer) this.renderer.scale = this.scale;
    if (Math.abs(this.scale - before) / before > 0.12 && !this.rasterizing) {
      void this.rasterizeAll().then(async () => {
        this.street.invalidate();
        const sky = this.street.skyline();
        await this.cache.add('skyline', sky.svg, sky.w, sky.h, this.scale * 0.5);
      });
    }
  }

  // ───────────────────────── control ─────────────────────────
  /** Start a new run (from the menu, after game over, or restarting). */
  start() {
    this.ticket = this.opts.takeTicket?.() ?? null;
    this.world = new World(this.ticket ? this.ticket.seed : Math.floor(Math.random() * 1e9));
    this.recorder = new InputRecorder();
    this.emit({ type: 'started', ticket: this.ticket });
    this.acc = 0;
    this.audio.resume();
    this.audio.startRun();
    this.setState('playing');
  }

  pause() {
    if (this.state !== 'playing') return;
    this.audio.suspend();
    this.setState('paused');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.audio.resume();
    this.last = performance.now();
    this.setState('playing');
  }

  /** Back to the attract-mode menu. */
  menu() {
    this.audio.stopRun();
    this.world = new World(Math.floor(Math.random() * 1e9));
    this.setState('menu');
  }

  setVolumes(v: Volumes) {
    this.audio.setVolumes(v);
  }

  setMuted(m: boolean) {
    this.audio.setMuted(m);
    this.emit({ type: 'muted', muted: m });
  }

  private onKey(e: KeyboardEvent) {
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (typing) return;
    const code = e.code;
    // only while driving: in menus the keys belong to the focused button or slider
    if (this.state === 'playing' && ['ArrowUp', 'ArrowDown', 'Space'].includes(code)) e.preventDefault();
    // holding a key does not zigzag: one press = one lane
    if (e.repeat && ['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown'].includes(code)) return;
    if (this.state === 'playing') {
      if (code === 'KeyW' || code === 'ArrowUp') this.input(-1);
      else if (code === 'KeyS' || code === 'ArrowDown') this.input(1);
      else if (code === 'Escape' || code === 'KeyP') this.pause();
    } else if (this.state === 'paused') {
      if (code === 'Escape' || code === 'KeyP') this.resume();
      else if (code === 'KeyR') this.start();
    } else if (this.state === 'over') {
      if (code === 'KeyR') this.start();
    }
    if (code === 'KeyM') this.emit({ type: 'muted', muted: this.audio.toggleMute() });
  }

  /** A lane change by the player: applied now and recorded against the current step (for the replay). */
  private input(dir: -1 | 1) {
    this.recorder.record(this.world.steps, dir);
    this.world.move(dir);
  }

  // ───────────────────────── loop ─────────────────────────
  private frame(dt: number) {
    const w = this.world;
    if (this.state === 'playing' || this.state === 'menu') {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 6) {
        if (this.state === 'menu') this.autopilot();
        w.step(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps === 6) this.acc = 0;
      this.handleEvents();
      if (this.state === 'playing') this.audio.update(w.v);
    }
    this.street.update(w.dist);
    void this.street.ensure();
    this.fpsAcc.t += dt;
    this.fpsAcc.n++;
    if (this.fpsAcc.t >= 0.5) {
      this.fps = Math.round(this.fpsAcc.n / this.fpsAcc.t);
      this.fpsAcc = { t: 0, n: 0 };
    }
    this.renderer.draw(w, { best: this.best, paused: this.state === 'paused', hud: this.state !== 'menu', fps: this.opts.debug ? this.fps : undefined }, this.state === 'paused' ? 0 : dt);
  }

  /** Attract mode: the moto follows the fairness model's escape path. */
  private autopilot() {
    const w = this.world;
    if (w.over) {
      this.world = new World(Math.floor(Math.random() * 1e9));
      return;
    }
    const ents = w.entities.filter((e) => e.deadly && e.x + e.hb1 > w.dist - 30 && e.x < w.dist + 90).map(World.pred);
    const p = w.predPlayer();
    // drive like a calm player: decide only between lane changes and prefer the lane it is in
    if (Math.abs(w.lanePos - w.laneTarget) > 1e-3) return;
    const path = planPath(p, predictFree(p, ents), w.laneTarget);
    if (!path) return;
    for (let i = 1; i < path.length; i++) {
      if (path[i][1] !== path[i - 1][1]) {
        if (path[i - 1][0] === 0) w.move(path[i][1] > path[i - 1][1] ? 1 : -1);
        break;
      }
    }
  }

  private handleEvents() {
    const w = this.world;
    const live = this.state === 'playing';
    const r = this.renderer;
    const px = PLAYER_X + 110;
    for (const ev of w.events) {
      if (!live) continue;
      const py = laneY(w.lanePos) - 190 * laneS(w.lanePos);
      switch (ev.type) {
        case 'bonus':
          if (ev.label === 'Rebase') break;
          r.popup(`+${ev.points} ${ev.label}`, px + 120, py, ev.label.startsWith('¡') ? '#ffd23f' : '#9ff2a6');
          if (ev.label === '¡Por un pelo!' || ev.label === '¡Por el medio!') this.audio.closeCall();
          else this.audio.dodge();
          break;
        case 'crash':
          r.hit();
          r.burst(px, laneY(w.lanePos) - 60, ['#ffd23f', '#ff7a1a', '#ffffff', '#c62828'], 22, 380);
          this.audio.crash();
          if (ev.lives > 0) {
            this.audio.lifeLost();
            r.popup(ev.lives === 1 ? '¡Último casco!' : '¡Ay! −1 casco', px + 140, py - 40, '#ff6b6b', true);
          }
          break;
        case 'pothole':
          r.shakeBy(0.45);
          r.popup('¡Hoyo!', px + 100, py, '#ffb74d');
          this.audio.pothole();
          break;
        case 'pickup':
          this.audio.pickup();
          r.popup(ev.what === 'casco' ? '+1 casco' : '¡Pasajero a bordo!', px + 120, py - 40, '#9ff2a6');
          break;
        case 'ride':
          this.audio.ride();
          r.popup(`¡Carrera completada! +${ev.points}`, VIEW_W / 2, 420, '#ffd23f', true);
          break;
        case 'rideLost':
          r.popup('El pasajero se bajó', px + 160, py - 80, '#ff9e80');
          break;
        case 'plantain': {
          this.audio.plantain();
          const x = PLAYER_X + (ev.x - w.dist) * PX * laneS(ev.lane);
          r.burst(x, laneY(ev.lane) - 30, ['#4c8a2b', '#7aa83a', '#e8c547'], 8, 160);
          break;
        }
        case 'stage':
          r.stage(ev.stage);
          this.audio.stage();
          break;
        case 'warning':
          this.audio.warning();
          break;
        case 'horn': {
          const s = laneS(ev.lane);
          const x = PLAYER_X + (ev.x - w.dist) * PX * s;
          const pair = KINDS[ev.kind]?.horn ?? [440, 554];
          this.audio.horn(pair, (x / VIEW_W) * 2 - 1, Math.max(0, 1 - Math.abs(ev.x - w.dist) / 30));
          break;
        }
        case 'whistle':
          this.audio.whistle();
          break;
        case 'siren':
          this.audio.siren();
          break;
        case 'laneChange':
          this.audio.laneChange();
          break;
        case 'gameOver':
          this.audio.gameOver();
          this.audio.stopRun();
          if (w.score > this.best) this.best = w.score;
          this.setState('over');
          this.emit({ type: 'gameOver', run: { score: w.score, stats: w.finalStats(), seed: w.seed, steps: w.steps, inputs: this.recorder.encode(), simVersion: SIM_VERSION, ticket: this.ticket } });
          break;
      }
    }
    w.events.length = 0;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.keys);
    this.resizeObs?.disconnect();
    this.audio.close();
  }
}
