import type { RoadEdge, RoadGraphData, RoadNode, WorldManifest } from '@sd/shared';

/** Lane-level road network built from the OSM-derived graph: lanes, junction connectors, signals, routing. */
export interface Path {
  id: number;
  kind: 'lane' | 'conn';
  pts: Float32Array; // x,z pairs
  cum: Float32Array;
  length: number;
  speed: number; // m/s
  next: Path[];
  // lane-only
  edge?: RoadEdge;
  dir?: 1 | -1;
  index?: number;
  from?: number;
  to?: number;
  sink?: boolean;
  // connector-only
  node?: number;
  inLane?: Path;
  outLane?: Path;
  conflicts?: Set<number>;
  turn?: 'left' | 'right' | 'straight' | 'uturn';
}

export interface Signal {
  node: number;
  groupOf: Map<number, 0 | 1>; // edgeId → phase group
  offset: number;
}

const CYCLE = { green: 16, yellow: 3, allRed: 1.5 };
const DRIVE_CLASSES = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'residential', 'living']);

function offsetLine(pts: number[], off: number): number[] {
  const n = pts.length / 2;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const pi = Math.max(0, i - 1);
    const ni = Math.min(n - 1, i + 1);
    let dx = pts[ni * 2] - pts[pi * 2];
    let dz = pts[ni * 2 + 1] - pts[pi * 2 + 1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    out.push(pts[i * 2] - dz * off, pts[i * 2 + 1] + dx * off);
  }
  return out;
}

function cumulative(pts: number[] | Float32Array): Float32Array {
  const n = pts.length / 2;
  const c = new Float32Array(n);
  for (let i = 1; i < n; i++) c[i] = c[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
  return c;
}

function trim(pts: number[], s0: number, s1: number): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let i = 1; i < pts.length / 2; i++) {
    const ax = pts[i * 2 - 2];
    const az = pts[i * 2 - 1];
    const bx = pts[i * 2];
    const bz = pts[i * 2 + 1];
    const l = Math.hypot(bx - ax, bz - az);
    if (l > 1e-6 && acc + l >= s0 && acc <= s1) {
      const t0 = Math.max(0, (s0 - acc) / l);
      const t1 = Math.min(1, (s1 - acc) / l);
      if (!out.length) out.push(ax + (bx - ax) * t0, az + (bz - az) * t0);
      out.push(ax + (bx - ax) * t1, az + (bz - az) * t1);
    }
    acc += l;
  }
  return out;
}

export class RoadNetwork {
  readonly paths: Path[] = [];
  readonly lanes: Path[] = [];
  readonly nodes: RoadNode[];
  readonly edges: RoadEdge[];
  readonly signals = new Map<number, Signal>();
  readonly sources: Path[] = [];
  private hash = new Map<string, { p: Path; i: number }[]>();
  private readonly cell = 30;
  readonly bounds: WorldManifest['playBounds'];

  constructor(data: RoadGraphData, manifest: WorldManifest) {
    this.nodes = data.nodes;
    this.edges = data.edges;
    this.bounds = manifest.playBounds;
    const inPlay = (n: RoadNode) => n.x > this.bounds.minX && n.x < this.bounds.maxX && n.z > this.bounds.minZ && n.z < this.bounds.maxZ;
    const lanesByNodeIn = new Map<number, Path[]>();
    const lanesByNodeOut = new Map<number, Path[]>();
    for (const e of this.edges) {
      if (!e.drivable || !DRIVE_CLASSES.has(e.cls)) continue;
      const parking = (e as RoadEdge & { parking?: number }).parking ? 2.1 : 0;
      const ra = Math.min(this.nodes[e.a].radius, e.length * 0.42);
      const rb = Math.min(this.nodes[e.b].radius, e.length * 0.42);
      const twoWay = e.lanesF > 0 && e.lanesB > 0;
      const speed = (e.speed / 3.6) * (e.cls === 'residential' ? 0.95 : 1);
      const make = (dir: 1 | -1, i: number, off: number) => {
        const base = dir === 1 ? e.pts : reversePts(e.pts);
        const shifted = offsetLine(base, off);
        const L = cumulative(shifted)[shifted.length / 2 - 1];
        const s0 = dir === 1 ? ra : rb;
        const s1 = L - (dir === 1 ? rb : ra);
        const pts = s1 - s0 > 0.5 ? trim(shifted, s0, s1) : shifted;
        const from = dir === 1 ? e.a : e.b;
        const to = dir === 1 ? e.b : e.a;
        const lane: Path = { id: this.paths.length, kind: 'lane', pts: new Float32Array(pts), cum: cumulative(pts), length: 0, speed, next: [], edge: e, dir, index: i, from, to };
        lane.length = lane.cum[lane.cum.length - 1];
        lane.sink = !inPlay(this.nodes[to]);
        this.paths.push(lane);
        this.lanes.push(lane);
        (lanesByNodeIn.get(to) ?? lanesByNodeIn.set(to, []).get(to)!).push(lane);
        (lanesByNodeOut.get(from) ?? lanesByNodeOut.set(from, []).get(from)!).push(lane);
        if (!inPlay(this.nodes[from])) this.sources.push(lane);
      };
      const hw = e.width / 2;
      if (twoWay) {
        const wF = (hw - parking) / e.lanesF;
        for (let i = 0; i < e.lanesF; i++) make(1, i, (i + 0.5) * wF);
        const wB = hw / e.lanesB;
        for (let i = 0; i < e.lanesB; i++) make(-1, i, (i + 0.5) * wB);
      } else {
        const w = (e.width - parking) / e.lanesF;
        for (let i = 0; i < e.lanesF; i++) make(1, i, -hw + (i + 0.5) * w);
      }
    }
    // Junction connectors
    for (const [node, ins] of lanesByNodeIn) {
      const outs = lanesByNodeOut.get(node) ?? [];
      const conns: Path[] = [];
      for (const li of ins) {
        if (li.sink) continue;
        const nIn = ins.filter((x) => x.edge === li.edge && x.dir === li.dir).length;
        const d0 = dirAtEnd(li.pts);
        for (const lo of outs) {
          const sameEdge = lo.edge === li.edge;
          const d3 = dirAtStart(lo.pts);
          const cross = d0[0] * d3[1] - d0[1] * d3[0];
          const dot = d0[0] * d3[0] + d0[1] * d3[1];
          const ang = Math.atan2(cross, dot);
          const outsSameDir = outs.filter((x) => x.edge === lo.edge && x.dir === lo.dir);
          const nOut = outsSameDir.length;
          let turn: Path['turn'] = Math.abs(ang) < 0.55 ? 'straight' : Math.abs(ang) > 2.7 ? 'uturn' : ang > 0 ? 'right' : 'left';
          if (sameEdge) turn = 'uturn';
          const deadEnd = outs.every((x) => x.edge === li.edge);
          if (turn === 'uturn' && !deadEnd) continue;
          // lane discipline: right turns from the curb lane, left turns from the inner lane
          const i = li.index!;
          const j = lo.index!;
          if (turn === 'straight' && j !== Math.min(i, nOut - 1)) continue;
          if (turn === 'right' && (i !== nIn - 1 || j !== nOut - 1)) continue;
          if (turn === 'left' && (i !== 0 || j !== 0)) continue;
          if (turn === 'uturn' && j !== nOut - 1) continue;
          const p0 = [li.pts[li.pts.length - 2], li.pts[li.pts.length - 1]];
          const p3 = [lo.pts[0], lo.pts[1]];
          const chord = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
          const k = Math.max(0.8, chord * (turn === 'uturn' ? 0.9 : 0.45));
          const pts: number[] = [];
          const N = turn === 'straight' ? 4 : 10;
          for (let s = 0; s <= N; s++) {
            const t = s / N;
            const a = (1 - t) ** 3;
            const b = 3 * (1 - t) ** 2 * t;
            const c = 3 * (1 - t) * t * t;
            const d = t ** 3;
            pts.push(
              a * p0[0] + b * (p0[0] + d0[0] * k) + c * (p3[0] - d3[0] * k) + d * p3[0],
              a * p0[1] + b * (p0[1] + d0[1] * k) + c * (p3[1] - d3[1] * k) + d * p3[1],
            );
          }
          const conn: Path = { id: this.paths.length, kind: 'conn', pts: new Float32Array(pts), cum: cumulative(pts), length: 0, speed: turn === 'straight' ? Math.min(li.speed, lo.speed) : turn === 'uturn' ? 3 : 5.5, next: [lo], node, inLane: li, outLane: lo, conflicts: new Set(), turn };
          conn.length = Math.max(0.1, conn.cum[conn.cum.length - 1]);
          this.paths.push(conn);
          li.next.push(conn);
          conns.push(conn);
        }
      }
      for (let a = 0; a < conns.length; a++)
        for (let b = a + 1; b < conns.length; b++) {
          const A = conns[a];
          const B = conns[b];
          if (A.inLane === B.inLane) continue;
          if (A.outLane === B.outLane || polylinesCross(A.pts, B.pts)) {
            A.conflicts!.add(B.id);
            B.conflicts!.add(A.id);
          }
        }
    }
    // Signals: two phase groups split by approach axis
    for (const n of this.nodes) {
      if (!n.signal) continue;
      const ins = lanesByNodeIn.get(n.id) ?? [];
      const edgesIn = [...new Set(ins.map((l) => l.edge!))];
      if (edgesIn.length < 2) continue;
      const axis = (l: Path) => {
        const d = dirAtEnd(l.pts);
        return Math.atan2(d[1], d[0]);
      };
      const first = axis(ins[0]);
      const groupOf = new Map<number, 0 | 1>();
      for (const e of edgesIn) {
        const l = ins.find((x) => x.edge === e)!;
        let d = Math.abs(axis(l) - first) % Math.PI;
        if (d > Math.PI / 2) d = Math.PI - d;
        groupOf.set(e.id, d < 0.7 ? 0 : 1);
      }
      this.signals.set(n.id, { node: n.id, groupOf, offset: (n.id * 7.31) % 40 });
    }
    // spatial hash for nearest-lane queries
    for (const l of this.lanes)
      for (let i = 0; i < l.pts.length / 2; i++) {
        const k = `${Math.floor(l.pts[i * 2] / this.cell)},${Math.floor(l.pts[i * 2 + 1] / this.cell)}`;
        (this.hash.get(k) ?? this.hash.set(k, []).get(k)!).push({ p: l, i });
      }
  }

  signalState(node: number, edgeId: number, time: number): 'green' | 'yellow' | 'red' {
    const s = this.signals.get(node);
    if (!s) return 'green';
    const g = s.groupOf.get(edgeId) ?? 0;
    const half = CYCLE.green + CYCLE.yellow + CYCLE.allRed;
    const t = (time + s.offset) % (half * 2);
    const local = g === 0 ? t : (t + half) % (half * 2);
    if (local < CYCLE.green) return 'green';
    if (local < CYCLE.green + CYCLE.yellow) return 'yellow';
    return 'red';
  }

  /** Point and heading at distance s along a path. */
  sample(p: Path, s: number, out: { x: number; z: number; dx: number; dz: number }) {
    const c = p.cum;
    const n = c.length;
    s = Math.max(0, Math.min(p.length, s));
    let i = 1;
    while (i < n - 1 && c[i] < s) i++;
    const l = c[i] - c[i - 1] || 1;
    const t = (s - c[i - 1]) / l;
    const ax = p.pts[i * 2 - 2];
    const az = p.pts[i * 2 - 1];
    const bx = p.pts[i * 2];
    const bz = p.pts[i * 2 + 1];
    out.x = ax + (bx - ax) * t;
    out.z = az + (bz - az) * t;
    out.dx = (bx - ax) / l;
    out.dz = (bz - az) / l;
    return out;
  }

  nearestLane(x: number, z: number, maxDist = 60): { lane: Path; s: number; d: number } | null {
    let best: { lane: Path; s: number; d: number } | null = null;
    const r = Math.ceil(maxDist / this.cell);
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    for (let i = -r; i <= r; i++)
      for (let j = -r; j <= r; j++)
        for (const { p, i: k } of this.hash.get(`${cx + i},${cz + j}`) ?? []) {
          if (k === 0) continue;
          const ax = p.pts[k * 2 - 2];
          const az = p.pts[k * 2 - 1];
          const bx = p.pts[k * 2];
          const bz = p.pts[k * 2 + 1];
          const dx = bx - ax;
          const dz = bz - az;
          const l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
          const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
          if (d < maxDist && (!best || d < best.d)) best = { lane: p, s: p.cum[k - 1] + Math.sqrt(l2) * t, d };
        }
    return best;
  }

  /** A* over lanes (time cost). Returns the polyline from start to goal (flat x,z). */
  route(sx: number, sz: number, gx: number, gz: number): number[] {
    const start = this.nearestLane(sx, sz, 120);
    const goal = this.nearestLane(gx, gz, 150);
    if (!start || !goal) return [];
    const open = new Map<number, number>();
    const g = new Map<number, number>();
    const came = new Map<number, Path>();
    const h = (p: Path) => Math.hypot(p.pts[p.pts.length - 2] - gx, p.pts[p.pts.length - 1] - gz) / 16;
    g.set(start.lane.id, 0);
    open.set(start.lane.id, h(start.lane));
    let found: Path | null = null;
    let iter = 0;
    while (open.size && iter++ < 40000) {
      let curId = -1;
      let best = Infinity;
      for (const [id, f] of open) if (f < best) ((best = f), (curId = id));
      open.delete(curId);
      const cur = this.paths[curId];
      if (cur === goal.lane) {
        found = cur;
        break;
      }
      const base = g.get(curId)! + cur.length / Math.max(2, cur.speed);
      for (const nx of cur.next) {
        if (g.has(nx.id) && g.get(nx.id)! <= base) continue;
        g.set(nx.id, base);
        came.set(nx.id, cur);
        open.set(nx.id, base + h(nx));
      }
    }
    if (!found) return [];
    const chain: Path[] = [found];
    while (chain[0] !== start.lane) {
      const prev = came.get(chain[0].id);
      if (!prev) break;
      chain.unshift(prev);
    }
    const out: number[] = [];
    chain.forEach((p, idx) => {
      const n = p.pts.length / 2;
      for (let i = 0; i < n; i++) {
        const s = p.cum[i];
        if (idx === 0 && s < start.s) continue;
        if (idx === chain.length - 1 && s > goal.s) break;
        out.push(p.pts[i * 2], p.pts[i * 2 + 1]);
      }
    });
    out.push(gx, gz);
    return out;
  }
}

function reversePts(p: number[]): number[] {
  const out: number[] = [];
  for (let i = p.length / 2 - 1; i >= 0; i--) out.push(p[i * 2], p[i * 2 + 1]);
  return out;
}
function dirAtEnd(p: Float32Array): [number, number] {
  const n = p.length;
  const dx = p[n - 2] - p[n - 4];
  const dz = p[n - 1] - p[n - 3];
  const l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
}
function dirAtStart(p: Float32Array): [number, number] {
  const dx = p[2] - p[0];
  const dz = p[3] - p[1];
  const l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
}
function segX(a: number[], b: number[], c: number[], d: number[]): boolean {
  const o = (p: number[], q: number[], r: number[]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(a, b, c);
  const d2 = o(a, b, d);
  const d3 = o(c, d, a);
  const d4 = o(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
function polylinesCross(A: Float32Array, B: Float32Array): boolean {
  for (let i = 1; i < A.length / 2; i++)
    for (let j = 1; j < B.length / 2; j++)
      if (segX([A[i * 2 - 2], A[i * 2 - 1]], [A[i * 2], A[i * 2 + 1]], [B[j * 2 - 2], B[j * 2 - 1]], [B[j * 2], B[j * 2 + 1]])) return true;
  return false;
}
