import { FACADE, FACADE_FLAG, type ShopKind } from '@sd/shared';
import {
  type MultiPoly,
  type Poly,
  type Pt,
  SpatialHash,
  bboxOf,
  centroid,
  difference,
  disk,
  dist,
  hash01,
  multiArea,
  offsetPolyline,
  orientCW,
  pointInPoly,
  rng,
  segmentQuads,
  signedArea,
} from './geom.ts';
import type { AreaIndex, PropSink, RoadIndex } from './index-helpers.ts';
import { type MeshBuilder, type V3 } from './mesh.ts';
import { type OsmData, areaPolys } from './osm.ts';

export interface Bldg {
  id: string;
  osmId?: number;
  poly: Poly;
  bbox: number[];
  levels: number;
  floorH: number;
  height: number;
  parapet: number;
  style: number;
  color: V3;
  roofColor: V3;
  seed: number;
  flags: number;
  source: 'osm' | 'infill';
  landmark?: string;
  roofless?: boolean;
  crenel?: boolean;
  dome?: boolean;
  colonial: boolean;
}

const srgb = (hex: string): V3 => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(Math.pow(v / 255, 2.2) * 1000) / 1000;
  return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
};
const pal = (hexes: string[]) => hexes.map(srgb);

export const PALETTES: Record<number, V3[]> = {
  [FACADE.COLONIAL]: pal(['#E8B84A', '#D9764A', '#E89A8C', '#8EC3D6', '#9CCB9E', '#F2E6C9', '#C9A3C7', '#F0D27A', '#E6E2D6', '#B6533E', '#6FAFB2', '#F4A261', '#F3C6A5']),
  [FACADE.CORAL_STONE]: pal(['#CDBB9C', '#C2AD8C', '#D5C6A8']),
  [FACADE.GAZCUE]: pal(['#F4F1E8', '#EDE3CF', '#DCE8EC', '#F1D7C7', '#E3EAD3', '#F6E7B4', '#E9E4F0']),
  [FACADE.HOUSE]: pal(['#3FB8AF', '#FF9F80', '#A8D86E', '#FFD166', '#EF8FB0', '#7FB3E6', '#F7F3E8', '#C4E0B2', '#E76F51', '#B5838D', '#D8E2DC', '#90BE6D', '#F6BD60', '#84A59D']),
  [FACADE.APARTMENT]: pal(['#D9D4C7', '#C8D3D9', '#E8D9C0', '#B8C4B0', '#E2C7A6', '#F0EDE4', '#9FB8C8', '#E7C6B7']),
  [FACADE.COMMERCIAL]: pal(['#E9E4D8', '#D6CFC2', '#F2E2B6', '#CFE0E8', '#E8C1A0', '#BFD8B8', '#F5F5F0']),
  [FACADE.TOWER]: pal(['#8FA7B5', '#B5C2C9', '#D7DCDF', '#A6B8A9', '#C9C3B5']),
  [FACADE.RUINS]: pal(['#BCA88A', '#B09C7E']),
  [FACADE.MARBLE]: pal(['#EAD3C8', '#F2F0EA']),
};
const ROOFS = pal(['#9A9A94', '#B0AFA8', '#8C8B85', '#A9473A', '#C9C9C2', '#7E7D78', '#A3A29C', '#BDBDB6', '#B5574A', '#94938D', '#D2D1CB']);
const BAY_W = [3.4, 3.6, 3.0, 2.9, 3.2, 3.6, 2.4, 3.6, 3.8];

interface Override {
  landmark?: string;
  style: number;
  levels: number;
  floorH: number;
  parapet?: number;
  flags?: number;
  roofless?: boolean;
  crenel?: boolean;
  dome?: boolean;
  color?: string;
}
/** Hand-tuned overrides for monuments, keyed by OSM way/relation id (see docs/ASSETS.md). */
const OVERRIDES: Record<number, Override> = {
  41565898: { landmark: 'catedral', style: FACADE.CORAL_STONE, levels: 3, floorH: 5.8, crenel: true, parapet: 0 },
  221169027: { landmark: 'alcazar', style: FACADE.CORAL_STONE, levels: 2, floorH: 6.2, flags: FACADE_FLAG.ARCADE, parapet: 1.1 },
  1480370620: { landmark: 'fortaleza', style: FACADE.CORAL_STONE, levels: 4, floorH: 4.6, crenel: true, parapet: 0 },
  316385785: { landmark: 'san_francisco', style: FACADE.RUINS, levels: 2, floorH: 5.6, roofless: true },
  323836369: { landmark: 'san_nicolas', style: FACADE.RUINS, levels: 2, floorH: 6, roofless: true },
  323835270: { landmark: 'panteon', style: FACADE.CORAL_STONE, levels: 3, floorH: 5, parapet: 1.2 },
  221169031: { landmark: 'casas_reales', style: FACADE.CORAL_STONE, levels: 2, floorH: 5.4, parapet: 0.9 },
  326616460: { style: FACADE.CORAL_STONE, levels: 2, floorH: 4.6 },
  316385780: { style: FACADE.COLONIAL, levels: 2, floorH: 5, flags: FACADE_FLAG.ARCADE, color: '#F0D27A' },
  316385802: { style: FACADE.COLONIAL, levels: 2, floorH: 5, flags: FACADE_FLAG.ARCADE, color: '#E8B84A' },
  221169030: { style: FACADE.CORAL_STONE, levels: 1, floorH: 6, crenel: true, parapet: 0 },
  323835266: { style: FACADE.RUINS, levels: 1, floorH: 5, roofless: true },
  316385801: { style: FACADE.RUINS, levels: 1, floorH: 4.5, roofless: true },
  316385794: { style: FACADE.RUINS, levels: 1, floorH: 5, roofless: true },
  4049320: { landmark: 'palacio_nacional', style: FACADE.MARBLE, levels: 3, floorH: 5.4, dome: true, parapet: 1.4, color: '#EAD3C8' },
  6193094: { landmark: 'altar_patria', style: FACADE.MARBLE, levels: 1, floorH: 9.5, parapet: 0.5, color: '#F2F0EA' },
};

export interface BuildCtx {
  osm: OsmData;
  roads: RoadIndex;
  noBuild: AreaIndex;
  land: (p: Pt) => boolean;
  isColonial: (p: Pt) => boolean;
  distClass: (p: Pt, classes: string[], r: number) => number;
}

function pickLevels(r: () => number, weights: [number, number][]): number {
  let t = r() * weights.reduce((a, w) => a + w[1], 0);
  for (const [v, w] of weights) if ((t -= w) <= 0) return v;
  return weights[0][0];
}

function makeBldg(id: string, poly: Poly, ctx: BuildCtx, tags: Record<string, string>, source: 'osm' | 'infill', osmId?: number, forced?: Partial<Bldg>): Bldg {
  const seed = hash01(osmId ?? parseInt(id.replace(/\D/g, '').slice(-9) || '7', 10));
  const r = rng(Math.floor(seed * 1e9));
  const c = centroid(poly[0]);
  const area = Math.abs(signedArea(poly[0]));
  const colonial = ctx.isColonial(c);
  const dTrunk = ctx.distClass(c, ['trunk'], 160);
  const dAve = ctx.distClass(c, ['primary', 'secondary'], 40);
  const ov = osmId !== undefined ? OVERRIDES[osmId] : undefined;
  let levels = parseFloat(tags['building:levels'] ?? '') || 0;
  const hTag = parseFloat((tags.height ?? '').replace(/[^0-9.]/g, '')) || 0;
  let style: number;
  let floorH = 3.1;
  let flags = 0;
  if (ov) {
    style = ov.style;
    levels = ov.levels;
    floorH = ov.floorH;
    flags = ov.flags ?? 0;
  } else {
    if (!levels && hTag) levels = Math.max(1, Math.round(hTag / 3.1));
    if (!levels) {
      if (colonial) levels = pickLevels(r, [[2, 62], [1, 26], [3, 12]]);
      else if (dTrunk < 90 && area > 650) levels = 7 + Math.floor(r() * 9);
      else if (area > 1600) levels = 3 + Math.floor(r() * 4);
      else if (area > 450) levels = pickLevels(r, [[2, 35], [3, 35], [4, 20], [5, 10]]);
      else levels = pickLevels(r, [[1, 34], [2, 42], [3, 16], [4, 8]]);
    }
    const kind = tags.building ?? 'yes';
    if (colonial) {
      style = /church|chapel|cathedral/.test(kind) || tags.historic ? FACADE.CORAL_STONE : FACADE.COLONIAL;
      floorH = 4.3;
    } else if (/church|chapel|cathedral/.test(kind)) {
      style = FACADE.GAZCUE;
      floorH = 5;
    } else if (levels >= 7) {
      style = FACADE.TOWER;
      floorH = 3.3;
    } else if (levels >= 4 || kind === 'apartments') {
      style = FACADE.APARTMENT;
    } else if (dAve < 28 || /commercial|retail|supermarket/.test(kind)) {
      style = FACADE.COMMERCIAL;
      flags |= FACADE_FLAG.SHOP;
    } else {
      style = r() < 0.42 ? FACADE.GAZCUE : FACADE.HOUSE;
    }
  }
  const palette = PALETTES[style];
  const color = ov?.color ? srgb(ov.color) : tags['building:colour'] && /^#[0-9a-f]{6}$/i.test(tags['building:colour']) ? srgb(tags['building:colour']) : palette[Math.floor(r() * palette.length)];
  const parapet = ov?.parapet ?? (style === FACADE.TOWER ? 1.4 : style === FACADE.COLONIAL ? 0.75 : style === FACADE.CORAL_STONE ? 0.9 : 0.5 + r() * 0.5);
  const height = hTag && !ov ? hTag : levels * floorH + (style === FACADE.COLONIAL ? 0.5 : 0);
  return {
    id,
    osmId,
    poly,
    bbox: bboxOf(poly[0]),
    levels,
    floorH,
    height,
    parapet,
    style,
    color,
    roofColor: ROOFS[Math.floor(r() * ROOFS.length)],
    seed,
    flags,
    source,
    landmark: ov?.landmark,
    roofless: ov?.roofless,
    crenel: ov?.crenel,
    dome: ov?.dome,
    colonial,
    ...forced,
  };
}

/** Collect OSM building footprints, clipped against road corridors (no building may block a street). */
export function collectOsmBuildings(ctx: BuildCtx, inWorld: (p: Pt) => boolean): { list: Bldg[]; dropped: number; clipped: number } {
  const { osm } = ctx;
  const out: Bldg[] = [];
  let dropped = 0;
  let clipped = 0;
  const cand: { el: { id: number }; tags: Record<string, string>; mp: MultiPoly; rel: boolean }[] = [];
  for (const w of osm.ways) {
    if (!w.tags.building || w.tags.building === 'roof' || w.tags['building:part']) continue;
    cand.push({ el: w, tags: w.tags, mp: areaPolys(osm, w), rel: false });
  }
  for (const rel of osm.relations) {
    if (rel.tags.type === 'building') {
      const outline = rel.members.find((m) => m.role === 'outline' && m.type === 'w');
      const w = outline ? osm.wayById.get(outline.ref) : undefined;
      if (w) cand.push({ el: rel, tags: { ...w.tags, ...rel.tags, building: 'yes' }, mp: areaPolys(osm, w), rel: true });
      continue;
    }
    if (rel.tags.type === 'multipolygon' && (rel.tags.building || OVERRIDES[rel.id])) cand.push({ el: rel, tags: rel.tags, mp: areaPolys(osm, rel), rel: true });
  }
  // Ways that are outlines of building relations should not be duplicated.
  const relOutlineWays = new Set<number>();
  for (const rel of osm.relations) for (const m of rel.members) if (rel.tags.type === 'building' && m.type === 'w') relOutlineWays.add(m.ref);
  const items = cand
    .filter((c) => c.rel || !relOutlineWays.has(c.el.id))
    .map((c) => ({ ...c, area: multiArea(c.mp) }))
    .filter((c) => c.area > 8)
    .sort((a, b) => b.area - a.area);
  const placed = new SpatialHash<Bldg>(50);
  for (const c of items) {
    const poly0 = c.mp[0];
    if (!poly0) continue;
    const ctr = centroid(poly0[0]);
    if (!inWorld(ctr) || !ctx.land(ctr)) continue;
    // Skip small parts fully inside a larger building already placed (duplicates / parts).
    let inside = false;
    for (const b of placed.query([ctr[0], ctr[1], ctr[0], ctr[1]])) if (pointInPoly(ctr, b.poly)) inside = true;
    if (inside && !OVERRIDES[c.el.id]) continue;
    // Clip against carriageway + most of the sidewalk.
    const bb = bboxOf(poly0[0]);
    const pieces: MultiPoly = [];
    for (const s of ctx.roads.near([(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2], Math.max(bb[2] - bb[0], bb[3] - bb[1]) / 2 + 30)) {
      if (s.cls === 'footway' || s.cls === 'steps') continue;
      const hw = s.hw + s.sw * 0.8;
      for (const q of segmentQuads([s.a, s.b], hw)) pieces.push([q]);
      pieces.push([disk(s.a, hw, 10)], [disk(s.b, hw, 10)]);
    }
    let res: MultiPoly = c.mp;
    if (pieces.length && !OVERRIDES[c.el.id]) {
      res = difference(c.mp, pieces);
      const a2 = multiArea(res);
      if (a2 < c.area * 0.55) {
        dropped++;
        continue;
      }
      if (a2 < c.area - 0.5) clipped++;
    }
    let k = 0;
    for (const poly of res) {
      if (Math.abs(signedArea(poly[0])) < 10) continue;
      const fixed: Poly = [orientCW(poly[0]), ...poly.slice(1)];
      const b = makeBldg(`o${c.el.id}_${k++}`, fixed, ctx, c.tags, 'osm', c.el.id);
      out.push(b);
      placed.insertBBox(b.bbox, b);
    }
  }
  return { list: out, dropped, clipped };
}

/**
 * Procedural infill where OSM has no footprints: lots placed along street
 * frontages, rejected if they touch a corridor, an existing building, water,
 * a park/plaza or a landmark ground. Marked source='infill' (see docs/ASSETS.md).
 */
export function generateInfill(ctx: BuildCtx, existing: Bldg[], edges: { ptsXZ: Pt[]; width: number; sidewalk: number; cls: string; drivable: boolean; a: number; b: number }[], nodeRadius: (id: number) => number, inPlay: (p: Pt) => boolean): Bldg[] {
  const index = new SpatialHash<{ poly: Pt[]; bb: number[] }>(40);
  for (const b of existing) index.insertBBox(b.bbox, { poly: b.poly[0], bb: b.bbox });
  const out: Bldg[] = [];
  const r = rng(1844);
  let n = 0;
  const overlaps = (quad: Pt[]): boolean => {
    const bb = bboxOf(quad);
    const samples: Pt[] = [...quad];
    for (let i = 0; i < 4; i++) {
      const a = quad[i];
      const b = quad[(i + 1) % 4];
      samples.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    }
    const c: Pt = [(quad[0][0] + quad[2][0]) / 2, (quad[0][1] + quad[2][1]) / 2];
    samples.push(c);
    for (const s of samples) {
      if (!ctx.land(s) || !inPlay(s) || ctx.noBuild.has(s) || ctx.roads.inCorridor(s, 0.05, true)) return true;
    }
    for (const it of index.query(bb)) {
      for (const s of samples) if (pointInPoly(s, [it.poly])) return true;
      for (const v of it.poly) if (v[0] > bb[0] && v[0] < bb[2] && v[1] > bb[1] && v[1] < bb[3] && pointInPoly(v, [quad])) return true;
    }
    return false;
  };
  for (const e of edges) {
    if (!['residential', 'tertiary', 'secondary', 'primary', 'living', 'pedestrian'].includes(e.cls)) continue;
    const len = e.ptsXZ.reduce((acc, p, i) => (i ? acc + dist(e.ptsXZ[i - 1], p) : 0), 0);
    if (len < 8) continue;
    for (const side of [1, -1]) {
      const colonialEdge = ctx.isColonial(e.ptsXZ[Math.floor(e.ptsXZ.length / 2)]);
      const setback = colonialEdge ? 0.05 : e.cls === 'residential' && r() < 0.55 ? 1.5 + r() * 2.5 : 0.1;
      const off = side * (e.width / 2 + e.sidewalk + setback + 0.15);
      const line = offsetPolyline(e.ptsXZ, off);
      const ra = nodeRadius(e.a) + e.sidewalk + 1.5;
      const rb = nodeRadius(e.b) + e.sidewalk + 1.5;
      let s = ra;
      // walk along the offset line placing lots
      const lineLen = line.reduce((acc, p, i) => (i ? acc + dist(line[i - 1], p) : 0), 0);
      while (s < lineLen - rb - 4) {
        const front = colonialEdge ? 6 + r() * 6 : e.cls === 'residential' ? 8 + r() * 7 : 7 + r() * 9;
        const s2 = Math.min(s + front, lineLen - rb);
        if (s2 - s < 4) break;
        const p1 = pointAt(line, s);
        const p2 = pointAt(line, s2);
        const fx = p2[0] - p1[0];
        const fz = p2[1] - p1[1];
        const fl = Math.hypot(fx, fz) || 1;
        // inward direction: away from the road (same side as offset)
        const ix = (-fz / fl) * side;
        const iz = (fx / fl) * side;
        let placed = false;
        for (const depthF of [1, 0.7, 0.5]) {
          const depth = (colonialEdge ? 12 + r() * 10 : 11 + r() * 9) * depthF;
          const quad: Pt[] = [p1, p2, [p2[0] + ix * depth, p2[1] + iz * depth], [p1[0] + ix * depth, p1[1] + iz * depth]];
          if (depth < 6 || overlaps(quad)) continue;
          const ring = orientCW(quad);
          const isCorner = s < ra + 2 || s2 > lineLen - rb - 2;
          const b = makeBldg(`i${n++}`, [ring], ctx, {}, 'infill', undefined);
          if (isCorner && !b.colonial && r() < 0.3) b.flags |= FACADE_FLAG.SHOP;
          out.push(b);
          index.insertBBox(b.bbox, { poly: ring, bb: b.bbox });
          placed = true;
          break;
        }
        s = s2 + (placed ? (colonialEdge ? 0.02 : r() < 0.5 ? 0.02 : 0.6 + r() * 1.6) : 3);
      }
    }
  }
  return out;
}

function pointAt(line: Pt[], s: number): Pt {
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const l = dist(line[i - 1], line[i]);
    if (acc + l >= s) {
      const t = (s - acc) / (l || 1);
      return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t];
    }
    acc += l;
  }
  return line[line.length - 1];
}

/**
 * Emit walls (facade attributes), roof, parapet and wall-mounted props for one building.
 */
export function emitBuilding(b: Bldg, walls: MeshBuilder, roofs: MeshBuilder, stone: MeshBuilder, col: MeshBuilder, props: PropSink, roads: RoadIndex) {
  const H = b.height;
  const top = b.roofless ? H : H + b.parapet;
  const bayW = BAY_W[b.style];
  const r = rng(Math.floor(b.seed * 1e9) + 17);
  for (const ring of b.poly) {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const a = ring[i];
      const c = ring[(i + 1) % n];
      const L = dist(a, c);
      if (L < 0.15) continue;
      const dx = (c[0] - a[0]) / L;
      const dz = (c[1] - a[1]) / L;
      let nx = dz;
      let nz = -dx;
      // make sure the normal points away from the building mass
      const mid: Pt = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
      if (pointInPoly([mid[0] + nx * 0.3, mid[1] + nz * 0.3], b.poly)) {
        nx = -nx;
        nz = -nz;
      }
      const probe: Pt = [mid[0] + nx * 3.5, mid[1] + nz * 3.5];
      const nr = roads.nearest(probe, 30, (s) => s.cls !== 'footway' && s.cls !== 'steps');
      const street = !!nr && nr.d < nr.seg.hw + nr.seg.sw + 4;
      const bays = L < 1.7 ? 0 : Math.max(1, Math.round(L / bayW));
      let flags = b.flags;
      if (street) flags |= FACADE_FLAG.STREET;
      else flags &= ~FACADE_FLAG.SHOP;
      // pedestrian shopping streets (Calle El Conde) have shopfronts on most ground floors
      if (street && nr!.seg.cls === 'pedestrian' && hash01(Math.floor(b.seed * 1e6) + i) < 0.75) flags |= FACADE_FLAG.SHOP;
      if (bays === 0) flags |= FACADE_FLAG.BLANK;
      const ex = { facade: [b.style, b.seed, flags, b.levels], bdim: [b.floorH, L] };
      walls.wall(a, c, 0, top, nx, nz, 0, bays === 0 ? L / bayW : bays, 0, top / b.floorH, b.color, ex);
      // collision: walls up to the roof
      col.wall(a, c, 0, Math.min(top, 30), nx, nz, 0, 0, 0, 0);
      if (!b.roofless && b.parapet > 0.05) {
        // inner parapet face + cap
        const ia: Pt = [a[0] - nx * 0.22, a[1] - nz * 0.22];
        const ic: Pt = [c[0] - nx * 0.22, c[1] - nz * 0.22];
        roofs.wall(ia, ic, H, top, -nx, -nz, 0, L, H, top, b.roofColor);
        const capC: V3 = [b.color[0] * 0.9, b.color[1] * 0.9, b.color[2] * 0.9];
        const i0 = roofs.v([a[0], top, a[1]], [0, 1, 0], [0, 0], capC);
        const i1 = roofs.v([c[0], top, c[1]], [0, 1, 0], [L, 0], capC);
        const i2 = roofs.v([ic[0], top, ic[1]], [0, 1, 0], [L, 0.22], capC);
        const i3 = roofs.v([ia[0], top, ia[1]], [0, 1, 0], [0, 0.22], capC);
        // winding fixed below by testing orientation
        const cy = (c[1] - a[1]) * (ia[0] - a[0]) - (c[0] - a[0]) * (ia[1] - a[1]);
        if (cy > 0) roofs.quad(i0, i1, i2, i3);
        else roofs.quad(i0, i3, i2, i1);
      }
      if (b.crenel) {
        // merlons along the top edge
        const step = 1.7;
        const count = Math.floor(L / step);
        const rot = Math.atan2(dz, dx);
        for (let k = 0; k < count; k++) {
          const t = (k + 0.5) / count;
          const px = a[0] + (c[0] - a[0]) * t - nx * 0.35;
          const pz = a[1] + (c[1] - a[1]) * t - nz * 0.35;
          stone.box(px, top + 0.55, pz, 0.45, 0.55, 0.35, rot, b.color, 1);
        }
      }
      if (street && bays > 0) emitWallProps(b, a, c, nx, nz, bays, L, props, r);
    }
  }
  if (!b.roofless) {
    roofs.flat(b.poly, H, b.roofColor, 1);
    emitRoofProps(b, props, r);
    if (b.dome) emitDome(b, stone);
  }
}

function emitWallProps(b: Bldg, a: Pt, c: Pt, nx: number, nz: number, bays: number, L: number, props: PropSink, r: () => number) {
  const rot = Math.atan2(nx, nz); // object +Z faces outward
  const at = (t: number, out = 0): Pt => [a[0] + (c[0] - a[0]) * t + nx * out, a[1] + (c[1] - a[1]) * t + nz * out];
  const fh = b.floorH;
  for (let i = 0; i < bays; i++) {
    const t = (i + 0.5) / bays;
    const h = hash01(Math.floor(b.seed * 1e6) + i * 131);
    const p = at(t, 0.02);
    switch (b.style) {
      case FACADE.COLONIAL:
        if (b.levels >= 2 && h < 0.45 && !(b.flags & FACADE_FLAG.ARCADE)) props.add('balcony', p[0], fh + 0.05, p[1], rot, 0);
        if (i % 3 === 1) {
          const lp = at(t + 0.5 / bays, 0.02);
          props.add('lamp_colonial', lp[0], 3.5, lp[1], rot, 0);
          props.light(lp[0] + nx * 0.45, 3.3, lp[1] + nz * 0.45, 0);
        }
        break;
      case FACADE.GAZCUE:
      case FACADE.HOUSE:
        if (b.levels >= 2 && h < 0.3) props.add('balcony', p[0], fh + 0.05, p[1], rot, 1);
        if (h > 0.8 && b.levels >= 1) props.add('ac_unit', p[0], fh * Math.min(b.levels - 1, 1) + 1.9, p[1], rot, 0);
        break;
      case FACADE.APARTMENT:
        for (let f = 1; f < b.levels; f++) if (h < 0.5) props.add('balcony', p[0], fh * f + 0.05, p[1], rot, 1);
        if (h > 0.7) props.add('ac_unit', p[0], fh * Math.max(1, Math.floor(r() * b.levels)) + 1.8, p[1], rot, 0);
        break;
      case FACADE.COMMERCIAL:
        if (h < 0.4) props.add('awning', p[0], 2.75, p[1], rot, Math.floor(h * 10) % 4);
        if (h > 0.75 && b.levels > 1) props.add('ac_unit', p[0], fh * (1 + Math.floor(r() * (b.levels - 1))) + 1.8, p[1], rot, 0);
        break;
      default:
        break;
    }
  }
  void L;
}

function emitRoofProps(b: Bldg, props: PropSink, r: () => number) {
  if (b.style === FACADE.CORAL_STONE || b.style === FACADE.MARBLE || b.style === FACADE.RUINS) return;
  const [x0, z0, x1, z1] = b.bbox;
  const want = b.style === FACADE.COLONIAL ? (r() < 0.35 ? 1 : 0) : b.style === FACADE.TOWER ? 2 : 1 + Math.floor(r() * 2.2);
  let placed = 0;
  for (let tries = 0; tries < 12 && placed < want; tries++) {
    const p: Pt = [x0 + 1.5 + r() * Math.max(0, x1 - x0 - 3), z0 + 1.5 + r() * Math.max(0, z1 - z0 - 3)];
    if (!pointInPoly(p, b.poly)) continue;
    let ok = true;
    for (const d of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) if (!pointInPoly([p[0] + d[0], p[1] + d[1]], b.poly)) ok = false;
    if (!ok) continue;
    props.add('tinaco', p[0], b.height, p[1], r() * Math.PI * 2, Math.floor(r() * 3));
    placed++;
  }
  if ((b.style === FACADE.HOUSE || b.style === FACADE.GAZCUE) && r() < 0.3) {
    const v = b.poly[0][0];
    props.add('rebar', v[0], b.height + b.parapet, v[1], 0, 0);
  }
  if (r() < 0.18 && b.style !== FACADE.COLONIAL) {
    const c = centroid(b.poly[0]);
    if (pointInPoly(c, b.poly)) props.add('dish', c[0], b.height, c[1], r() * 6.28, 0);
  }
}

function emitDome(b: Bldg, stone: MeshBuilder) {
  const c = centroid(b.poly[0]);
  const top = b.height + b.parapet;
  const R = 8.5;
  const segs = 24;
  const drumH = 5;
  // drum
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const p0: Pt = [c[0] + Math.cos(a0) * R, c[1] + Math.sin(a0) * R];
    const p1: Pt = [c[0] + Math.cos(a1) * R, c[1] + Math.sin(a1) * R];
    const am = (a0 + a1) / 2;
    stone.wall(p0, p1, top, top + drumH, Math.cos(am), Math.sin(am), i, i + 1, 0, drumH, b.color);
  }
  // hemisphere
  const rings = 10;
  const domeCol: V3 = [0.42, 0.55, 0.5];
  for (let j = 0; j < rings; j++) {
    const t0 = (j / rings) * (Math.PI / 2);
    const t1 = ((j + 1) / rings) * (Math.PI / 2);
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const P = (t: number, a: number): V3 => [c[0] + Math.cos(a) * Math.cos(t) * R, top + drumH + Math.sin(t) * R * 1.05, c[1] + Math.sin(a) * Math.cos(t) * R];
      const N = (t: number, a: number): V3 => [Math.cos(a) * Math.cos(t), Math.sin(t), Math.sin(a) * Math.cos(t)];
      const v0 = stone.v(P(t0, a0), N(t0, a0), [i, j], domeCol);
      const v1 = stone.v(P(t0, a1), N(t0, a1), [i + 1, j], domeCol);
      const v2 = stone.v(P(t1, a1), N(t1, a1), [i + 1, j + 1], domeCol);
      const v3 = stone.v(P(t1, a0), N(t1, a0), [i, j + 1], domeCol);
      stone.quad(v0, v3, v2, v1);
    }
  }
  stone.box(c[0], top + drumH + R * 1.05 + 1.2, c[1], 1.2, 1.4, 1.2, 0, b.color);
}

/** Shop kinds from OSM tags. */
export function shopKind(tags: Record<string, string>): ShopKind | null {
  const s = tags.shop;
  const a = tags.amenity;
  if (s === 'convenience' || s === 'kiosk' || s === 'supermarket' || s === 'alcohol' || s === 'beverages') return 'colmado';
  if (s === 'lottery') return 'banca';
  if (a === 'pharmacy' || s === 'chemist') return 'farmacia';
  if (a === 'fast_food') return 'picapollo';
  if (a === 'restaurant') return 'restaurante';
  if (a === 'cafe' || s === 'bakery') return 'cafeteria';
  if (a === 'bar' || a === 'pub' || a === 'nightclub') return 'bar';
  if (s === 'car_parts' || s === 'car_repair' || s === 'tyres') return 'repuestos';
  if (s === 'hardware' || s === 'doityourself') return 'ferreteria';
  if (s === 'hairdresser' || s === 'beauty') return 'salon';
  if (a === 'bank') return 'banco';
  if (s) return 'tienda';
  return null;
}

const NAMES: Record<ShopKind, [string, string[]]> = {
  colmado: ['Colmado', ['La Esquina', 'El Bacán', 'Los Primos', 'La Bendición', 'El Progreso', 'Mi Barrio', 'La Fe', 'Nueva Esperanza', 'Doña Carmen', 'El Tíguere', 'Hermanos Peña', 'El Buen Precio', 'La Placita', 'El Paraíso', 'Los Compadres']],
  banca: ['Banca', ['La Millonaria', 'Suerte Real', 'El Trébol', 'La Fortuna', 'La Primera', 'Número Feliz', 'Palé de Oro', 'Quiniela Caribe']],
  farmacia: ['Farmacia', ['Santa Rita', 'La Salud', 'Altagracia', 'San Judas', 'Del Pueblo', 'Esperanza', 'Los Ángeles']],
  picapollo: ['Pica Pollo', ['El Gordo', 'Tu Sazón', 'Doña Rosa', 'La Brasa', 'El Crujiente', 'El Mejor']],
  restaurante: ['Comedor', ['La Bandera', 'Sabor Criollo', 'Doña Juana', 'El Fogón', 'El Sancocho', 'Mi Abuela', 'La Casona']],
  cafeteria: ['Cafetería', ['El Cafecito', 'La Greca', 'Doña Mercedes', 'El Desayuno', 'Pan Caliente']],
  bar: ['Drink', ['El Malecón', 'La Noche', 'Los Panas', 'El Rincón', 'Dímelo', 'La Terraza']],
  tienda: ['Tienda', ['La Moda', 'Novedades Ana', 'Bazar Caribe', 'El Regalo', 'Variedades Luz']],
  repuestos: ['Repuestos', ['El Motor', 'Caribe Piezas', 'Gomera El Rápido', 'El Pistón']],
  ferreteria: ['Ferretería', ['El Martillo', 'Hermanos Reyes', 'La Económica', 'El Tornillo']],
  salon: ['Salón', ['Belleza Total', 'Estilo y Glamour', 'Barbería El Fade', 'Barbería Los Pibes', 'Rizos de Oro']],
  banco: ['Banco', ['Caribeño', 'del Ozama', 'Antillano']],
};

export function shopName(kind: ShopKind, seed: number): string {
  const [prefix, list] = NAMES[kind];
  const name = list[Math.floor(hash01(seed) * list.length)];
  return `${prefix} ${name}`;
}
