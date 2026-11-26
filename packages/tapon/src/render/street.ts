import { buildingArt, almendroArt, carritoArt, palmArt, paradaArt, peatonArt, poleArt, skylineArt, type PropArt } from '../art/street.ts';
import { PLAYER_X, PX } from '../config.ts';
import type { SpriteCache } from './images.ts';

/** Depth (scale) and ground line of each street layer. Lanes are 0.84 / 0.92 / 1.0. */
export const LAYER = {
  skyline: { s: 0.5, y: 560, parallax: 0.12 },
  buildings: { s: 0.72, y: 612 },
  upper: { s: 0.78, y: 640 },
  lower: { s: 1.1, y: 1074 },
} as const;

export interface Placed {
  id: string;
  /** World x (m) of the left edge, at the layer's depth. */
  x: number;
  wM: number;
  w: number;
  h: number;
  windows?: [number, number, number, number][];
  /** Cable attachment point (sprite px) for poles. */
  top?: { x: number; y: number };
  kind: 'building' | 'pole' | 'tree' | 'prop' | 'person';
}

/** Deterministic hash → [0,1). */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Generates the street around the player as it scrolls: buildings, poles with cables, trees, bus stops, vendors
 * and pedestrians. Art is generated as SVG and rasterised through the sprite cache when it comes into range.
 */
export class Street {
  buildings: Placed[] = [];
  upper: Placed[] = [];
  lower: Placed[] = [];
  private nextB = -20;
  private nextU = -20;
  private nextL = -20;
  private n = 0;
  private svgs = new Map<string, PropArt>();
  private loading = new Set<string>();

  constructor(
    private readonly cache: SpriteCache,
    private readonly seed: number,
  ) {}

  /** Generate and rasterise everything needed for the first frame. */
  async prime(dist: number) {
    this.update(dist);
    await this.ensure(true);
  }

  private art(id: string, make: () => PropArt) {
    if (!this.svgs.has(id)) this.svgs.set(id, make());
    return this.svgs.get(id)!;
  }

  /** Make sure placed items near the view are rasterised (fire-and-forget unless `wait`). */
  async ensure(wait = false) {
    const jobs: Promise<void>[] = [];
    const want = (p: Placed, scale: number) => {
      if (this.cache.get(p.id) || this.loading.has(p.id)) return;
      const a = this.svgs.get(p.id);
      if (!a) return;
      this.loading.add(p.id);
      jobs.push(this.cache.add(p.id, a.svg, a.w, a.h, this.cache.scale * scale).finally(() => this.loading.delete(p.id)));
    };
    for (const p of this.buildings) want(p, LAYER.buildings.s);
    for (const p of this.upper) want(p, LAYER.upper.s);
    for (const p of this.lower) want(p, LAYER.lower.s);
    if (wait) await Promise.all(jobs);
  }

  /** The cache was rebuilt at a new resolution: forget rasterised street art. */
  invalidate() {
    for (const p of [...this.buildings, ...this.upper, ...this.lower]) this.cache.delete(p.id);
  }

  update(dist: number) {
    const s = this.seed;
    // buildings: keep the street front continuous from behind the moto to well past the right edge
    while (this.nextB < dist + 2000 / (PX * LAYER.buildings.s)) {
      const k = this.n++;
      const wM = 6 + Math.floor(hash(s + k * 3.1) * 9);
      const id = `bld-${s}-${k}`;
      const a = buildingArt(s * 1000 + k, wM);
      this.svgs.set(id, { id, svg: a.svg, w: a.w, h: a.h });
      this.buildings.push({ id, x: this.nextB, wM, w: a.w, h: a.h, windows: a.windows, kind: 'building' });
      // narrow alleys between some buildings
      this.nextB += wM + (hash(s + k * 7.7) < 0.25 ? 1.2 : 0);
    }
    // upper sidewalk: poles every ~25 m with trees, a bus stop, vendors and people between them
    while (this.nextU < dist + 2000 / (PX * LAYER.upper.s)) {
      const k = this.n++;
      const r = hash(s + k * 5.3);
      let a: PropArt;
      let kind: Placed['kind'] = 'prop';
      if (r < 0.3) {
        a = this.art('poste', poleArt);
        kind = 'pole';
      } else if (r < 0.45) {
        a = this.art(`palma-${k % 3}`, () => palmArt(k % 3));
        kind = 'tree';
      } else if (r < 0.58) {
        a = this.art(`almendro-${k % 3}`, () => almendroArt(k % 3));
        kind = 'tree';
      } else if (r < 0.64) a = this.art('parada', paradaArt);
      else if (r < 0.72) a = this.art(r < 0.68 ? 'carrito-frutas' : 'carrito-friofrio', () => carritoArt(r < 0.68 ? 'frutas' : 'friofrio'));
      else {
        a = this.art(`peaton-${k % 6}`, () => peatonArt(k % 6));
        kind = 'person';
      }
      const wM = a.w / PX;
      this.upper.push({ id: a.id, x: this.nextU, wM, w: a.w, h: a.h, top: a.top, kind });
      this.nextU += Math.max(wM, 2) + 2 + hash(s + k * 9.1) * 7;
    }
    // lower sidewalk (foreground): only low things so nothing hides the near lane
    while (this.nextL < dist + 2000 / (PX * LAYER.lower.s)) {
      const k = this.n++;
      const r = hash(s + k * 2.9);
      const a = r < 0.5 ? this.art(`peaton-${(k % 6) + 6}`, () => peatonArt((k % 6) + 6)) : this.art(r < 0.75 ? 'carrito-frutas' : 'carrito-friofrio', () => carritoArt(r < 0.75 ? 'frutas' : 'friofrio'));
      const wM = a.w / PX;
      this.lower.push({ id: a.id, x: this.nextL, wM, w: a.w, h: a.h, kind: r < 0.5 ? 'person' : 'prop' });
      this.nextL += 9 + hash(s + k * 4.4) * 18;
    }
    // forget what is far behind
    const behind = dist - 40;
    this.buildings = this.buildings.filter((p) => p.x + p.wM > behind);
    this.upper = this.upper.filter((p) => p.x + p.wM > behind);
    this.lower = this.lower.filter((p) => p.x + p.wM > behind);
  }

  /** Skyline art (one wide strip, repeated). */
  skyline(): PropArt {
    return this.art('skyline', () => skylineArt(this.seed));
  }

  /** Screen x of a world x at a layer scale. */
  static sx(x: number, dist: number, s: number) {
    return PLAYER_X + (x - dist) * PX * s;
  }
}
