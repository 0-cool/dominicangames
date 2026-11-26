import * as THREE from 'three';
import type { PropType } from '@sd/shared';
import { Kit, type RGB, hex, mulberry } from './geomkit.ts';
import { FROND, LEAF, SOLID_UV } from './foliage.ts';

/** Procedural, original models for every instanced prop type. Units: metres; +Z = facing direction. */
const sway = (h: number, k = 1) => (p: THREE.Vector3) => Math.max(0, p.y / h) ** 2 * k;

function palm(seed: number, royal: boolean): THREE.BufferGeometry {
  const r = mulberry(seed);
  const k = new Kit(SOLID_UV);
  const H = royal ? 15 + r() * 4 : 9 + r() * 4;
  const lean = royal ? 0 : 0.25 + r() * 0.35;
  const trunkCol: RGB = royal ? [0.48, 0.47, 0.44] : [0.33, 0.27, 0.2];
  const segs = 7;
  let prev = new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < segs; i++) {
    const t1 = (i + 1) / segs;
    const next = new THREE.Vector3(Math.sin(t1 * 1.4) * lean * H * 0.25, t1 * H, 0);
    const mid = prev.clone().add(next).multiplyScalar(0.5);
    const len = prev.distanceTo(next);
    const tilt = Math.atan2(next.x - prev.x, next.y - prev.y);
    const rad = royal ? 0.3 * (1 + 0.25 * Math.sin(t1 * 3.1)) : 0.2 - t1 * 0.04;
    const c: RGB = royal && i === segs - 1 ? [0.25, 0.4, 0.15] : trunkCol;
    k.cyl(mid.x, mid.y, mid.z, rad * 0.95, rad, len, 7, c, { _sway: sway(H, 0.4) }, 0, -tilt);
    prev = next;
  }
  const top = prev;
  const fronds = royal ? 15 : 13;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + r() * 0.3;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const L = (royal ? 4.6 : 4.0) + r() * 1.2;
    const up = 0.35 + r() * 0.6;
    const pts: THREE.Vector3[] = [];
    const ws: number[] = [];
    for (let s2 = 0; s2 <= 6; s2++) {
      const t = s2 / 6;
      pts.push(top.clone().add(dir.clone().multiplyScalar(t * L)).add(new THREE.Vector3(0, up * t * 1.6 - t * t * (royal ? 3.4 : 2.9), 0)));
      ws.push(royal ? 2.0 : 2.3);
    }
    const side = new THREE.Vector3(-dir.z, 0.3, dir.x).normalize();
    const gtone = 0.75 + r() * 0.35;
    const dry = r() < 0.12;
    k.texStrip(pts, ws, side, FROND, dry ? [0.42, 0.36, 0.16] : [0.16 * gtone, 0.34 * gtone, 0.08 * gtone], { _sway: (p) => 0.6 + Math.min(1, p.distanceTo(top) / L) * 0.9 });
  }
  if (!royal) for (let c = 0; c < 4; c++) k.blob(top.x + Math.cos(c * 1.6) * 0.3, top.y - 0.4, top.z + Math.sin(c * 1.6) * 0.3, 0.16, [0.35, 0.3, 0.1], r, 0, 1, { _sway: 0.5 });
  return k.build();
}

function canopyTree(seed: number, kind: 'almond' | 'flamboyan' | 'ficus'): THREE.BufferGeometry {
  const r = mulberry(seed);
  const k = new Kit(SOLID_UV);
  const H = kind === 'ficus' ? 8 + r() * 3 : kind === 'flamboyan' ? 6 + r() * 2 : 7 + r() * 3;
  const trunkH = H * (kind === 'flamboyan' ? 0.45 : 0.4);
  const trunkR = kind === 'ficus' ? 0.45 : 0.26;
  const bark: RGB = kind === 'ficus' ? [0.33, 0.31, 0.28] : [0.3, 0.24, 0.19];
  k.cyl(0, trunkH / 2, 0, trunkR * 0.7, trunkR, trunkH, 8, bark, { _sway: 0 });
  for (let b = 0; b < 4; b++) {
    const a = r() * Math.PI * 2;
    k.cyl(Math.cos(a) * 0.9, trunkH + 0.7, Math.sin(a) * 0.9, 0.08, 0.15, 2.6, 6, bark, { _sway: 0.1 }, Math.sin(a) * 0.75, -Math.cos(a) * 0.75);
  }
  const spread = kind === 'flamboyan' ? 5.8 : kind === 'ficus' ? 4.8 : 4.3;
  const centre = new THREE.Vector3(0, trunkH + (H - trunkH) * 0.5, 0);
  const cards = kind === 'ficus' ? 34 : 28;
  for (let c = 0; c < cards; c++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * spread;
    const y = kind === 'flamboyan' ? trunkH + 1.2 + r() * 1.8 - (d / spread) * 0.6 : trunkH + 0.8 + r() * (H - trunkH - 1.2);
    let col: RGB;
    if (kind === 'flamboyan') col = r() < 0.62 ? [0.75 + r() * 0.2, 0.1 + r() * 0.1, 0.02] : [0.18, 0.36, 0.08];
    else if (kind === 'ficus') col = [0.07 + r() * 0.04, 0.2 + r() * 0.07, 0.05];
    else col = r() < 0.1 ? [0.62, 0.28, 0.06] : [0.13 + r() * 0.06, 0.32 + r() * 0.08, 0.08];
    const size = 2.4 + r() * 1.4;
    const pos = new THREE.Vector3(Math.cos(a) * d, y, Math.sin(a) * d);
    k.card(pos, size, new THREE.Euler((r() - 0.5) * 1.2 - (kind === 'flamboyan' ? 1.2 : 0), r() * Math.PI, (r() - 0.5) * 0.6), LEAF, col, centre, { _sway: sway(H, 0.5) });
  }
  return k.build();
}

function lampColonial(): THREE.BufferGeometry {
  const k = new Kit();
  const iron = hex(0x141414);
  k.box(0, 0, 0.25, 0.05, 0.05, 0.5, iron);
  k.box(0, -0.15, 0.48, 0.24, 0.05, 0.24, iron);
  k.box(0, -0.4, 0.48, 0.2, 0.42, 0.2, [1.0, 0.82, 0.45]);
  k.cyl(0, -0.08, 0.48, 0.02, 0.16, 0.14, 4, iron, undefined, 0, 0, Math.PI / 4);
  return k.build();
}

function lampMalecon(): THREE.BufferGeometry {
  const k = new Kit();
  const metal = hex(0x8a8f94);
  k.cyl(0, 4.5, 0, 0.09, 0.14, 9, 8, metal);
  k.cyl(0, 0.4, 0, 0.2, 0.24, 0.8, 8, metal);
  for (const s of [-1, 1]) {
    k.box(s * 0.9, 8.8, 0, 1.8, 0.07, 0.07, metal);
    k.box(s * 1.75, 8.68, 0, 0.5, 0.12, 0.24, hex(0x50555a));
    k.box(s * 1.75, 8.6, 0, 0.42, 0.04, 0.18, [1, 0.9, 0.7]);
  }
  return k.build();
}

function utilityPole(variant: number): THREE.BufferGeometry {
  const k = new Kit();
  const concrete = hex(0x8e8a82);
  k.cyl(0, 4.6, 0, 0.12, 0.2, 9.2, 6, concrete);
  k.box(0, 8.15, 0, 1.9, 0.12, 0.12, hex(0x6b6760));
  for (const x of [-0.8, -0.3, 0.3, 0.8]) k.cyl(x, 8.3, 0, 0.04, 0.05, 0.18, 5, hex(0xbfc9c4));
  if (variant >= 1) {
    k.box(0, 7.2, 0.9, 0.06, 0.06, 1.8, hex(0x777777));
    k.box(0, 7.12, 1.75, 0.28, 0.1, 0.5, hex(0x5a5a5a));
    k.box(0, 7.06, 1.75, 0.22, 0.03, 0.38, [1, 0.75, 0.4]);
  }
  if (variant === 2) {
    k.cyl(0.38, 6.6, 0, 0.32, 0.32, 1.1, 10, hex(0x6f7478));
    k.box(0.38, 7.2, 0, 0.5, 0.06, 0.5, hex(0x55595c));
  }
  // tangled service drops (very Dominican)
  k.box(0, 6.2, -0.13, 0.09, 1.3, 0.05, hex(0x111111));
  return k.build();
}

function signalPole(): THREE.BufferGeometry {
  const k = new Kit();
  const metal = hex(0x2c3033);
  k.cyl(0, 2.6, 0, 0.08, 0.1, 5.2, 8, metal);
  k.box(-1.8, 5.1, 0, 3.6, 0.1, 0.1, metal);
  k.box(-3.4, 4.6, 0.1, 0.36, 1.05, 0.3, hex(0x191a1b));
  k.box(0.18, 2.9, 0.1, 0.3, 0.85, 0.26, hex(0x191a1b));
  return k.build();
}

function stopSign(): THREE.BufferGeometry {
  const k = new Kit();
  k.cyl(0, 1.2, 0, 0.035, 0.035, 2.4, 6, hex(0x8a8a8a));
  k.cyl(0, 2.35, 0.04, 0.38, 0.38, 0.03, 8, [0.6, 0.02, 0.02], undefined, Math.PI / 2, 0, Math.PI / 8);
  k.cyl(0, 2.35, 0.06, 0.3, 0.3, 0.01, 8, [0.85, 0.85, 0.85], undefined, Math.PI / 2, 0, Math.PI / 8);
  k.cyl(0, 2.35, 0.07, 0.27, 0.27, 0.01, 8, [0.6, 0.02, 0.02], undefined, Math.PI / 2, 0, Math.PI / 8);
  return k.build();
}

function bench(variant: number): THREE.BufferGeometry {
  const k = new Kit();
  if (variant === 0) {
    const c = hex(0xc8c2b6);
    k.box(0, 0.42, 0, 1.9, 0.12, 0.5, c);
    k.box(-0.7, 0.2, 0, 0.18, 0.4, 0.45, c);
    k.box(0.7, 0.2, 0, 0.18, 0.4, 0.45, c);
  } else {
    const iron = hex(0x1d2a22);
    const wood = hex(0x6b4a2c);
    for (let i = 0; i < 4; i++) k.box(0, 0.45, -0.18 + i * 0.12, 1.7, 0.04, 0.09, wood);
    for (let i = 0; i < 3; i++) k.box(0, 0.62 + i * 0.12, 0.24, 1.7, 0.08, 0.03, wood, 0, undefined, -0.15);
    for (const x of [-0.75, 0.75]) k.box(x, 0.4, 0.02, 0.06, 0.8, 0.55, iron);
  }
  return k.build();
}

function trash(variant: number): THREE.BufferGeometry {
  const k = new Kit();
  if (variant === 0) {
    k.cyl(0, 0.45, 0, 0.29, 0.29, 0.9, 12, hex(0x1e5a96));
    k.cyl(0, 0.9, 0, 0.3, 0.3, 0.03, 12, hex(0x174a7a));
  } else {
    k.box(0, 0.55, 0, 1.2, 1.1, 0.9, hex(0x2e5d34));
    k.box(0, 1.15, -0.05, 1.25, 0.12, 0.95, hex(0x264d2b), 0, undefined, 0.1);
  }
  return k.build();
}

function tinaco(variant: number): THREE.BufferGeometry {
  const k = new Kit();
  const col: RGB = variant === 1 ? [0.1, 0.25, 0.55] : variant === 2 ? [0.7, 0.68, 0.62] : [0.03, 0.03, 0.03];
  k.cyl(0, 0.75, 0, 0.62, 0.6, 1.5, 14, col);
  k.cyl(0, 1.58, 0, 0.25, 0.6, 0.18, 14, col);
  k.cyl(0, 1.7, 0, 0.18, 0.2, 0.08, 10, col);
  k.box(0, 0.05, 0, 1.4, 0.1, 1.4, hex(0x8a8a85));
  return k.build();
}

function acUnit(): THREE.BufferGeometry {
  const k = new Kit();
  k.box(0, 0, 0.2, 0.8, 0.55, 0.32, hex(0xdedfd9));
  k.cyl(0.12, 0, 0.37, 0.18, 0.18, 0.02, 12, hex(0x555a5c), undefined, Math.PI / 2);
  k.box(0, -0.32, 0.2, 0.85, 0.04, 0.4, hex(0x6c6c6c));
  return k.build();
}

function balcony(variant: number): THREE.BufferGeometry {
  const k = new Kit();
  if (variant === 0) {
    // colonial: stone slab with black wrought-iron balusters
    k.box(0, 0, 0.45, 2.2, 0.14, 0.9, hex(0xb9b2a4));
    const iron = hex(0x161616);
    k.box(0, 1.0, 0.86, 2.2, 0.05, 0.05, iron);
    k.box(-1.08, 0.5, 0.45, 0.05, 1.0, 0.85, iron);
    k.box(1.08, 0.5, 0.45, 0.05, 1.0, 0.85, iron);
    for (let i = 0; i < 15; i++) k.box(-1.05 + i * 0.15, 0.55, 0.86, 0.025, 0.95, 0.025, iron);
    // bougainvillea in pots on some balconies
    k.blob(-0.8, 0.35, 0.65, 0.35, [0.75, 0.1, 0.45], mulberry(3), 1, 0.8);
    k.blob(-0.4, 0.5, 0.72, 0.25, [0.15, 0.35, 0.08], mulberry(5), 0, 1);
  } else {
    // concrete balcony with decorative security grille (rejas)
    k.box(0, 0, 0.5, 2.6, 0.16, 1.0, hex(0xd8d4ca));
    k.box(0, 0.45, 0.98, 2.6, 0.75, 0.06, hex(0xd8d4ca));
    const iron = hex(0x202020);
    for (let i = 0; i < 9; i++) k.box(-1.25 + i * 0.31, 1.6, 0.98, 0.03, 1.5, 0.03, iron);
    k.box(0, 2.35, 0.98, 2.6, 0.04, 0.04, iron);
  }
  return k.build();
}

function awning(variant: number): THREE.BufferGeometry {
  const k = new Kit();
  const cols: RGB[] = [hex(0xc0392b), hex(0x1f6f8b), hex(0x2e8b57), hex(0xd4a017)];
  k.box(0, 0, 0.55, 2.8, 0.05, 1.2, cols[variant % 4], 0, undefined, 0.38);
  k.box(0, -0.25, 1.1, 2.8, 0.35, 0.03, cols[variant % 4]);
  return k.build();
}

function chairSet(variant: number): THREE.BufferGeometry {
  const k = new Kit();
  const plastic: RGB = variant === 1 ? [0.55, 0.05, 0.05] : [0.85, 0.85, 0.82];
  k.box(0, 0.7, 0, 0.8, 0.04, 0.8, plastic);
  k.cyl(0, 0.35, 0, 0.05, 0.08, 0.7, 6, plastic);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    const x = Math.cos(a) * 0.85;
    const z = Math.sin(a) * 0.85;
    k.box(x, 0.42, z, 0.45, 0.04, 0.42, plastic, -a + Math.PI / 2);
    k.box(x + Math.cos(a) * 0.2, 0.68, z + Math.sin(a) * 0.2, 0.45, 0.5, 0.04, plastic, -a + Math.PI / 2, undefined, 0.12);
    for (const s of [-1, 1]) k.box(x + Math.cos(a + s * 1.2) * 0.2, 0.2, z + Math.sin(a + s * 1.2) * 0.2, 0.04, 0.42, 0.04, plastic);
  }
  if (variant === 2) for (let i = 0; i < 7; i++) k.box(-0.25 + (i % 4) * 0.12, 0.73, -0.1 + Math.floor(i / 4) * 0.2, 0.05, 0.015, 0.1, [0.95, 0.95, 0.92]);
  return k.build();
}

function cooler(): THREE.BufferGeometry {
  const k = new Kit();
  k.box(0, 0.42, 0, 1.1, 0.84, 0.6, hex(0xb3261e));
  k.box(0, 0.86, 0, 1.12, 0.06, 0.62, hex(0xe8e8e8));
  return k.build();
}

function cart(variant: number): THREE.BufferGeometry {
  const k = new Kit();
  const body: RGB = variant === 0 ? hex(0xe0c060) : variant === 1 ? hex(0x2f7fb6) : hex(0xcf4b3b);
  k.box(0, 0.75, 0, 1.6, 0.6, 0.8, body);
  for (const x of [-0.6, 0.6]) k.cyl(x, 0.28, 0.42, 0.28, 0.28, 0.06, 12, hex(0x222222), undefined, Math.PI / 2);
  k.cyl(0, 1.7, 0, 0.025, 0.025, 1.9, 5, hex(0x777777));
  k.cyl(0, 2.65, 0, 0.02, 1.2, 0.35, 10, variant === 1 ? hex(0xf2f2f2) : hex(0x2e86c1));
  k.blob(-0.4, 1.15, 0, 0.18, [0.9, 0.55, 0.1], mulberry(variant + 9), 0);
  k.blob(0.1, 1.15, 0.1, 0.18, [0.3, 0.55, 0.1], mulberry(variant + 19), 0);
  return k.build();
}

function rock(variant: number): THREE.BufferGeometry {
  const k = new Kit();
  const r = mulberry(variant * 31 + 7);
  k.blob(0, 0.3, 0, 0.9 + r() * 0.6, [0.17, 0.16, 0.14], r, 1, 0.6, undefined, 0.35);
  return k.build();
}

function dish(): THREE.BufferGeometry {
  const k = new Kit();
  k.cyl(0, 0.5, 0, 0.03, 0.03, 1.0, 5, hex(0x9a9a9a));
  k.cyl(0, 1.05, 0.08, 0.45, 0.1, 0.12, 14, hex(0xdddddd), undefined, Math.PI / 2.6);
  return k.build();
}

function rebar(): THREE.BufferGeometry {
  const k = new Kit();
  for (let i = 0; i < 4; i++) k.box((i % 2) * 0.18 - 0.09, 0.6, Math.floor(i / 2) * 0.18 - 0.09, 0.02, 1.2, 0.02, [0.35, 0.16, 0.07]);
  return k.build();
}

function planter(): THREE.BufferGeometry {
  const k = new Kit();
  k.box(0, 0.35, 0, 1.4, 0.7, 1.4, hex(0xb8ab95));
  const r = mulberry(17);
  for (let i = 0; i < 3; i++) k.blob((r() - 0.5) * 0.7, 0.9 + r() * 0.3, (r() - 0.5) * 0.7, 0.4, [0.12, 0.32, 0.08], r, 1, 1, { _sway: 0.3 });
  return k.build();
}

function bollard(): THREE.BufferGeometry {
  const k = new Kit();
  k.cyl(0, 0.45, 0, 0.12, 0.14, 0.9, 8, hex(0x9a9690));
  return k.build();
}

export type GeoFactory = (variant: number) => THREE.BufferGeometry;

export const PROP_FACTORIES: Partial<Record<PropType, { make: GeoFactory; variants: number; sway?: boolean; shadow?: boolean; maxDist: number; collider?: { r: number; h: number } | { hx: number; hy: number; hz: number } }>> = {
  tree_palm: { make: (v) => palm(101 + v, false), variants: 4, sway: true, shadow: true, maxDist: 2000, collider: { r: 0.25, h: 4 } },
  tree_royal: { make: (v) => palm(201 + v, true), variants: 4, sway: true, shadow: true, maxDist: 2000, collider: { r: 0.32, h: 4 } },
  tree_almond: { make: (v) => canopyTree(301 + v, 'almond'), variants: 4, sway: true, shadow: true, maxDist: 2000, collider: { r: 0.3, h: 3 } },
  tree_flamboyan: { make: (v) => canopyTree(401 + v, 'flamboyan'), variants: 4, sway: true, shadow: true, maxDist: 2000, collider: { r: 0.3, h: 3 } },
  tree_ficus: { make: (v) => canopyTree(501 + v, 'ficus'), variants: 4, sway: true, shadow: true, maxDist: 2000, collider: { r: 0.5, h: 3 } },
  lamp_colonial: { make: () => lampColonial(), variants: 1, maxDist: 220 },
  lamp_malecon: { make: () => lampMalecon(), variants: 1, shadow: true, maxDist: 900, collider: { r: 0.18, h: 4 } },
  pole: { make: (v) => utilityPole(v), variants: 3, shadow: true, maxDist: 700, collider: { r: 0.2, h: 4 } },
  stop_sign: { make: () => stopSign(), variants: 1, maxDist: 200, collider: { r: 0.05, h: 1.2 } },
  bench: { make: (v) => bench(v), variants: 2, maxDist: 180, collider: { hx: 0.9, hy: 0.4, hz: 0.3 } },
  trash: { make: (v) => trash(v), variants: 2, maxDist: 200, collider: { hx: 0.4, hy: 0.5, hz: 0.4 } },
  tinaco: { make: (v) => tinaco(v), variants: 3, shadow: true, maxDist: 700 },
  ac_unit: { make: () => acUnit(), variants: 1, maxDist: 250 },
  balcony: { make: (v) => balcony(v), variants: 2, shadow: true, maxDist: 450 },
  awning: { make: (v) => awning(v), variants: 4, maxDist: 300 },
  chair_set: { make: (v) => chairSet(v), variants: 3, maxDist: 180 },
  cooler: { make: () => cooler(), variants: 1, maxDist: 150 },
  cart: { make: (v) => cart(v), variants: 3, maxDist: 220, collider: { hx: 0.8, hy: 0.6, hz: 0.45 } },
  rock: { make: (v) => rock(v), variants: 4, maxDist: 900 },
  dish: { make: () => dish(), variants: 1, maxDist: 300 },
  rebar: { make: () => rebar(), variants: 1, maxDist: 200 },
  planter: { make: () => planter(), variants: 1, maxDist: 250, collider: { hx: 0.7, hy: 0.5, hz: 0.7 } },
  bollard: { make: () => bollard(), variants: 1, maxDist: 150, collider: { r: 0.14, h: 0.45 } },
  signal: { make: () => signalPole(), variants: 1, shadow: true, maxDist: 500, collider: { r: 0.1, h: 2.6 } },
};
