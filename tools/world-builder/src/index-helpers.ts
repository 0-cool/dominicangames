import type { ChunkProps, PropType, RoadClass, ShopKind } from '@sd/shared';
import { type MultiPoly, type Poly, type Pt, SpatialHash, bboxOf, distToSegment, pointInPoly } from './geom.ts';

export interface RoadSeg {
  a: Pt;
  b: Pt;
  hw: number;
  sw: number;
  cls: RoadClass;
  edgeId: number;
  drivable: boolean;
}

/** Spatial index over road centreline segments. */
export class RoadIndex {
  private hash = new SpatialHash<RoadSeg>(40);
  readonly segs: RoadSeg[] = [];
  add(s: RoadSeg) {
    this.segs.push(s);
    const m = s.hw + s.sw + 2;
    this.hash.insertBBox([Math.min(s.a[0], s.b[0]) - m, Math.min(s.a[1], s.b[1]) - m, Math.max(s.a[0], s.b[0]) + m, Math.max(s.a[1], s.b[1]) + m], s);
  }
  near(p: Pt, r: number): RoadSeg[] {
    return [...this.hash.query([p[0] - r, p[1] - r, p[0] + r, p[1] + r])];
  }
  /** True if p lies on a carriageway or sidewalk (+extra margin). */
  inCorridor(p: Pt, extra = 0, includeFoot = false): boolean {
    for (const s of this.hash.query([p[0] - 1, p[1] - 1, p[0] + 1, p[1] + 1])) {
      if (!includeFoot && (s.cls === 'footway' || s.cls === 'steps')) continue;
      if (distToSegment(p, s.a, s.b) < s.hw + s.sw + extra) return true;
    }
    return false;
  }
  nearest(p: Pt, r: number, filter?: (s: RoadSeg) => boolean): { seg: RoadSeg; d: number } | null {
    let best: { seg: RoadSeg; d: number } | null = null;
    for (const s of this.near(p, r)) {
      if (filter && !filter(s)) continue;
      const d = distToSegment(p, s.a, s.b);
      if (d < r && (!best || d < best.d)) best = { seg: s, d };
    }
    return best;
  }
}

/** Spatial index over polygons for point-in-area tests. */
export class AreaIndex {
  private hash = new SpatialHash<{ poly: Poly; tag: string }>(60);
  add(mp: MultiPoly, tag: string) {
    for (const poly of mp) this.hash.insertBBox(bboxOf(poly[0]), { poly, tag });
  }
  tagAt(p: Pt): string | null {
    for (const it of this.hash.query([p[0], p[1], p[0], p[1]])) if (pointInPoly(p, it.poly)) return it.tag;
    return null;
  }
  has(p: Pt): boolean {
    return this.tagAt(p) !== null;
  }
}

/** Collects instanced props / lights / shops and buckets them by chunk. */
export class PropSink {
  readonly chunks = new Map<string, ChunkProps>();
  constructor(private readonly size: number) {}
  private chunk(x: number, z: number): ChunkProps {
    const k = `${Math.floor(x / this.size)}_${Math.floor(z / this.size)}`;
    let c = this.chunks.get(k);
    if (!c) this.chunks.set(k, (c = { props: {}, shops: [], signals: [], wires: [], lights: [] }));
    return c;
  }
  add(type: PropType, x: number, y: number, z: number, rot: number, variant = 0) {
    const c = this.chunk(x, z);
    (c.props[type] ??= []).push(r(x), r(y), r(z), Math.round(rot * 1000) / 1000, variant);
  }
  light(x: number, y: number, z: number, kind: number) {
    this.chunk(x, z).lights.push(r(x), r(y), r(z), kind);
  }
  shop(x: number, y: number, z: number, rot: number, kind: ShopKind, name: string) {
    this.chunk(x, z).shops.push({ x: r(x), y: r(y), z: r(z), rot: Math.round(rot * 1000) / 1000, kind, name });
  }
  signal(x: number, z: number, rot: number, nodeId: number, edgeId: number) {
    this.chunk(x, z).signals.push(r(x), r(z), Math.round(rot * 1000) / 1000, nodeId, edgeId);
  }
  wire(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) {
    this.chunk((x1 + x2) / 2, (z1 + z2) / 2).wires.push(r(x1), r(y1), r(z1), r(x2), r(y2), r(z2));
  }
  count(type: PropType): number {
    let n = 0;
    for (const c of this.chunks.values()) n += (c.props[type]?.length ?? 0) / 5;
    return n;
  }
}

const r = (v: number) => Math.round(v * 100) / 100;
