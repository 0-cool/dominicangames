import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { GeoProjection } from '@sd/shared';
import { type Pt, type Ring, type MultiPoly, openRing, orientCW, rect, difference, union, segmentQuads, disk } from './geom.ts';

export type Tags = Record<string, string>;
export interface OsmNode {
  id: number;
  lat: number;
  lon: number;
  x: number;
  z: number;
  tags?: Tags;
}
export interface OsmWay {
  id: number;
  nodes: number[];
  tags: Tags;
}
export interface OsmRelation {
  id: number;
  members: { type: 'n' | 'w' | 'r'; ref: number; role: string }[];
  tags: Tags;
}
export interface OsmData {
  meta: { source: string; bbox: number[]; fetched: string; license: string; attribution: string };
  nodes: Map<number, OsmNode>;
  ways: OsmWay[];
  wayById: Map<number, OsmWay>;
  relations: OsmRelation[];
  proj: GeoProjection;
}

type RawNode = [number, number, number, Tags?];
type RawWay = [number, number[], Tags | 0];
type RawRel = [number, [string, number, string][], Tags | 0];

export function loadOsm(path: string, proj: GeoProjection): OsmData {
  const raw = JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')) as {
    meta: OsmData['meta'];
    nodes: RawNode[];
    ways: RawWay[];
    relations: RawRel[];
  };
  const nodes = new Map<number, OsmNode>();
  for (const [id, lat, lon, tags] of raw.nodes) {
    const w = proj.toWorld(lat, lon);
    nodes.set(id, { id, lat, lon, x: w.x, z: w.z, tags: tags || undefined });
  }
  const ways: OsmWay[] = raw.ways.map(([id, nd, tags]) => ({ id, nodes: nd, tags: tags || {} }));
  const relations: OsmRelation[] = raw.relations.map(([id, m, tags]) => ({
    id,
    members: m.map(([type, ref, role]) => ({ type: type as 'n' | 'w' | 'r', ref, role })),
    tags: tags || {},
  }));
  return { meta: raw.meta, nodes, ways, wayById: new Map(ways.map((w) => [w.id, w])), relations, proj };
}

export function wayPts(osm: OsmData, way: OsmWay): Pt[] {
  const out: Pt[] = [];
  for (const id of way.nodes) {
    const n = osm.nodes.get(id);
    if (n) out.push([n.x, n.z]);
  }
  return out;
}

export function isClosed(way: OsmWay): boolean {
  return way.nodes.length > 3 && way.nodes[0] === way.nodes[way.nodes.length - 1];
}

/** Join open ways into rings by matching endpoints (multipolygon assembly). */
export function assembleRings(osm: OsmData, wayIds: number[]): Ring[] {
  const chains: number[][] = [];
  for (const id of wayIds) {
    const w = osm.wayById.get(id);
    if (!w || w.nodes.some((n) => !osm.nodes.has(n))) continue;
    chains.push([...w.nodes]);
  }
  const rings: Ring[] = [];
  while (chains.length) {
    let cur = chains.shift()!;
    let progress = true;
    while (cur[0] !== cur[cur.length - 1] && progress) {
      progress = false;
      for (let i = 0; i < chains.length; i++) {
        const c = chains[i];
        const end = cur[cur.length - 1];
        if (c[0] === end) cur = cur.concat(c.slice(1));
        else if (c[c.length - 1] === end) cur = cur.concat([...c].reverse().slice(1));
        else if (c[c.length - 1] === cur[0]) cur = c.concat(cur.slice(1));
        else if (c[0] === cur[0]) cur = [...c].reverse().concat(cur.slice(1));
        else continue;
        chains.splice(i, 1);
        progress = true;
        break;
      }
    }
    if (cur[0] === cur[cur.length - 1] && cur.length >= 4) {
      rings.push(
        openRing(
          cur.map((id) => {
            const n = osm.nodes.get(id)!;
            return [n.x, n.z] as Pt;
          }),
        ),
      );
    }
  }
  return rings;
}

/** Polygon(s) for a closed way or a multipolygon relation. */
export function areaPolys(osm: OsmData, el: OsmWay | OsmRelation): MultiPoly {
  if ('nodes' in el) {
    if (!isClosed(el)) return [];
    const pts = wayPts(osm, el);
    if (pts.length < 4) return [];
    return [[orientCW(openRing(pts))]];
  }
  const outer = assembleRings(
    osm,
    el.members.filter((m) => m.type === 'w' && m.role !== 'inner').map((m) => m.ref),
  );
  const inner = assembleRings(
    osm,
    el.members.filter((m) => m.type === 'w' && m.role === 'inner').map((m) => m.ref),
  );
  if (!outer.length) return [];
  const outerMp: MultiPoly = outer.map((r) => [orientCW(r)]);
  if (!inner.length) return outerMp;
  return difference(
    outerMp,
    inner.map((r) => [orientCW(r)]),
  );
}

/**
 * Sea polygon inside the world rectangle from OSM natural=coastline chains.
 * OSM convention: land on the left, water on the right of the coastline direction.
 * We walk sub-chains inside the rectangle and close them clockwise (+Z south,
 * so "clockwise seen from above" matches water-on-the-right) along the border.
 */
export function buildSea(osm: OsmData, b: { minX: number; minZ: number; maxX: number; maxZ: number }): MultiPoly {
  const coast = osm.ways.filter((w) => w.tags.natural === 'coastline');
  // Join coastline ways in their original direction.
  const chains: number[][] = coast.map((w) => [...w.nodes]);
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < chains.length; i++)
      for (let j = 0; j < chains.length; j++) {
        if (i === j) continue;
        if (chains[i][chains[i].length - 1] === chains[j][0]) {
          chains[i] = chains[i].concat(chains[j].slice(1));
          chains.splice(j, 1);
          merged = true;
          break outer;
        }
      }
  }
  const inside = (p: Pt) => p[0] >= b.minX && p[0] <= b.maxX && p[1] >= b.minZ && p[1] <= b.maxZ;
  const W = b.maxX - b.minX;
  const H = b.maxZ - b.minZ;
  const P = 2 * (W + H);
  // Perimeter parameter, clockwise seen from above starting at the north-west corner:
  // north edge (z=minZ) west→east, east edge north→south, south edge east→west, west edge south→north.
  const perim = (p: Pt): number => {
    const e = 0.01;
    if (Math.abs(p[1] - b.minZ) < e) return p[0] - b.minX;
    if (Math.abs(p[0] - b.maxX) < e) return W + (p[1] - b.minZ);
    if (Math.abs(p[1] - b.maxZ) < e) return W + H + (b.maxX - p[0]);
    return 2 * W + H + (b.maxZ - p[1]);
  };
  const corners: { s: number; p: Pt }[] = [
    { s: 0, p: [b.minX, b.minZ] },
    { s: W, p: [b.maxX, b.minZ] },
    { s: W + H, p: [b.maxX, b.maxZ] },
    { s: 2 * W + H, p: [b.minX, b.maxZ] },
  ];
  // Clip segment a→b against the rectangle boundary: returns intersection point.
  const clipPoint = (a: Pt, c: Pt): Pt => {
    let t0 = 0;
    let t1 = 1;
    const dx = c[0] - a[0];
    const dz = c[1] - a[1];
    const ps = [-dx, dx, -dz, dz];
    const qs = [a[0] - b.minX, b.maxX - a[0], a[1] - b.minZ, b.maxZ - a[1]];
    for (let i = 0; i < 4; i++) {
      if (ps[i] === 0) continue;
      const t = qs[i] / ps[i];
      if (ps[i] < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
    // whichever end lies inside, return the crossing on the boundary
    return inside(a) ? [a[0] + dx * t1, a[1] + dz * t1] : [a[0] + dx * t0, a[1] + dz * t0];
  };
  const subs: Pt[][] = [];
  for (const ch of chains) {
    const pts = ch.map((id) => osm.nodes.get(id)).filter(Boolean).map((n) => [n!.x, n!.z] as Pt);
    let cur: Pt[] | null = null;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (inside(p)) {
        if (!cur) {
          cur = [];
          if (i > 0) cur.push(clipPoint(pts[i - 1], p));
        }
        cur.push(p);
      } else if (cur) {
        cur.push(clipPoint(pts[i - 1], p));
        subs.push(cur);
        cur = null;
      }
    }
    if (cur) subs.push(cur);
  }
  const open = subs.filter((s) => s.length >= 2);
  if (!open.length) return [];
  const used = new Set<number>();
  const polys: MultiPoly = [];
  for (let start = 0; start < open.length; start++) {
    if (used.has(start)) continue;
    const ring: Pt[] = [];
    let cur = start;
    for (let guard = 0; guard < 64; guard++) {
      used.add(cur);
      ring.push(...open[cur]);
      const exitS = perim(open[cur][open[cur].length - 1]);
      // next entry clockwise from exit
      let best = -1;
      let bestD = Infinity;
      for (let j = 0; j < open.length; j++) {
        const d = (perim(open[j][0]) - exitS + P) % P;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      // Emit the rectangle corners passed between exit and next entry, in perimeter order.
      corners
        .map((c) => ({ d: (c.s - exitS + P) % P, p: c.p }))
        .filter((c) => c.d > 0 && c.d < bestD)
        .sort((x, y) => x.d - y.d)
        .forEach((c) => ring.push(c.p));
      if (best === start || used.has(best)) break;
      cur = best;
    }
    polys.push([ring]);
  }
  return union(...polys.map((p) => [[p[0]]] as MultiPoly));
}

/** Remaining river polygon north of the mapped riverbank polygon: centreline buffer (approximation). */
export function riverFallback(osm: OsmData, fromLat: number, halfWidth: number): MultiPoly {
  const pieces: Ring[] = [];
  for (const w of osm.ways) {
    if (w.tags.waterway !== 'river') continue;
    const pts: Pt[] = [];
    for (const id of w.nodes) {
      const n = osm.nodes.get(id);
      if (n && n.lat >= fromLat) pts.push([n.x, n.z]);
    }
    for (const q of segmentQuads(pts, halfWidth)) pieces.push(q);
    for (const p of pts) pieces.push(disk(p, halfWidth, 16));
  }
  return union(...pieces.map((r) => [[r]] as MultiPoly));
}

export function worldRect(b: { minX: number; minZ: number; maxX: number; maxZ: number }): MultiPoly {
  return [[rect(b.minX, b.minZ, b.maxX, b.maxZ)]];
}
