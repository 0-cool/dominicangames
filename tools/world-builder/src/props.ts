import type { RoadNode } from '@sd/shared';
import { type MultiPoly, type Pt, bboxOf, dist, hash01, offsetPolyline, pointInPoly, rng, samplePolyline } from './geom.ts';
import type { AreaIndex, PropSink, RoadIndex } from './index-helpers.ts';
import type { MeshBuilder, V3 } from './mesh.ts';
import type { OsmData } from './osm.ts';

export interface PropEdge {
  id: number;
  a: number;
  b: number;
  ptsXZ: Pt[];
  cls: string;
  width: number;
  sidewalk: number;
  lanesF: number;
  lanesB: number;
  drivable: boolean;
  surface: string;
  length: number;
  parking?: number;
}

export interface PropCtx {
  nodes: RoadNode[];
  edges: PropEdge[];
  roads: RoadIndex;
  land: (p: Pt) => boolean;
  isColonial: (p: Pt) => boolean;
  buildingAt: (p: Pt) => boolean;
  noBuild: AreaIndex;
  inPlay: (p: Pt) => boolean;
  nearSea: (p: Pt) => boolean;
}

const RANK: Record<string, number> = { trunk: 6, primary: 5, secondary: 4, tertiary: 3, residential: 2, living: 1, service: 0 };

/** Trimmed sub-polyline between distances s0..s1. */
export function subPolyline(pts: Pt[], s0: number, s1: number): Pt[] {
  const out: Pt[] = [];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const l = dist(a, b);
    const segStart = acc;
    const segEnd = acc + l;
    if (segEnd >= s0 && segStart <= s1 && l > 1e-6) {
      const t0 = Math.max(0, (s0 - segStart) / l);
      const t1 = Math.min(1, (s1 - segStart) / l);
      const p0: Pt = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
      const p1: Pt = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
      if (!out.length) out.push(p0);
      out.push(p1);
    }
    acc = segEnd;
  }
  return out;
}

/** Street furniture, lights, trees and parked vehicles along the road network. */
export function placeStreetProps(ctx: PropCtx, sink: PropSink) {
  const { nodes, edges } = ctx;
  const r = rng(27021844);
  const free = (p: Pt) => ctx.land(p) && ctx.inPlay(p) && !ctx.buildingAt(p);
  for (const e of edges) {
    if (!e.drivable && e.cls !== 'pedestrian') continue;
    const mid = e.ptsXZ[Math.floor(e.ptsXZ.length / 2)];
    const colonial = ctx.isColonial(mid);
    const ra = nodes[e.a].radius + 2;
    const rb = nodes[e.b].radius + 2;
    if (e.length - ra - rb < 6) continue;
    const hw = e.width / 2;
    const swMid = hw + e.sidewalk * 0.72;
    const twoWay = e.lanesF > 0 && e.lanesB > 0;
    // ── Malecón: palms + double-arm lamps on the sea side ──
    if (e.cls === 'trunk') {
      for (const side of [1, -1]) {
        const line = offsetPolyline(e.ptsXZ, side * (hw + e.sidewalk * 0.55));
        for (const s of samplePolyline(line, 13, ra + r() * 4)) {
          if (s.s > e.length - rb || !free(s.p)) continue;
          const sea = ctx.nearSea(s.p);
          if (Math.floor(s.s / 13) % 3 === 0) {
            sink.add('lamp_malecon', s.p[0], 0.15, s.p[1], Math.atan2(s.dir[0], s.dir[1]) + (side > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
            sink.light(s.p[0], 8.6, s.p[1], 1);
          } else if (sea || r() < 0.55) {
            sink.add('tree_palm', s.p[0] + (r() - 0.5), 0.15, s.p[1] + (r() - 0.5), r() * 6.28, Math.floor(r() * 4));
          }
          if (sea && r() < 0.18) sink.add('bench', s.p[0] + s.dir[1] * side * 0.8, 0.15, s.p[1] - s.dir[0] * side * 0.8, Math.atan2(s.dir[0], s.dir[1]), 0);
        }
      }
      continue;
    }
    if (e.cls === 'pedestrian') {
      // Calle El Conde style: benches, planters, lanterns already on walls; a few trees.
      for (const s of samplePolyline(e.ptsXZ, 16, ra + 4)) {
        if (s.s > e.length - rb || !free(s.p)) continue;
        const k = Math.floor(s.s / 16) % 4;
        if (k === 0) sink.add('planter', s.p[0], 0, s.p[1], Math.atan2(s.dir[0], s.dir[1]), 0);
        else if (k === 2) sink.add('bench', s.p[0], 0, s.p[1], Math.atan2(s.dir[0], s.dir[1]), 1);
        else if (k === 1 && r() < 0.5) sink.add('cart', s.p[0] + (r() - 0.5) * 2, 0, s.p[1], r() * 6.28, Math.floor(r() * 3));
      }
      continue;
    }
    if (e.cls === 'service') continue;
    // ── Utility poles with sodium lamps + overhead wires (not in the colonial core) ──
    const poleSide = hash01(e.id) < 0.5 ? 1 : -1;
    const poleLine = offsetPolyline(e.ptsXZ, poleSide * (hw + Math.max(0.35, e.sidewalk - 0.3)));
    const spacing = colonial ? 0 : e.cls === 'residential' ? 33 : 38;
    if (spacing && e.sidewalk > 0.5) {
      let prev: Pt | null = null;
      for (const s of samplePolyline(poleLine, spacing, ra + 3 + r() * 6)) {
        if (s.s > e.length - rb) break;
        if (!free(s.p)) {
          prev = null;
          continue;
        }
        const withLamp = r() < 0.75;
        sink.add('pole', s.p[0], 0.15, s.p[1], Math.atan2(s.dir[0], s.dir[1]) + (poleSide > 0 ? -Math.PI / 2 : Math.PI / 2), withLamp ? 1 + (r() < 0.25 ? 1 : 0) : 0);
        if (withLamp) sink.light(s.p[0] - s.dir[1] * poleSide * 1.6, 7.2, s.p[1] + s.dir[0] * poleSide * 1.6, 1);
        if (prev && dist(prev, s.p) < spacing * 1.6) sink.wire(prev[0], 8.1, prev[1], s.p[0], 8.1, s.p[1]);
        prev = s.p;
      }
    }
    // ── Street trees on wider sidewalks ──
    if (e.sidewalk >= 1.8 || (!colonial && e.cls === 'residential' && r() < 0.35)) {
      const treeLine = offsetPolyline(e.ptsXZ, -poleSide * (hw + Math.max(0.6, e.sidewalk * 0.6)));
      for (const s of samplePolyline(treeLine, 17 + r() * 8, ra + 5)) {
        if (s.s > e.length - rb - 3 || !free(s.p) || r() < 0.35) continue;
        const t = r();
        const type = t < 0.35 ? 'tree_almond' : t < 0.55 ? 'tree_flamboyan' : t < 0.75 ? 'tree_ficus' : 'tree_royal';
        sink.add(type, s.p[0], 0.15, s.p[1], r() * 6.28, Math.floor(r() * 4));
      }
    }
    // ── Parked cars & motos at the curb (right side of a→b) ──
    if (e.parking) {
      const pl = offsetPolyline(e.ptsXZ, hw - 1.05);
      for (const s of samplePolyline(pl, 6.2, ra + 5)) {
        if (s.s > e.length - rb - 5) break;
        if (r() < 0.42) continue;
        const rot = Math.atan2(s.dir[0], s.dir[1]);
        if (r() < 0.22) sink.add('parked_moto', s.p[0] + s.dir[1] * -0.4, 0, s.p[1] - s.dir[0] * -0.4, rot + 0.3, Math.floor(r() * 4));
        else sink.add('parked_car', s.p[0], 0, s.p[1], rot, Math.floor(r() * 8));
      }
    }
    // ── Trash containers & benches occasionally ──
    if (!colonial && r() < 0.25) {
      const s = samplePolyline(offsetPolyline(e.ptsXZ, poleSide * (hw + e.sidewalk * 0.5)), 1e9, e.length * 0.5)[0];
      if (s && free(s.p)) sink.add('trash', s.p[0], 0.15, s.p[1], Math.atan2(s.dir[0], s.dir[1]), Math.floor(r() * 2));
    }
    void swMid;
    void twoWay;
  }
  // ── Traffic signals and stop signs at junctions ──
  for (const n of nodes) {
    const inc = n.edges.map((id) => edges[id]).filter((e) => e.drivable && e.cls !== 'service');
    if (inc.length < 3) continue;
    const maxRank = Math.max(...inc.map((e) => RANK[e.cls] ?? 0));
    for (const e of inc) {
      const incoming = e.b === n.id ? e.lanesF > 0 : e.lanesB > 0;
      if (!incoming) continue;
      // approach direction (towards the node)
      const pts = e.b === n.id ? e.ptsXZ : [...e.ptsXZ].reverse();
      const p0 = pts[pts.length - 1];
      const p1 = pts[Math.max(0, pts.length - 2)];
      const l = dist(p0, p1) || 1;
      const dx = (p0[0] - p1[0]) / l; // travel direction
      const dz = (p0[1] - p1[1]) / l;
      // right side of travel: (-dz, dx)
      const back = n.radius + 0.8;
      const sideOff = e.width / 2 + Math.min(e.sidewalk, 1.2) * 0.5 + 0.3;
      const px = n.x - dx * back + -dz * sideOff;
      const pz = n.z - dz * back + dx * sideOff;
      const rot = Math.atan2(-dx, -dz); // face oncoming traffic
      if (n.signal) sink.signal(px, pz, rot, n.id, e.id);
      else if ((RANK[e.cls] ?? 0) < maxRank && ctx.land([px, pz])) sink.add('stop_sign', px, 0.15, pz, rot, 0);
    }
  }
}

/** Trees and benches inside parks / plazas; OSM single trees. */
export function placeAreaProps(osm: OsmData, parks: MultiPoly, plazas: MultiPoly, ctx: PropCtx, sink: PropSink) {
  const r = rng(1965);
  const scatter = (mp: MultiPoly, spacing: number, paved: boolean) => {
    for (const poly of mp) {
      const [x0, z0, x1, z1] = bboxOf(poly[0]);
      for (let x = x0 + spacing / 2; x < x1; x += spacing)
        for (let z = z0 + spacing / 2; z < z1; z += spacing) {
          const p: Pt = [x + (r() - 0.5) * spacing * 0.7, z + (r() - 0.5) * spacing * 0.7];
          if (!pointInPoly(p, poly) || ctx.roads.inCorridor(p, 1.2, true) || ctx.buildingAt(p) || !ctx.land(p)) continue;
          const t = r();
          if (paved && t < 0.12) sink.add('bench', p[0], 0, p[1], r() * 6.28, 1);
          else if (t < 0.85) {
            const k = r();
            const type = paved ? (k < 0.5 ? 'tree_ficus' : k < 0.75 ? 'tree_almond' : 'tree_royal') : k < 0.3 ? 'tree_royal' : k < 0.55 ? 'tree_flamboyan' : k < 0.8 ? 'tree_almond' : 'tree_palm';
            sink.add(type, p[0], 0, p[1], r() * 6.28, Math.floor(r() * 4));
          }
        }
    }
  };
  scatter(parks, 11, false);
  scatter(plazas, 13, true);
  for (const n of osm.nodes.values()) {
    if (n.tags?.natural !== 'tree') continue;
    const p: Pt = [n.x, n.z];
    if (!ctx.inPlay(p) || ctx.buildingAt(p)) continue;
    sink.add(n.tags.leaf_type === 'needleleaved' ? 'tree_ficus' : 'tree_almond', n.x, 0, n.z, r() * 6.28, Math.floor(r() * 4));
  }
}

/** Fictional businesses at real OSM shop/amenity locations; furniture in front. */
export function placeShopFurniture(kind: string, p: Pt, nx: number, nz: number, sink: PropSink, seed: number) {
  const h = hash01(seed);
  const rot = Math.atan2(nx, nz);
  if (kind === 'colmado' || kind === 'bar') {
    sink.add('chair_set', p[0] + nx * 1.6, 0.15, p[1] + nz * 1.6, rot + (h - 0.5), Math.floor(h * 3));
    sink.add('cooler', p[0] + nx * 0.6 + nz * 1.2, 0.15, p[1] + nz * 0.6 - nx * 1.2, rot, 0);
    if (h > 0.5) sink.add('parked_moto', p[0] + nx * 2.8 - nz * 2, 0.15, p[1] + nz * 2.8 + nx * 2, rot + 1.4, Math.floor(h * 4));
  } else if (kind === 'picapollo' || kind === 'cafeteria') {
    sink.add('chair_set', p[0] + nx * 1.4, 0.15, p[1] + nz * 1.4, rot, 1);
  }
}

/** Monuments and landmark geometry that are not plain extruded footprints. */
export function emitObelisk(stone: MeshBuilder, mural: MeshBuilder, x: number, z: number, height: number, base: number, rot: number) {
  const c: V3 = [0.92, 0.9, 0.86];
  stone.box(x, 0.6, z, base * 1.6, 0.6, base * 1.6, rot, c, 1);
  stone.box(x, 1.6, z, base * 1.2, 0.4, base * 1.2, rot, c, 1);
  // tapered shaft (8 sides as 4 trapezoid faces) with mural UVs
  const top = height * 0.92;
  const b0 = base;
  const b1 = base * 0.62;
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const P = (lx: number, lz: number, y: number): V3 => [x + lx * cs - lz * sn, y, z + lx * sn + lz * cs];
  const faces: [number, number, number, number][] = [
    [-1, -1, 1, -1],
    [1, -1, 1, 1],
    [1, 1, -1, 1],
    [-1, 1, -1, -1],
  ];
  faces.forEach(([ax, az, bx, bz], f) => {
    const nx0 = (az + bz) / 2;
    const nz0 = -(ax + bx) / 2;
    const n: V3 = [nx0 * cs - nz0 * sn, 0.05, nx0 * sn + nz0 * cs];
    // outward normal for clockwise square
    const nl = Math.hypot(n[0], n[1], n[2]);
    const N: V3 = [n[0] / nl, n[1] / nl, n[2] / nl];
    const v0 = mural.v(P(bx * b0, bz * b0, 2), N, [f + 1, 0]);
    const v1 = mural.v(P(ax * b0, az * b0, 2), N, [f, 0]);
    const v2 = mural.v(P(ax * b1, az * b1, top), N, [f, 1]);
    const v3 = mural.v(P(bx * b1, bz * b1, top), N, [f + 1, 1]);
    mural.quad(v1, v0, v3, v2);
    // pyramidion
    const apex = stone.v(P(0, 0, height), N, [0.5, 1], c);
    const q0 = stone.v(P(ax * b1, az * b1, top), N, [0, 0], c);
    const q1 = stone.v(P(bx * b1, bz * b1, top), N, [1, 0], c);
    stone.tri(q1, q0, apex);
  });
}

export function emitStatue(bronze: MeshBuilder, stone: MeshBuilder, x: number, z: number, rot: number, scale = 1) {
  const c: V3 = [0.86, 0.84, 0.8];
  stone.box(x, 1.1 * scale, z, 1.5 * scale, 1.1 * scale, 1.5 * scale, rot, c);
  stone.box(x, 2.6 * scale, z, 1.1 * scale, 0.4 * scale, 1.1 * scale, rot, c);
  const b: V3 = [0.25, 0.22, 0.16];
  const y0 = 3.0 * scale;
  const s = scale * 1.15;
  // stylised standing figure with raised arm (original design)
  bronze.box(x, y0 + 0.55 * s, z, 0.32 * s, 0.55 * s, 0.24 * s, rot, b); // legs/robe
  bronze.box(x, y0 + 1.45 * s, z, 0.38 * s, 0.38 * s, 0.26 * s, rot, b); // torso
  bronze.box(x, y0 + 2.0 * s, z, 0.15 * s, 0.17 * s, 0.15 * s, rot, b); // head
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const off = (lx: number, lz: number): Pt => [x + lx * cs - lz * sn, z + lx * sn + lz * cs];
  const arm = off(0.48 * s, -0.25 * s);
  bronze.box(arm[0], y0 + 1.95 * s, arm[1], 0.09 * s, 0.45 * s, 0.09 * s, rot + 0.3, b);
  const arm2 = off(-0.46 * s, 0);
  bronze.box(arm2[0], y0 + 1.25 * s, arm2[1], 0.09 * s, 0.4 * s, 0.09 * s, rot, b);
  const cape = off(0, 0.22 * s);
  bronze.box(cape[0], y0 + 1.0 * s, cape[1], 0.42 * s, 0.85 * s, 0.06 * s, rot, b);
}
