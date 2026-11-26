import type { RoadClass, RoadEdge, RoadNode, RoadSurface } from '@sd/shared';
import { type Pt, dist, polylineLength } from './geom.ts';
import type { OsmData, Tags } from './osm.ts';

export interface RoadSpec {
  cls: RoadClass;
  width: number;
  sidewalk: number;
  lanesF: number;
  lanesB: number;
  speed: number;
  surface: RoadSurface;
  drivable: boolean;
  walkable: boolean;
  oneway: -1 | 0 | 1;
}

const ONEWAY_YES = new Set(['yes', 'true', '1']);

function num(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * OSM highway → road spec. Widths are carriageway widths (curb to curb) in metres,
 * tuned against typical Santo Domingo cross-sections (narrow one-way colonial
 * streets, 4–6 lane avenues, the Malecón's wide carriageway).
 */
export function classify(tags: Tags, colonial: boolean): RoadSpec | null {
  const hw = tags.highway;
  if (!hw) return null;
  if (tags.area === 'yes') return null;
  if (tags.bridge && tags.bridge !== 'no') return null;
  if (tags.tunnel && tags.tunnel !== 'no' && tags.tunnel !== 'building_passage') return null;
  if (tags.layer && tags.layer !== '0' && tags.tunnel !== 'building_passage') return null;
  let oneway: -1 | 0 | 1 = ONEWAY_YES.has(tags.oneway ?? '') ? 1 : tags.oneway === '-1' ? -1 : 0;
  if (tags.junction === 'roundabout' && oneway === 0) oneway = 1;
  const surfaceTag = tags.surface ?? '';
  const pavers = /paving_stones|sett|cobblestone|unhewn_cobblestone|bricks/.test(surfaceTag);
  let cls: RoadClass;
  let laneW = 3.1;
  let def2: number; // default total lanes when two-way
  let def1: number; // default lanes when one-way
  let sidewalk: number;
  let speed: number;
  switch (hw) {
    case 'trunk':
    case 'trunk_link':
      cls = 'trunk';
      laneW = 3.3;
      def2 = 4;
      def1 = 3;
      sidewalk = 3.2;
      speed = 60;
      break;
    case 'primary':
    case 'primary_link':
      cls = 'primary';
      laneW = 3.2;
      def2 = 4;
      def1 = 3;
      sidewalk = 2.6;
      speed = 50;
      break;
    case 'secondary':
    case 'secondary_link':
      cls = 'secondary';
      laneW = 3.1;
      def2 = 3;
      def1 = 2;
      sidewalk = 2.2;
      speed = 45;
      break;
    case 'tertiary':
    case 'tertiary_link':
      cls = 'tertiary';
      def2 = 2;
      def1 = 2;
      sidewalk = 1.9;
      speed = 40;
      break;
    case 'residential':
    case 'unclassified':
      cls = 'residential';
      laneW = colonial ? 2.9 : 3.1;
      def2 = 2;
      def1 = 1;
      sidewalk = colonial ? 1.15 : 1.6;
      speed = colonial ? 25 : 30;
      break;
    case 'living_street':
      cls = 'living';
      laneW = 3;
      def2 = 2;
      def1 = 1;
      sidewalk = 1.0;
      speed = 15;
      break;
    case 'service':
      if (tags.service === 'parking_aisle' || tags.service === 'drive-through') return null;
      cls = 'service';
      laneW = 3;
      def2 = 1;
      def1 = 1;
      sidewalk = 0;
      speed = 20;
      break;
    case 'pedestrian':
      return {
        cls: 'pedestrian',
        width: num(tags.width) ?? 8.5,
        sidewalk: 0,
        lanesF: 0,
        lanesB: 0,
        speed: 0,
        surface: 'pavers',
        drivable: false,
        walkable: true,
        oneway: 0,
      };
    case 'footway':
    case 'path':
    case 'cycleway':
    case 'track':
      if (tags.footway === 'sidewalk' || tags.footway === 'crossing') return null;
      return {
        cls: 'footway',
        width: Math.min(num(tags.width) ?? 2.4, 4),
        sidewalk: 0,
        lanesF: 0,
        lanesB: 0,
        speed: 0,
        surface: /asphalt/.test(surfaceTag) ? 'asphalt' : pavers ? 'pavers' : 'concrete',
        drivable: false,
        walkable: true,
        oneway: 0,
      };
    case 'steps':
      return {
        cls: 'steps',
        width: 2.6,
        sidewalk: 0,
        lanesF: 0,
        lanesB: 0,
        speed: 0,
        surface: 'concrete',
        drivable: false,
        walkable: true,
        oneway: 0,
      };
    default:
      return null;
  }
  const lanesTag = num(tags.lanes);
  let lanesF: number;
  let lanesB: number;
  if (oneway !== 0) {
    lanesF = Math.max(1, Math.round(lanesTag ?? def1));
    lanesB = 0;
  } else {
    const total = Math.max(2, Math.round(lanesTag ?? def2));
    lanesF = num(tags['lanes:forward']) ?? Math.ceil(total / 2);
    lanesB = num(tags['lanes:backward']) ?? Math.max(1, total - lanesF);
  }
  let width = num(tags.width) ?? (lanesF + lanesB) * laneW;
  if (cls === 'residential' && oneway !== 0) width = Math.max(width, colonial ? 4.6 : 5.6); // room for parking
  if (cls === 'service') width = Math.min(Math.max(width, 3.6), 5);
  const maxspeed = num(tags.maxspeed);
  return {
    cls,
    width: Math.round(width * 10) / 10,
    sidewalk,
    lanesF,
    lanesB,
    speed: maxspeed && maxspeed > 5 && maxspeed < 120 ? maxspeed : speed,
    surface: pavers ? 'pavers' : surfaceTag === 'concrete' ? 'concrete' : 'asphalt',
    drivable: true,
    walkable: cls !== 'trunk',
    oneway,
  };
}

export interface BuiltGraph {
  nodes: RoadNode[];
  edges: (RoadEdge & { ptsXZ: Pt[] })[];
  /** OSM crossing locations: [x, z, dirX, dirZ, width] */
  crossings: number[][];
  osmNodeToIndex: Map<number, number>;
}

/** Build a junction graph from OSM highways, splitting ways at shared nodes. */
export function buildGraph(osm: OsmData, isColonial: (p: Pt) => boolean, inWorld: (p: Pt) => boolean): BuiltGraph {
  const roads: { wayId: number; nodes: number[]; spec: RoadSpec; name?: string }[] = [];
  for (const w of osm.ways) {
    if (!w.tags.highway) continue;
    const ids = w.nodes.filter((id) => osm.nodes.has(id));
    if (ids.length < 2) continue;
    const mid = osm.nodes.get(ids[Math.floor(ids.length / 2)])!;
    const spec = classify(w.tags, isColonial([mid.x, mid.z]));
    if (!spec) continue;
    const anyInside = ids.some((id) => {
      const n = osm.nodes.get(id)!;
      return inWorld([n.x, n.z]);
    });
    if (!anyInside) continue;
    let nodes = ids;
    if (spec.oneway === -1) {
      nodes = [...ids].reverse();
      spec.oneway = 1;
    }
    roads.push({ wayId: w.id, nodes, spec, name: w.tags.name });
  }
  const usage = new Map<number, number>();
  for (const r of roads)
    r.nodes.forEach((id, i) => {
      usage.set(id, (usage.get(id) ?? 0) + (i === 0 || i === r.nodes.length - 1 ? 2 : 1));
    });
  const osmNodeToIndex = new Map<number, number>();
  const nodes: RoadNode[] = [];
  const nodeIndex = (osmId: number): number => {
    let i = osmNodeToIndex.get(osmId);
    if (i === undefined) {
      const n = osm.nodes.get(osmId)!;
      i = nodes.length;
      nodes.push({ id: i, x: round(n.x), z: round(n.z), signal: false, edges: [], radius: 0 });
      osmNodeToIndex.set(osmId, i);
    }
    return i;
  };
  const edges: BuiltGraph['edges'] = [];
  for (const r of roads) {
    let start = 0;
    for (let i = 1; i < r.nodes.length; i++) {
      if ((usage.get(r.nodes[i]) ?? 0) >= 2 || i === r.nodes.length - 1) {
        const seg = r.nodes.slice(start, i + 1);
        const ptsXZ: Pt[] = seg.map((id) => {
          const n = osm.nodes.get(id)!;
          return [round(n.x), round(n.z)];
        });
        const length = polylineLength(ptsXZ);
        if (length > 0.3) {
          const a = nodeIndex(seg[0]);
          const b = nodeIndex(seg[seg.length - 1]);
          const s = r.spec;
          const e = {
            id: edges.length,
            a,
            b,
            pts: ptsXZ.flat(),
            ptsXZ,
            cls: s.cls,
            width: s.width,
            sidewalk: s.sidewalk,
            lanesF: s.lanesF,
            lanesB: s.lanesB,
            speed: s.speed,
            surface: s.surface,
            drivable: s.drivable,
            walkable: s.walkable,
            length: Math.round(length * 100) / 100,
            name: r.name,
            osmId: r.wayId,
          };
          edges.push(e);
          nodes[a].edges.push(e.id);
          nodes[b].edges.push(e.id);
        }
        start = i;
      }
    }
  }
  // Traffic signals → nearest junction within 30 m.
  const junctions = nodes.filter((n) => drivableDegree(n, edges) >= 3);
  for (const n of osm.nodes.values()) {
    if (n.tags?.highway !== 'traffic_signals') continue;
    let best: RoadNode | null = null;
    let bestD = 30;
    for (const j of junctions) {
      const d = Math.hypot(j.x - n.x, j.z - n.z);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best) best.signal = true;
  }
  // Junction radius: distance from the node where incident carriageways stop overlapping.
  for (const n of nodes) {
    const inc = n.edges.map((eid) => edges[eid]).filter((e) => e.drivable || e.cls === 'pedestrian');
    if (inc.length < 3) {
      n.radius = 0;
      continue;
    }
    const dirs = inc.map((e) => {
      const p = e.a === n.id ? e.ptsXZ : [...e.ptsXZ].reverse();
      const q = p[Math.min(1, p.length - 1)];
      const l = dist(p[0], q) || 1;
      return { ang: Math.atan2(q[1] - p[0][1], q[0] - p[0][0]), hw: e.width / 2, len: e.length, dx: (q[0] - p[0][0]) / l, dz: (q[1] - p[0][1]) / l };
    });
    dirs.sort((u, v) => u.ang - v.ang);
    let rad = 0;
    for (let i = 0; i < dirs.length; i++) {
      const u = dirs[i];
      const v = dirs[(i + 1) % dirs.length];
      let th = v.ang - u.ang;
      if (th <= 0) th += Math.PI * 2;
      th = Math.min(Math.max(th, 0.45), Math.PI - 0.2);
      const t1 = (v.hw + u.hw * Math.cos(th)) / Math.sin(th);
      const t2 = (u.hw + v.hw * Math.cos(th)) / Math.sin(th);
      rad = Math.max(rad, t1, t2);
    }
    const maxAllowed = Math.min(...dirs.map((d) => d.len * 0.45));
    n.radius = Math.round(Math.min(Math.max(rad + 1.2, 3), 24, maxAllowed) * 10) / 10;
  }
  // OSM crossings (zebra) on drivable roads.
  const crossings: number[][] = [];
  for (const n of osm.nodes.values()) {
    if (n.tags?.highway !== 'crossing') continue;
    // find the edge containing this OSM node
    for (const e of edges) {
      if (!e.drivable) continue;
      const k = e.ptsXZ.findIndex((p) => Math.abs(p[0] - round(n.x)) < 0.02 && Math.abs(p[1] - round(n.z)) < 0.02);
      if (k < 0) continue;
      const p = e.ptsXZ;
      const a = p[Math.max(0, k - 1)];
      const b = p[Math.min(p.length - 1, k + 1)];
      const l = dist(a, b) || 1;
      crossings.push([round(n.x), round(n.z), (b[0] - a[0]) / l, (b[1] - a[1]) / l, e.width]);
      break;
    }
  }
  return { nodes, edges, crossings, osmNodeToIndex };
}

function drivableDegree(n: RoadNode, edges: { drivable: boolean }[]): number {
  return n.edges.filter((e) => edges[e].drivable).length;
}

function round(v: number) {
  return Math.round(v * 100) / 100;
}
