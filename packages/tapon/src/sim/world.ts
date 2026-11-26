import { TAPON_POINTS, type TaponStats } from '@sd/shared';
import { buildSprites, type Sprite } from '../art/index.ts';
import { COMBO_WINDOW_S, FAIR, INVULN_S, LANE_CHANGE_S, LANES, LIVES, PLAYER_X, PX, SPEED_MAX, STAGE_M, VIEW_W, baseSpeed, stageName } from '../config.ts';
import { followClamp, hasEscape, type PredEnt, type PredPlayer } from './fairness.ts';
import { KINDS, OBSTACLES } from './kinds.ts';

let SPRITES: Map<string, Sprite> | null = null;
/** All sprites (pure SVG strings + metrics), built once. */
export const sprites = () => (SPRITES ??= buildSprites());

/** Seeded random numbers (mulberry32) so runs and tests are reproducible. */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Cat = 'vehicle' | 'obstacle';

export interface Entity {
  id: number;
  /** Traffic kind (KINDS) or obstacle kind (OBSTACLES). */
  kind: string;
  cat: Cat;
  sprite: string;
  overlays: string[];
  deadly: boolean;
  /** Rear edge (m), length and hitbox interval relative to x (m). */
  x: number;
  len: number;
  hb0: number;
  hb1: number;
  lane: number;
  laneFrom: number;
  lanePos: number;
  /** Lane-change progress 0..1 (−1 = not changing) and its duration (s). */
  changeT: number;
  changeDur: number;
  changeTo: number;
  blinkT: number;
  v: number;
  vCruise: number;
  stopT: number;
  dropT: number;
  lcT: number;
  siren: boolean;
  passed: boolean;
  hit: boolean;
  wheel: number;
  bob: number;
  /** Seconds since it appeared (animations). */
  age: number;
  /** Falling plantain: progress 0..1 and start height (px above ground). */
  fall?: { t: number; h: number };
  /** Officer stopping a lane: seconds left in each pose. */
  pare?: number;
  leave?: number;
  say?: { text: string; t: number };
  /** Part of a closure / checkpoint (counted when passed). */
  closureEnd?: boolean;
}

export interface Client {
  id: number;
  x: number;
  /** 0 = upper sidewalk (reach from lane 0), 2 = lower sidewalk (lane 2). */
  side: 0 | 2;
  look: 0 | 1 | 2;
  picked: boolean;
}

export type Warning = { id: number; lane: number; kind: 'closure' | 'pare' | 'chequeo' | 'sirena' | 'hoyos'; text: string; until: number; behind?: boolean };

export type SimEvent =
  | { type: 'bonus'; label: string; points: number; lane: number }
  | { type: 'crash'; lives: number; kind: string }
  | { type: 'pothole' }
  | { type: 'pickup'; what: 'cliente' | 'casco' }
  | { type: 'ride'; points: number }
  | { type: 'rideLost' }
  | { type: 'plantain'; lane: number; x: number }
  | { type: 'stage'; stage: number; name: string }
  | { type: 'warning'; warning: Warning }
  | { type: 'horn'; kind: string; x: number; lane: number }
  | { type: 'whistle' }
  | { type: 'siren' }
  | { type: 'laneChange'; dir: number }
  | { type: 'gameOver' };

const emptyStats = (): TaponStats => ({ distanceM: 0, durationMs: 0, overtakes: 0, closeCalls: 0, squeezes: 0, plantainsDodged: 0, passengers: 0, ridesCompleted: 0, crashes: 0, helmets: 0, potholes: 0, closuresPassed: 0, maxCombo: 0 });

/** Metres visible ahead of the moto in the far lane (the widest view). */
const AHEAD_FAR = (VIEW_W - PLAYER_X) / (PX * LANES[0].s);
const SPAWN_X = AHEAD_FAR + 3;

/**
 * The El Tapón simulation: player, traffic, events, fairness, scoring. Deterministic for a seed and a sequence
 * of inputs; has no DOM dependency (rendering and audio listen to `events`).
 */
export class World {
  readonly rng: () => number;
  /** Fixed simulation steps taken (inputs are recorded against this counter for replays). */
  steps = 0;
  t = 0;
  dist = 0;
  v = baseSpeed(0);
  lanePos = 1;
  laneTarget = 1;
  private queued = 0;
  lives = LIVES;
  invuln = 0;
  private slow = 1;
  stats: TaponStats = emptyStats();
  bonusPoints = 0;
  combo = 0;
  comboT = 0;
  stage = 0;
  over = false;
  entities: Entity[] = [];
  clients: Client[] = [];
  warnings: Warning[] = [];
  passenger: { look: 0 | 1 | 2; until: number; kind: 'senora' | 'estudiante' | 'don' } | null = null;
  events: SimEvent[] = [];
  private nextId = 1;
  private spawnT = 0;
  private eventT = 5;
  private hornT = 2;
  private laneNext = [0, 0, 0];
  /** Each lane flows at its own slowly changing pace (m/s); cars follow it, so gaps between lanes persist. */
  laneFlow = [3.2, 5, 4.2];
  private closeCall: { from: number; until: number } | null = null;
  private lastOvertake: { t: number; side: number } | null = null;
  /** Player hitbox (m, relative to `dist`). */
  readonly phb0: number;
  readonly phb1: number;
  /** Debug: count of road changes refused by the fairness check, and off-screen cars removed to keep a way out. */
  refused = 0;
  repaired = 0;

  constructor(readonly seed = 1) {
    this.rng = makeRng(seed);
    const moto = sprites().get('moto-jugador')!;
    this.phb0 = moto.hitbox.x / PX;
    this.phb1 = (moto.hitbox.x + moto.hitbox.w) / PX;
    // initial traffic so the road is never empty at the start
    for (let lane = 0; lane < 3; lane++) this.laneNext[lane] = 10 + this.rng() * 8;
    this.prepopulate();
  }

  /** A few cars already in view when the run starts (never right in front of the moto). */
  private prepopulate() {
    for (const [lane, x] of [
      [0, 8 + this.rng() * 6],
      [2, 11 + this.rng() * 8],
      [1, 19 + this.rng() * 5],
    ] as [number, number][]) {
      const kind = this.rng() < 0.5 ? 'concho' : this.rng() < 0.5 ? 'sonata' : 'guagua';
      const def = KINDS[kind];
      const e = this.make(kind, 'vehicle', def.sprite, lane, x, def.speed[0] + this.rng() * (def.speed[1] - def.speed[0]), true);
      if (this.tryAdd([e])) this.laneNext[lane] = x + e.len + 6 + this.rng() * 8;
    }
  }

  get score(): number {
    return Math.floor(this.stats.distanceM) + this.bonusPoints;
  }
  get multiplier(): number {
    return Math.min(5, 1 + 0.5 * this.combo);
  }

  // ───────────────────────── input ─────────────────────────
  move(dir: -1 | 1) {
    if (this.over) return;
    const moving = Math.abs(this.lanePos - this.laneTarget) > 1e-3;
    if (moving) {
      this.queued = dir;
      return;
    }
    this.startMove(dir);
  }

  private startMove(dir: number) {
    const to = this.laneTarget + dir;
    if (to < 0 || to > 2) return;
    // close call: leaving a lane with something right in front of you
    const from = this.laneTarget;
    const front = this.dist + this.phb1;
    for (const e of this.entities) {
      if (!e.deadly || Math.abs(e.lanePos - from) > 0.5) continue;
      const gap = e.x + e.hb0 - front;
      if (gap > 0 && gap < 1.2) {
        this.closeCall = { from, until: this.t + LANE_CHANGE_S + 0.25 };
        break;
      }
    }
    this.laneTarget = to;
    this.events.push({ type: 'laneChange', dir });
  }

  // ───────────────────────── fairness ─────────────────────────
  predPlayer(): PredPlayer {
    // acceleration over the next second: speed ramp with distance + recovery after a bump
    const v1 = baseSpeed(this.dist + this.v) * Math.min(1, this.slow + 0.45);
    return { x0: this.dist + this.phb0, x1: this.dist + this.phb1, v: this.v, a: Math.max(0, v1 - this.v), vMax: Math.min(SPEED_MAX, baseSpeed(this.dist + this.v * FAIR.horizonS)), lanePos: this.lanePos, laneTarget: this.laneTarget };
  }

  static pred(e: Entity): PredEnt {
    const changing = e.changeT >= 0 && e.changeT < 1;
    return {
      id: e.id,
      x: e.x,
      hb0: e.hb0,
      hb1: e.hb1,
      v: e.v,
      vCruise: e.vCruise,
      lane: e.lane,
      laneFrom: changing ? e.laneFrom : e.lane,
      blinkLeft: e.blinkT > 0 ? e.blinkT : -1,
      changeLeft: changing ? (1 - e.changeT) * e.changeDur : -1,
      changeDur: e.changeDur,
      changeTo: e.changeTo,
      stopLeft: e.stopT > 0 ? e.stopT : -1,
      isStatic: e.cat === 'obstacle',
    };
  }

  /** Would the player still have a way through if `change` happened? */
  fair(change: (ents: PredEnt[]) => void, opts?: { horizonS?: number }): boolean {
    const ents = this.entities.filter((e) => e.deadly && e.x + e.hb1 > this.dist - 30 && e.x < this.dist + 90).map(World.pred);
    change(ents);
    const ok = hasEscape(this.predPlayer(), ents, { margin: FAIR.worldMargin, ...opts });
    if (!ok) this.refused++;
    return ok;
  }

  // ───────────────────────── entities ─────────────────────────
  private metrics(sprite: string) {
    const s = sprites().get(sprite)!;
    return { len: s.w / PX, hb0: s.hitbox.x / PX, hb1: (s.hitbox.x + s.hitbox.w) / PX };
  }

  private make(kind: string, cat: Cat, sprite: string, lane: number, x: number, v: number, deadly: boolean, overlays: string[] = []): Entity {
    const m = this.metrics(sprite);
    return { id: this.nextId++, kind, cat, sprite, overlays, deadly, x, ...m, lane, laneFrom: lane, lanePos: lane, changeT: -1, changeDur: 0.9, changeTo: lane, blinkT: 0, v, vCruise: v, stopT: 0, dropT: 1 + this.rng() * 2, lcT: 1 + this.rng() * 3, siren: false, passed: false, hit: false, wheel: this.rng() * 6, bob: this.rng() * 6, age: 0 };
  }

  private obstacle(kind: keyof typeof OBSTACLES | string, lane: number, x: number): Entity {
    const o = OBSTACLES[kind];
    return this.make(kind, 'obstacle', o.sprite, lane, x, 0, o.deadly);
  }

  /** Try to add entities as one change; returns false (nothing added) if it would trap the player. */
  private tryAdd(list: Entity[]): boolean {
    const deadly = list.filter((e) => e.deadly);
    if (deadly.length && !this.fair((ents) => ents.push(...deadly.map(World.pred)))) return false;
    this.entities.push(...list);
    return true;
  }

  private pickKind(): string {
    const entries = Object.entries(KINDS)
      .map(([k, d]) => [k, d.weight(this.stage)] as const)
      .filter(([, w]) => w > 0);
    let r = this.rng() * entries.reduce((s, [, w]) => s + w, 0);
    for (const [k, w] of entries) if ((r -= w) <= 0) return k;
    return entries[0][0];
  }

  private spawnTraffic() {
    const ahead = this.dist + SPAWN_X;
    for (let lane = 0; lane < 3; lane++) {
      if (this.laneNext[lane] > ahead + 40) continue;
      const x = Math.max(this.laneNext[lane], ahead + this.rng() * 4);
      if (x > ahead + 40) continue;
      const kind = this.pickKind();
      const def = KINDS[kind];
      const v = this.cruiseFor(kind, lane);
      const sprite = def.variants ? def.variants[Math.floor(this.rng() * def.variants.length)] : def.sprite;
      const e = this.make(kind, 'vehicle', sprite, lane, x, v, true, def.overlays ?? []);
      const overlaps = (l: number, a: number, b: number) => this.entities.some((o) => o.deadly && Math.abs(o.lanePos - l) < 0.75 && o.x + o.hb1 > a && o.x + o.hb0 < b);
      // a sane gap from whatever is already in this lane…
      const blocked = overlaps(lane, x - 1.5, x + e.len + 1.5);
      // …and never three lanes busy at the same stretch of road: there is always a corridor somewhere
      const others = [0, 1, 2].filter((l) => l !== lane && overlaps(l, x - 6, x + e.len + 6)).length;
      if (blocked || others === 2 || !this.tryAdd([e])) {
        this.laneNext[lane] = x + 3 + this.rng() * 3;
        continue;
      }
      // jams come in platoons: bumper to bumper, then a hole
      const platoon = this.rng() < Math.min(0.85, 0.6 + this.stage * 0.04);
      const gap = platoon ? 1.3 + this.rng() * 2.2 : Math.max(4, 12 - this.stage * 1.2) * (0.5 + this.rng());
      this.laneNext[lane] = x + e.len + gap;
    }
  }

  /** Cruise speed of a kind in a lane: the lane's flow, clamped to what that vehicle does. */
  private cruiseFor(kind: string, lane: number): number {
    const d = KINDS[kind];
    const want = this.laneFlow[lane] * (0.92 + this.rng() * 0.16);
    return Math.min(d.speed[1], Math.max(d.speed[0], want));
  }

  // ───────────────────────── special events ─────────────────────────
  private warn(w: Omit<Warning, 'id'>) {
    const warning = { ...w, id: this.nextId++ };
    this.warnings.push(warning);
    this.events.push({ type: 'warning', warning });
  }

  private specialEvent() {
    const s = this.stage;
    const options: [string, number][] = [
      ['hoyos', 3],
      ['cliente', this.passenger || this.clients.some((c) => !c.picked) ? 0 : 4],
      ['casco', this.lives < LIVES ? 1.5 : 0],
      ['closure', s >= 1 ? 3 : 1],
      ['pare', s >= 2 ? 2 : 0],
      ['chequeo', s >= 2 ? 2 : 0],
      ['sirena', s >= 1 ? 2 : 0],
    ];
    let r = this.rng() * options.reduce((a, [, w]) => a + w, 0);
    let pick = 'hoyos';
    for (const [k, w] of options) if ((r -= w) <= 0) {
      pick = k;
      break;
    }
    const lane = Math.floor(this.rng() * 3);
    const x0 = this.dist + SPAWN_X + 6;
    switch (pick) {
      case 'hoyos': {
        const n = 1 + Math.floor(this.rng() * 3);
        const list: Entity[] = [];
        for (let i = 0; i < n; i++) list.push(this.obstacle('hoyo', Math.floor(this.rng() * 3), x0 + i * (3 + this.rng() * 5)));
        this.entities.push(...list);
        break;
      }
      case 'cliente':
        this.clients.push({ id: this.nextId++, x: x0, side: this.rng() < 0.5 ? 0 : 2, look: Math.floor(this.rng() * 3) as 0 | 1 | 2, picked: false });
        break;
      case 'casco':
        this.entities.push(this.obstacle('casco', lane, x0));
        break;
      case 'closure': {
        // AMET / DIGESETT: cones, a DESVÍO sign, an officer and the patrol bike close one lane
        const len = 24 + this.rng() * 16;
        const list = [this.obstacle('desvio', lane, x0)];
        for (let x = x0 + 2.4; x < x0 + len; x += 3.2) list.push(this.obstacle('cono', lane, x));
        list.push(this.obstacle('agente-siga', lane, x0 + len * 0.45));
        list.push(this.obstacle('moto-parada', lane, x0 + len - 3));
        list[list.length - 1].closureEnd = true;
        if (this.tryAdd(list)) {
          this.warn({ lane, kind: 'closure', text: '¡Tránsito! Carril cerrado', until: this.t + 5 });
          this.events.push({ type: 'whistle' });
        }
        break;
      }
      case 'pare': {
        const officer = this.obstacle('agente-pare', lane, x0);
        officer.pare = 5 + this.rng() * 2;
        officer.closureEnd = true;
        if (this.tryAdd([officer])) {
          this.warn({ lane, kind: 'pare', text: '¡Agente de tránsito! Ese carril para', until: this.t + 5 });
          this.events.push({ type: 'whistle' });
        }
        break;
      }
      case 'chequeo': {
        const list = [this.obstacle('cono', lane, x0), this.obstacle('cono', lane, x0 + 2.8), this.obstacle('policia-parada', lane, x0 + 5.5)];
        list[2].closureEnd = true;
        list[2].siren = true;
        if (this.tryAdd(list)) this.warn({ lane, kind: 'chequeo', text: 'Chequeo policial: carril cerrado', until: this.t + 5 });
        break;
      }
      case 'sirena': {
        const def = KINDS.policia;
        const cop = this.make('policia', 'vehicle', def.sprite, lane, this.dist - 32, this.v + 5.5, true);
        cop.siren = true;
        if (this.tryAdd([cop])) {
          this.warn({ lane, kind: 'sirena', text: '¡Sirena! Abre paso', until: this.t + 4, behind: true });
          this.events.push({ type: 'siren' });
        }
        break;
      }
    }
  }

  // ───────────────────────── behaviours ─────────────────────────
  private laneFree(lane: number, x0: number, x1: number, except: Entity): boolean {
    return !this.entities.some((o) => o !== except && Math.abs(o.lanePos - lane) < 0.75 && o.x + o.hb1 > x0 && o.x + o.hb0 < x1);
  }

  private behave(e: Entity, dt: number) {
    const def = KINDS[e.kind];
    const ahead = e.x - this.dist;
    const visible = ahead > -1 && ahead < AHEAD_FAR + 4;
    // lane changes: random for conchos & co, forced when a closure blocks the lane ahead
    const blockedAhead = this.entities.some((o) => o.cat === 'obstacle' && o.deadly && Math.abs(o.lanePos - e.lane) < 0.5 && o.x > e.x && o.x - (e.x + e.len) < 14);
    const lcRate = blockedAhead ? 2 : (def?.laneChange ?? 0);
    e.lcT -= dt;
    if (e.cat === 'vehicle' && e.changeT < 0 && e.blinkT <= 0 && lcRate > 0 && e.lcT <= 0 && (visible || blockedAhead)) {
      e.lcT = 0.4;
      if (this.rng() < lcRate * 0.4) {
        const dirs = this.rng() < 0.5 ? [-1, 1] : [1, -1];
        for (const d of dirs) {
          const to = e.lane + d;
          if (to < 0 || to > 2 || !this.laneFree(to, e.x - 2.5, e.x + e.len + 2.5, e)) continue;
          const ok = this.fair((ents) => {
            const p = ents.find((q) => q.id === e.id);
            if (p) {
              p.blinkLeft = 0.7;
              p.changeTo = to;
            }
          });
          if (ok) {
            e.blinkT = 0.7;
            e.changeTo = to;
            if (this.rng() < 0.5) this.events.push({ type: 'horn', kind: e.kind, x: e.x, lane: e.lane });
          }
          break;
        }
      }
    }
    if (e.blinkT > 0) {
      e.blinkT -= dt;
      if (e.blinkT <= 0) {
        e.laneFrom = e.lane;
        e.lane = e.changeTo;
        e.changeT = 0;
      }
    }
    if (e.changeT >= 0) {
      e.changeT = Math.min(1, e.changeT + dt / e.changeDur);
      const k = e.changeT * e.changeT * (3 - 2 * e.changeT);
      e.lanePos = e.laneFrom + (e.lane - e.laneFrom) * k;
      if (e.changeT >= 1) {
        e.changeT = -1;
        e.laneFrom = e.lane;
        e.lanePos = e.lane;
      }
    }
    // sudden stops (guagua / OMSA) in the curb lanes
    if (def?.stops && e.stopT <= 0 && e.changeT < 0 && e.blinkT <= 0 && (e.lane === 0 || e.lane === 2) && ahead > 6 && ahead < 30 && this.rng() < def.stops * dt) {
      const stop = (def.stopTime?.[0] ?? 2) + this.rng() * ((def.stopTime?.[1] ?? 3) - (def.stopTime?.[0] ?? 2));
      if (this.fair((ents) => {
        const p = ents.find((q) => q.id === e.id);
        if (p) p.stopLeft = stop + 0.8;
      })) {
        e.stopT = stop + 0.8;
        e.say = { text: def.stopSay ?? 'Parada', t: 2.2 };
      }
    }
    if (e.stopT > 0) e.stopT -= dt;
    // La Platanera drops plantains behind it
    if (def?.drops && ahead > 5 && ahead < 26) {
      e.dropT -= dt;
      if (e.dropT <= 0) {
        e.dropT = 1.4 + this.rng() * 2.2;
        if (this.rng() < 0.65 && e.changeT < 0) {
          const p = this.obstacle(this.rng() < 0.7 ? 'platano' : 'racimo', e.lane, e.x - 1.0 - this.rng() * 0.6);
          const s = sprites().get(e.sprite)!;
          p.fall = { t: 0, h: (s.h - (s.anchors?.drop?.y ?? s.h * 0.5)) * 0.9 };
          if (this.tryAdd([p])) this.events.push({ type: 'plantain', lane: e.lane, x: p.x });
        }
      }
    }
    if (e.say) {
      e.say.t -= dt;
      if (e.say.t <= 0) e.say = undefined;
    }
  }

  // ───────────────────────── main step ─────────────────────────
  step(dt: number) {
    if (this.over) return;
    this.steps++;
    this.t += dt;
    this.stats.durationMs += dt * 1000;
    // player lane movement
    const dl = this.laneTarget - this.lanePos;
    if (Math.abs(dl) > 1e-3) {
      this.lanePos += Math.sign(dl) * Math.min(Math.abs(dl), dt / LANE_CHANGE_S);
      if (Math.abs(this.laneTarget - this.lanePos) <= 1e-3) {
        this.lanePos = this.laneTarget;
        if (this.closeCall && this.t <= this.closeCall.until + 0.2) {
          this.stats.closeCalls++;
          this.bonus(TAPON_POINTS.closeCall, '¡Por un pelo!');
        }
        this.closeCall = null;
        if (this.queued) {
          const q = this.queued;
          this.queued = 0;
          this.startMove(q);
        }
      }
    }
    // speed
    this.slow = Math.min(1, this.slow + dt * 0.45);
    this.v = baseSpeed(this.dist) * this.slow;
    this.dist += this.v * dt;
    this.stats.distanceM = this.dist;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
    // stage
    const stage = Math.floor(this.dist / STAGE_M);
    if (stage !== this.stage) {
      this.stage = stage;
      this.events.push({ type: 'stage', stage, name: stageName(stage) });
    }
    // spawning and events
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.25;
      this.spawnTraffic();
    }
    this.eventT -= dt;
    if (this.eventT <= 0) {
      this.eventT = Math.max(3.2, 6 + this.rng() * 6 - this.stage * 0.6);
      this.specialEvent();
    }
    for (let l = 0; l < 3; l++) {
      const base = [3.2, 5, 4.2][l];
      this.laneFlow[l] = Math.min(base + 1.2, Math.max(base - 1.2, this.laneFlow[l] + (this.rng() - 0.5) * 0.6 * dt));
    }
    this.hornT -= dt;
    if (this.hornT <= 0) {
      this.hornT = 1.5 + this.rng() * 3.5;
      const near = this.entities.filter((e) => e.cat === 'vehicle' && e.x > this.dist - 5 && e.x < this.dist + 25);
      if (near.length) {
        const e = near[Math.floor(this.rng() * near.length)];
        this.events.push({ type: 'horn', kind: e.kind, x: e.x, lane: e.lane });
      }
    }
    // entities
    for (const e of this.entities) {
      e.age += dt;
      if (e.fall) {
        e.fall.t = Math.min(1, e.fall.t + dt / 0.4);
        if (e.fall.t >= 1) e.fall = undefined;
      }
      if (e.pare !== undefined) {
        e.pare -= dt;
        if (e.pare <= 0 && e.leave === undefined) {
          // waving the queue on changes everyone's speed: only when the player keeps a way through
          if (this.fair((ents) => ents.splice(ents.findIndex((q) => q.id === e.id), 1))) {
            e.sprite = 'agente-siga';
            e.leave = 1.2;
            this.events.push({ type: 'whistle' });
          } else e.pare = 0.5;
        }
      }
      if (e.leave !== undefined) e.leave -= dt;
      if (e.cat === 'vehicle') this.behave(e, dt);
    }
    // officers who waved traffic on walk off the road
    this.entities = this.entities.filter((e) => e.leave === undefined || e.leave > 0);
    this.drive(dt);
    this.repair();
    this.collide();
    this.score_(dt);
    // clean up
    this.entities = this.entities.filter((e) => e.x + e.hb1 > this.dist - 14 - (e.v > this.v ? 40 : 0) && e.x < this.dist + 140);
    this.clients = this.clients.filter((c) => c.x > this.dist - 12);
    this.warnings = this.warnings.filter((w) => w.until > this.t);
  }

  /**
   * Keeps the guarantee as time passes: if the model finds no way through the next seconds, cars that are still
   * off-screen (the player cannot see them yet) are removed, farthest first, until there is one again.
   */
  private repair() {
    const ents = this.entities.filter((e) => e.deadly && e.x + e.hb1 > this.dist - 30 && e.x < this.dist + 90);
    const ok = (list: Entity[]) => hasEscape(this.predPlayer(), list.map(World.pred), { reactS: 0, margin: FAIR.worldMargin });
    if (ok(ents)) return;
    const offscreen = this.dist + AHEAD_FAR + 1.5;
    const cands = ents.filter((e) => e.x > offscreen && e.cat === 'vehicle').sort((a, b) => a.x - b.x);
    // removing a car can make things worse (the car behind it speeds up), so only commit a removal that helps
    for (const c of cands) {
      if (ok(ents.filter((e) => e !== c))) {
        this.entities = this.entities.filter((e) => e !== c);
        this.repaired++;
        return;
      }
    }
    for (let k = 2; k <= cands.length; k++) {
      const gone = new Set(cands.slice(0, k));
      if (ok(ents.filter((e) => !gone.has(e)))) {
        this.entities = this.entities.filter((e) => !gone.has(e));
        this.repaired += k;
        return;
      }
    }
  }

  /** Speeds and car-following, with exactly the rules the fairness model uses (fairness.ts). */
  private drive(dt: number) {
    for (const e of this.entities) {
      if (e.cat !== 'vehicle') continue;
      if (e.stopT > 0) e.v = Math.max(0, e.v - 9 * dt);
      else if (e.v < e.vCruise) e.v = Math.min(e.vCruise, e.v + 2.5 * dt);
      e.x += e.v * dt;
    }
    // potholes and pickups don't stop traffic (and the fairness model doesn't see them either)
    followClamp(
      this.entities.filter((e) => e.deadly).map((e) => Object.assign(e, { isStatic: e.cat !== 'vehicle' })),
      (e) => (e.changeT >= 0 && e.laneFrom !== e.lane ? [e.laneFrom, e.lane] : [e.lane]),
    );
    for (const e of this.entities) e.wheel += (e.v * dt) / 0.3;
  }

  private occupies(e: Entity, lanePos: number): boolean {
    return Math.abs(e.lanePos - lanePos) < 0.55;
  }

  private collide() {
    const p0 = this.dist + this.phb0;
    const p1 = this.dist + this.phb1;
    for (const e of this.entities) {
      if (e.hit || e.fall) continue;
      if (!this.occupies(e, this.lanePos)) continue;
      if (e.x + e.hb1 < p0 + 0.05 || e.x + e.hb0 > p1 - 0.05) continue;
      if (e.kind === 'hoyo') {
        e.hit = true;
        this.stats.potholes++;
        this.slow = Math.min(this.slow, 0.7);
        this.combo = 0;
        this.events.push({ type: 'pothole' });
        continue;
      }
      if (e.kind === 'casco') {
        e.hit = true;
        e.x = -1e9;
        if (this.lives < LIVES) {
          this.lives++;
          this.stats.helmets++;
        }
        this.events.push({ type: 'pickup', what: 'casco' });
        continue;
      }
      if (!e.deadly || this.invuln > 0) continue;
      e.hit = true;
      this.crash(e.kind);
      if (this.over) return;
    }
  }

  private crash(kind: string) {
    this.lives--;
    this.stats.crashes++;
    this.invuln = INVULN_S;
    this.slow = 0.45;
    this.combo = 0;
    this.closeCall = null;
    this.events.push({ type: 'crash', lives: this.lives, kind });
    if (this.passenger) {
      this.passenger = null;
      this.events.push({ type: 'rideLost' });
    }
    if (this.lives <= 0) {
      this.over = true;
      this.events.push({ type: 'gameOver' });
    }
  }

  private bonus(points: number, label: string, growCombo = true) {
    const pts = Math.round(points * this.multiplier);
    this.bonusPoints += pts;
    if (growCombo) {
      this.combo++;
      this.comboT = COMBO_WINDOW_S;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
    }
    this.events.push({ type: 'bonus', label, points: pts, lane: this.laneTarget });
  }

  private score_(dt: number) {
    void dt;
    const rear = this.dist + this.phb0;
    const front = this.dist + this.phb1;
    for (const e of this.entities) {
      if (e.passed || e.x + e.hb1 > rear) continue;
      e.passed = true;
      if (e.hit) continue;
      const side = e.lanePos - this.lanePos;
      if (e.kind === 'platano' || e.kind === 'racimo') {
        if (e.fall === undefined) {
          this.stats.plantainsDodged++;
          this.bonus(TAPON_POINTS.plantainDodged, 'Plátano esquivado');
        }
        continue;
      }
      if (e.closureEnd) this.stats.closuresPassed++;
      if (e.cat !== 'vehicle' || e.v > this.v) continue;
      if (Math.abs(Math.abs(side) - 1) < 0.5) {
        this.stats.overtakes++;
        this.bonus(TAPON_POINTS.overtake, 'Rebase', false);
        const s = Math.sign(side);
        if (this.lastOvertake && this.lastOvertake.side === -s && this.t - this.lastOvertake.t < 0.7) {
          this.stats.squeezes++;
          this.bonus(TAPON_POINTS.squeeze, '¡Por el medio!');
          this.lastOvertake = null;
        } else this.lastOvertake = { t: this.t, side: s };
      }
    }
    // passengers waiting on the sidewalks
    for (const c of this.clients) {
      if (c.picked || this.passenger || front < c.x) continue;
      if (front > c.x + 3) {
        c.picked = true; // missed
        continue;
      }
      if (Math.abs(this.lanePos - c.side) < 0.4) {
        c.picked = true;
        this.stats.passengers++;
        const kinds = ['senora', 'estudiante', 'don'] as const;
        this.passenger = { look: c.look, until: this.dist + 350 + this.rng() * 150, kind: kinds[c.look] };
        this.bonus(TAPON_POINTS.passenger, '¡Pasajero!');
        this.events.push({ type: 'pickup', what: 'cliente' });
      }
    }
    if (this.passenger && this.dist >= this.passenger.until) {
      this.passenger = null;
      this.stats.ridesCompleted++;
      const before = this.bonusPoints;
      this.bonus(TAPON_POINTS.rideCompleted, '¡Carrera completada!');
      this.events.push({ type: 'ride', points: this.bonusPoints - before });
    }
  }

  /** Stats rounded for the server. */
  finalStats(): TaponStats {
    return { ...this.stats, distanceM: Math.floor(this.stats.distanceM), durationMs: Math.floor(this.stats.durationMs) };
  }
}
