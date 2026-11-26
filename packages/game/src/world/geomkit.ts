import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Small toolkit to assemble vertex-coloured procedural meshes (props, vegetation, vehicles, people). */
export type RGB = [number, number, number];

export const hex = (h: number): RGB => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b];
};

export class Kit {
  private parts: THREE.BufferGeometry[] = [];
  private extraNames = new Set<string>();
  /** When set, parts keep/receive texture coordinates; untextured parts map to this atlas texel. */
  constructor(private readonly solidUv: [number, number] | null = null) {}

  /** Add a geometry with uniform colour, transform and optional per-vertex extras. */
  add(g: THREE.BufferGeometry, color: RGB, m?: THREE.Matrix4, extras?: Record<string, number | ((p: THREE.Vector3) => number)>): this {
    let geo = g.index ? g.toNonIndexed() : g;
    if (geo === g) geo = g.clone();
    if (m) geo.applyMatrix4(m);
    if (!this.solidUv) geo.deleteAttribute('uv');
    else if (!(geo.userData as { textured?: boolean }).textured && !(g.userData as { textured?: boolean }).textured) {
      const uv = new Float32Array(geo.attributes.position.count * 2);
      for (let i = 0; i < uv.length; i += 2) uv.set(this.solidUv, i);
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set(color, i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const p = new THREE.Vector3();
    for (const [name, v] of Object.entries(extras ?? {})) {
      this.extraNames.add(name);
      const a = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        if (typeof v === 'number') a[i] = v;
        else {
          p.fromBufferAttribute(geo.attributes.position as THREE.BufferAttribute, i);
          a[i] = v(p);
        }
      }
      geo.setAttribute(name, new THREE.BufferAttribute(a, 1));
    }
    this.parts.push(geo);
    g.dispose();
    return this;
  }

  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: RGB, rotY = 0, extras?: Record<string, number | ((p: THREE.Vector3) => number)>, rotX = 0, rotZ = 0) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ')), new THREE.Vector3(1, 1, 1));
    return this.add(new THREE.BoxGeometry(sx, sy, sz), color, m, extras);
  }

  cyl(x: number, y: number, z: number, rTop: number, rBot: number, h: number, seg: number, color: RGB, extras?: Record<string, number | ((p: THREE.Vector3) => number)>, rotX = 0, rotZ = 0, rotY = 0) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ')), new THREE.Vector3(1, 1, 1));
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, false), color, m, extras);
  }

  /** Irregular blob (leaf cluster / rock). */
  blob(x: number, y: number, z: number, r: number, color: RGB, rnd: () => number, detail = 1, squash = 1, extras?: Record<string, number | ((p: THREE.Vector3) => number)>, jitter = 0.25) {
    const g = new THREE.IcosahedronGeometry(r, detail);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const seen = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
      const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      let f = seen.get(k);
      if (f === undefined) seen.set(k, (f = 1 + (rnd() - 0.5) * 2 * jitter));
      pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * squash, pos.getZ(i) * f);
    }
    g.computeVertexNormals();
    return this.add(g, color, new THREE.Matrix4().makeTranslation(x, y, z), extras);
  }

  /** Curved tapered strip (palm frond / leaf / cable). Double-sided via two faces. */
  strip(points: THREE.Vector3[], widths: number[], side: THREE.Vector3, color: RGB, extras?: Record<string, number | ((p: THREE.Vector3) => number)>) {
    const pos: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const wa = side.clone().multiplyScalar(widths[i] / 2);
      const wb = side.clone().multiplyScalar(widths[i + 1] / 2);
      const q = [a.clone().sub(wa), a.clone().add(wa), b.clone().add(wb), b.clone().sub(wb)];
      pos.push(...q[0].toArray(), ...q[1].toArray(), ...q[2].toArray(), ...q[0].toArray(), ...q[2].toArray(), ...q[3].toArray());
      pos.push(...q[0].toArray(), ...q[2].toArray(), ...q[1].toArray(), ...q[0].toArray(), ...q[3].toArray(), ...q[2].toArray());
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return this.add(g, color, undefined, extras);
  }

  /** Alpha-tested foliage card: quad of given size, uv region [u0,v0,u1,v1], normals bent away from `centre`. */
  card(pos: THREE.Vector3, size: number, rot: THREE.Euler, region: [number, number, number, number], color: RGB, centre: THREE.Vector3, extras?: Record<string, number | ((p: THREE.Vector3) => number)>) {
    const g = new THREE.PlaneGeometry(size, size).toNonIndexed();
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, region[0] + uv.getX(i) * (region[2] - region[0]), region[1] + uv.getY(i) * (region[3] - region[1]));
    g.applyMatrix4(new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, 1, 1)));
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).sub(centre).normalize();
      n.setXYZ(i, v.x, v.y, v.z);
    }
    g.userData.textured = true;
    return this.add(g, color, undefined, extras);
  }

  /** Textured double-sided strip (palm frond): u across, v along. */
  texStrip(points: THREE.Vector3[], widths: number[], side: THREE.Vector3, region: [number, number, number, number], color: RGB, extras?: Record<string, number | ((p: THREE.Vector3) => number)>) {
    const pos: number[] = [];
    const uvs: number[] = [];
    const nrm: number[] = [];
    const n = points.length - 1;
    const up = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[i + 1];
      const wa = side.clone().multiplyScalar(widths[i] / 2);
      const wb = side.clone().multiplyScalar(widths[i + 1] / 2);
      const q = [a.clone().sub(wa), a.clone().add(wa), b.clone().add(wb), b.clone().sub(wb)];
      const v0 = region[1] + (i / n) * (region[3] - region[1]);
      const v1 = region[1] + ((i + 1) / n) * (region[3] - region[1]);
      const uvq = [[region[0], v0], [region[2], v0], [region[2], v1], [region[0], v1]];
      up.subVectors(b, a).cross(side).normalize();
      if (up.y < 0) up.negate();
      for (const k of [0, 1, 2, 0, 2, 3]) {
        pos.push(...q[k].toArray());
        uvs.push(...uvq[k]);
        nrm.push(up.x, up.y, up.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.userData.textured = true;
    return this.add(g, color, undefined, extras);
  }

  build(): THREE.BufferGeometry {
    for (const p of this.parts) for (const name of this.extraNames) if (!p.attributes[name]) p.setAttribute(name, new THREE.BufferAttribute(new Float32Array(p.attributes.position.count), 1));
    const g = mergeGeometries(this.parts, false)!;
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
