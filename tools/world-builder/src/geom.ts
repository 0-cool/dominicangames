/**
 * 2D geometry helpers for the world builder. All coordinates are world metres
 * in the XZ plane ([x, z] tuples). Polygon booleans use `polygon-clipping`.
 */
import earcut from 'earcut';
import pc from 'polygon-clipping';

export type Pt = [number, number];
export type Ring = Pt[];
export type Poly = Ring[]; // [outer, ...holes]
export type MultiPoly = Poly[];

export const r2 = (v: number) => Math.round(v * 100) / 100;

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function polylineLength(pts: Pt[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

/** Signed area; > 0 means clockwise when viewed from above (+Y) with north up. */
export function signedArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function openRing(ring: Ring): Ring {
  if (ring.length > 1) {
    const a = ring[0];
    const b = ring[ring.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) return ring.slice(0, -1);
  }
  return ring;
}

/** Ensure positive (clockwise-from-above) orientation for outer rings. */
export function orientCW(ring: Ring): Ring {
  return signedArea(ring) >= 0 ? ring : [...ring].reverse();
}

export function centroid(ring: Ring): Pt {
  let cx = 0;
  let cz = 0;
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    const f = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * f;
    cz += (p[1] + q[1]) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-9) {
    const s = ring.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]] as Pt, [0, 0] as Pt);
    return [s[0] / ring.length, s[1] / ring.length];
  }
  return [cx / (3 * a), cz / (3 * a)];
}

export function pointInRing(p: Pt, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const zi = ring[i][1];
    const xj = ring[j][0];
    const zj = ring[j][1];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPoly(p: Pt, poly: Poly): boolean {
  if (!pointInRing(p, poly[0])) return false;
  for (let i = 1; i < poly.length; i++) if (pointInRing(p, poly[i])) return false;
  return true;
}

export function pointInMulti(p: Pt, mp: MultiPoly): boolean {
  for (const poly of mp) if (pointInPoly(p, poly)) return true;
  return false;
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

export function bboxOf(pts: Pt[]): [number, number, number, number] {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const p of pts) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minZ) minZ = p[1];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxZ) maxZ = p[1];
  }
  return [minX, minZ, maxX, maxZ];
}

export function bboxOverlap(a: number[], b: number[], m = 0): boolean {
  return a[0] - m <= b[2] && a[2] + m >= b[0] && a[1] - m <= b[3] && a[3] + m >= b[1];
}

export function disk(c: Pt, r: number, n = 12): Ring {
  const ring: Ring = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ring.push([r2(c[0] + Math.cos(a) * r), r2(c[1] + Math.sin(a) * r)]);
  }
  return ring;
}

export function rect(minX: number, minZ: number, maxX: number, maxZ: number): Ring {
  return [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ];
}

/** Quads for each segment of a polyline with the given half width. */
export function segmentQuads(pts: Pt[], hw: number): Ring[] {
  const out: Ring[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz);
    if (l < 0.05) continue;
    const nx = (-dz / l) * hw;
    const nz = (dx / l) * hw;
    out.push([
      [r2(a[0] + nx), r2(a[1] + nz)],
      [r2(b[0] + nx), r2(b[1] + nz)],
      [r2(b[0] - nx), r2(b[1] - nz)],
      [r2(a[0] - nx), r2(a[1] - nz)],
    ]);
  }
  return out;
}

/** Offset a polyline sideways (positive = right of travel direction when viewed from above). */
export function offsetPolyline(pts: Pt[], off: number): Pt[] {
  const n = pts.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(n - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    // right normal of (dx,dz) with +z = south is (-dz, dx)
    let nx = -dz;
    let nz = dx;
    let scale = 1;
    if (i > 0 && i < n - 1) {
      const a = pts[i - 1];
      const b = pts[i];
      const c = pts[i + 1];
      const d1x = b[0] - a[0];
      const d1z = b[1] - a[1];
      const l1 = Math.hypot(d1x, d1z) || 1;
      const n1x = -d1z / l1;
      const n1z = d1x / l1;
      const d2x = c[0] - b[0];
      const d2z = c[1] - b[1];
      const l2 = Math.hypot(d2x, d2z) || 1;
      const n2x = -d2z / l2;
      const n2z = d2x / l2;
      nx = n1x + n2x;
      nz = n1z + n2z;
      const ln = Math.hypot(nx, nz) || 1;
      nx /= ln;
      nz /= ln;
      const cos = nx * n1x + nz * n1z;
      scale = 1 / Math.max(0.5, cos);
    }
    out.push([pts[i][0] + nx * off * scale, pts[i][1] + nz * off * scale]);
  }
  return out;
}

/** Points at regular spacing along a polyline with tangent direction. */
export function samplePolyline(pts: Pt[], spacing: number, startOffset = 0): { p: Pt; dir: Pt; s: number }[] {
  const out: { p: Pt; dir: Pt; s: number }[] = [];
  let acc = 0;
  let next = startOffset;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const l = dist(a, b);
    if (l < 1e-6) continue;
    const dir: Pt = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    while (next <= acc + l) {
      const t = (next - acc) / l;
      out.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], dir, s: next });
      next += spacing;
    }
    acc += l;
  }
  return out;
}

/** Douglas–Peucker simplification. */
export function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = distToSegment(pts[i], pts[s], pts[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

// ───────────── polygon-clipping wrappers (robust: rounding + try/catch) ─────────────
type PCGeom = Parameters<typeof pc.union>[0];

function clean(g: MultiPoly): MultiPoly {
  const out: MultiPoly = [];
  for (const poly of g) {
    const rings: Ring[] = [];
    for (const ring of poly) {
      const r = openRing(ring.map((p) => [r2(p[0]), r2(p[1])] as Pt));
      const dedup: Ring = [];
      for (const p of r) {
        const l = dedup[dedup.length - 1];
        if (!l || l[0] !== p[0] || l[1] !== p[1]) dedup.push(p);
      }
      if (dedup.length >= 3 && Math.abs(signedArea(dedup)) > 0.01) rings.push(dedup);
      else if (rings.length === 0) break;
    }
    if (rings.length) out.push(rings);
  }
  return out;
}

export function union(...geoms: MultiPoly[]): MultiPoly {
  const gs = geoms.map(clean).filter((g) => g.length);
  if (!gs.length) return [];
  try {
    return clean(pc.union(gs[0] as PCGeom, ...(gs.slice(1) as PCGeom[])) as MultiPoly);
  } catch {
    // Fallback: incremental union, skipping inputs that break the sweep.
    let acc: MultiPoly = gs[0];
    for (let i = 1; i < gs.length; i++) {
      try {
        acc = clean(pc.union(acc as PCGeom, gs[i] as PCGeom) as MultiPoly);
      } catch {
        /* skip degenerate input */
      }
    }
    return acc;
  }
}

export function difference(a: MultiPoly, ...b: MultiPoly[]): MultiPoly {
  const ca = clean(a);
  const cb = b.map(clean).filter((g) => g.length);
  if (!ca.length) return [];
  if (!cb.length) return ca;
  try {
    return clean(pc.difference(ca as PCGeom, ...(cb as PCGeom[])) as MultiPoly);
  } catch {
    let acc = ca;
    for (const g of cb) {
      try {
        acc = clean(pc.difference(acc as PCGeom, g as PCGeom) as MultiPoly);
      } catch {
        /* keep acc */
      }
    }
    return acc;
  }
}

export function intersection(a: MultiPoly, b: MultiPoly): MultiPoly {
  const ca = clean(a);
  const cb = clean(b);
  if (!ca.length || !cb.length) return [];
  try {
    return clean(pc.intersection(ca as PCGeom, cb as PCGeom) as MultiPoly);
  } catch {
    return [];
  }
}

export function multiArea(mp: MultiPoly): number {
  let a = 0;
  for (const poly of mp) {
    a += Math.abs(signedArea(poly[0]));
    for (let i = 1; i < poly.length; i++) a -= Math.abs(signedArea(poly[i]));
  }
  return a;
}

/** Triangulate a polygon with holes; returns flat xz coords and indices (winding fixed to face +Y). */
export function triangulate(poly: Poly): { xz: number[]; idx: number[] } {
  const flat: number[] = [];
  const holes: number[] = [];
  poly.forEach((ring, i) => {
    if (i > 0) holes.push(flat.length / 2);
    for (const p of ring) flat.push(p[0], p[1]);
  });
  const tri = earcut(flat, holes.length ? holes : undefined, 2);
  const idx: number[] = [];
  for (let i = 0; i < tri.length; i += 3) {
    const a = tri[i];
    const b = tri[i + 1];
    const c = tri[i + 2];
    // For an upward (+Y) facing triangle in three.js (CCW seen from above),
    // cross((b-a),(c-a)).y must be > 0. With x east & z south: y = dz1*dx2 - dx1*dz2.
    const dx1 = flat[b * 2] - flat[a * 2];
    const dz1 = flat[b * 2 + 1] - flat[a * 2 + 1];
    const dx2 = flat[c * 2] - flat[a * 2];
    const dz2 = flat[c * 2 + 1] - flat[a * 2 + 1];
    const y = dz1 * dx2 - dx1 * dz2;
    if (y >= 0) idx.push(a, b, c);
    else idx.push(a, c, b);
  }
  return { xz: flat, idx };
}

// ───────────── spatial hash for fast proximity queries ─────────────
export class SpatialHash<T> {
  private cells = new Map<string, T[]>();
  constructor(private readonly size: number) {}
  private key(ix: number, iz: number) {
    return `${ix},${iz}`;
  }
  insertBBox(b: number[], item: T) {
    const s = this.size;
    for (let ix = Math.floor(b[0] / s); ix <= Math.floor(b[2] / s); ix++)
      for (let iz = Math.floor(b[1] / s); iz <= Math.floor(b[3] / s); iz++) {
        const k = this.key(ix, iz);
        let c = this.cells.get(k);
        if (!c) this.cells.set(k, (c = []));
        c.push(item);
      }
  }
  query(b: number[]): Set<T> {
    const s = this.size;
    const out = new Set<T>();
    for (let ix = Math.floor(b[0] / s); ix <= Math.floor(b[2] / s); ix++)
      for (let iz = Math.floor(b[1] / s); iz <= Math.floor(b[3] / s); iz++) {
        const c = this.cells.get(this.key(ix, iz));
        if (c) for (const it of c) out.add(it);
      }
    return out;
  }
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash01(n: number): number {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
