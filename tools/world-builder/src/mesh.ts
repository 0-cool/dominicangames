import { Document, NodeIO } from '@gltf-transform/core';
import { type Poly, type Pt, triangulate } from './geom.ts';

export type V3 = [number, number, number];

/**
 * Accumulates an indexed triangle mesh with optional vertex colours and custom
 * attributes (exported as glTF `_NAME` attributes, read by three.js as `_name`).
 */
export class MeshBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  extras: Record<string, { size: number; data: number[] }> = {};
  constructor(
    public readonly name: string,
    public readonly opts: { color?: boolean; uv?: boolean; extras?: Record<string, number> } = {},
  ) {
    for (const [k, size] of Object.entries(opts.extras ?? {})) this.extras[k] = { size, data: [] };
  }

  get vertexCount() {
    return this.pos.length / 3;
  }
  get triangleCount() {
    return this.idx.length / 3;
  }

  v(p: V3, n: V3, uv: [number, number] = [0, 0], c?: V3, ex?: Record<string, number[]>): number {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    if (this.opts.uv !== false) this.uv.push(uv[0], uv[1]);
    if (this.opts.color) this.col.push(c?.[0] ?? 1, c?.[1] ?? 1, c?.[2] ?? 1);
    for (const [k, e] of Object.entries(this.extras)) {
      const vals = ex?.[k];
      for (let i = 0; i < e.size; i++) e.data.push(vals?.[i] ?? 0);
    }
    return this.vertexCount - 1;
  }

  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }

  /** Quad a-b-c-d given counter-clockwise as seen from the side the normal points to. */
  quad(a: number, b: number, c: number, d: number) {
    this.idx.push(a, b, c, a, c, d);
  }

  /** Horizontal polygon facing +Y at height y; uv = world xz * uvScale. */
  flat(poly: Poly, y: number, c?: V3, uvScale = 1, ex?: Record<string, number[]>) {
    const { xz, idx } = triangulate(poly);
    const base = this.vertexCount;
    for (let i = 0; i < xz.length; i += 2) this.v([xz[i], y, xz[i + 1]], [0, 1, 0], [xz[i] * uvScale, xz[i + 1] * uvScale], c, ex);
    for (const i of idx) this.idx.push(base + i);
  }

  /**
   * Vertical wall from a→b between y0..y1 facing outward normal (nx, nz).
   * u0/u1 and v0/v1 are the texture coordinates at the ends / bottom & top.
   */
  wall(a: Pt, b: Pt, y0: number, y1: number, nx: number, nz: number, u0: number, u1: number, v0: number, v1: number, c?: V3, ex?: Record<string, number[]>) {
    const n: V3 = [nx, 0, nz];
    // A viewer outside looks along -n; their right-hand direction is (-n) × up = (nz, 0, -nx).
    // Emit CCW (as seen by that viewer): left-bottom, right-bottom, right-top, left-top.
    const rx = nz;
    const rz = -nx;
    const aRight = (a[0] - b[0]) * rx + (a[1] - b[1]) * rz > 0;
    const L = aRight ? b : a;
    const R = aRight ? a : b;
    const uL = aRight ? u1 : u0;
    const uR = aRight ? u0 : u1;
    const i0 = this.v([L[0], y0, L[1]], n, [uL, v0], c, ex);
    const i1 = this.v([R[0], y0, R[1]], n, [uR, v0], c, ex);
    const i2 = this.v([R[0], y1, R[1]], n, [uR, v1], c, ex);
    const i3 = this.v([L[0], y1, L[1]], n, [uL, v1], c, ex);
    this.quad(i0, i1, i2, i3);
  }

  /** Axis-aligned-ish box (rotated around Y) — centre, half extents, rotation. */
  box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rot: number, c?: V3, uvScale = 1, ex?: Record<string, number[]>) {
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    const P = (x: number, z: number): Pt => [cx + x * cs - z * sn, cz + x * sn + z * cs];
    const corners = [P(-hx, -hz), P(hx, -hz), P(hx, hz), P(-hx, hz)];
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const l = Math.hypot(dx, dz) || 1;
      // outward normal: corners are ordered clockwise from above (positive area) → outward = (dz, -dx)
      this.wall(a, b, cy - hy, cy + hy, dz / l, -dx / l, 0, l * uvScale, (cy - hy) * uvScale, (cy + hy) * uvScale, c, ex);
    }
    this.flat([corners], cy + hy, c, uvScale, ex);
  }

  merge(other: MeshBuilder) {
    const base = this.vertexCount;
    this.pos.push(...other.pos);
    this.nrm.push(...other.nrm);
    this.uv.push(...other.uv);
    this.col.push(...other.col);
    for (const i of other.idx) this.idx.push(base + i);
    for (const [k, e] of Object.entries(this.extras)) e.data.push(...(other.extras[k]?.data ?? []));
  }
}

/** Write named meshes into a single GLB (one node per mesh). Empty meshes are skipped. */
export async function writeGlb(meshes: MeshBuilder[], collision: MeshBuilder | null): Promise<Uint8Array> {
  const doc = new Document();
  doc.createBuffer('main');
  const buffer = doc.getRoot().listBuffers()[0];
  const scene = doc.createScene('chunk');
  const all = collision ? [...meshes, collision] : meshes;
  for (const m of all) {
    if (m.triangleCount === 0) continue;
    const prim = doc.createPrimitive();
    prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(m.pos)).setBuffer(buffer));
    if (m !== collision) {
      prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(m.nrm)).setBuffer(buffer));
      if (m.uv.length) prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(m.uv)).setBuffer(buffer));
      if (m.col.length) prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(new Float32Array(m.col)).setBuffer(buffer));
      for (const [k, e] of Object.entries(m.extras)) {
        if (!e.data.length) continue;
        const type = e.size === 1 ? 'SCALAR' : (`VEC${e.size}` as 'VEC2' | 'VEC3' | 'VEC4');
        prim.setAttribute(`_${k.toUpperCase()}`, doc.createAccessor().setType(type).setArray(new Float32Array(e.data)).setBuffer(buffer));
      }
    }
    const ia = m.vertexCount > 65535 ? new Uint32Array(m.idx) : new Uint16Array(m.idx);
    prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(ia).setBuffer(buffer));
    prim.setMaterial(doc.createMaterial(m.name));
    const mesh = doc.createMesh(m.name).addPrimitive(prim);
    scene.addChild(doc.createNode(m.name).setMesh(mesh));
  }
  doc.getRoot().getAsset().generator = 'sd-open-world world-builder';
  return new NodeIO().writeBinary(doc);
}
