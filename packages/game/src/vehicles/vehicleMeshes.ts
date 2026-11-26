import * as THREE from 'three';
import { Kit, type RGB, hex } from '../world/geomkit.ts';
import { G } from '../render/materials.ts';

/**
 * Original procedural vehicle models typical of Santo Domingo traffic:
 * compact/sedan (incl. "carro público"), yipetas (SUVs), pickups, guaguas
 * (minibuses) and motores (150 cc motorcycles). No manufacturer branding.
 * Material channel attribute `_mat`: 0 generic, 1 paint, 2 glass, 3 chrome,
 * 4 headlight, 5 taillight, 6 tyre.
 */
export type VehicleModel = 'compact' | 'sedan' | 'concho' | 'suv' | 'bigsuv' | 'pickup' | 'guagua' | 'moto' | 'motoconcho' | 'delivery';

export interface VehicleSpec {
  label: string;
  L: number;
  W: number;
  H: number;
  wheelR: number;
  wheelW: number;
  wheelbase: number;
  track: number;
  frontOverhang: number;
  twoWheels: boolean;
  body: [number, number][];
  cabin: [number, number][];
  cabinInset: number;
}

export const SPECS: Record<VehicleModel, VehicleSpec> = {
  compact: { label: 'Compacto Brisa', L: 4.05, W: 1.72, H: 1.48, wheelR: 0.3, wheelW: 0.19, wheelbase: 2.5, track: 1.48, frontOverhang: 0.8, twoWheels: false,
    body: [[-2.02, 0.32], [-2.04, 0.92], [-1.85, 1.0], [0.95, 0.92], [1.85, 0.78], [2.02, 0.62], [2.02, 0.34], [1.9, 0.25], [-1.9, 0.25]], cabin: [[-1.9, 0.98], [-1.55, 1.46], [0.25, 1.48], [1.0, 0.92]], cabinInset: 0.1 },
  sedan: { label: 'Sedán Malecón', L: 4.65, W: 1.8, H: 1.45, wheelR: 0.32, wheelW: 0.21, wheelbase: 2.72, track: 1.56, frontOverhang: 0.95, twoWheels: false,
    body: [[-2.32, 0.34], [-2.33, 0.86], [-1.55, 0.98], [-1.1, 0.99], [1.25, 0.9], [2.18, 0.74], [2.33, 0.6], [2.33, 0.34], [2.2, 0.26], [-2.2, 0.26]], cabin: [[-1.6, 0.97], [-0.85, 1.43], [0.45, 1.45], [1.3, 0.9]], cabinInset: 0.12 },
  concho: { label: 'Carro Público', L: 4.5, W: 1.7, H: 1.42, wheelR: 0.3, wheelW: 0.19, wheelbase: 2.6, track: 1.46, frontOverhang: 0.9, twoWheels: false,
    body: [[-2.25, 0.34], [-2.26, 0.88], [-1.5, 0.97], [1.2, 0.9], [2.15, 0.76], [2.26, 0.6], [2.26, 0.34], [2.1, 0.26], [-2.1, 0.26]], cabin: [[-1.55, 0.96], [-0.9, 1.4], [0.4, 1.42], [1.25, 0.9]], cabinInset: 0.11 },
  suv: { label: 'Yipeta Cibao', L: 4.5, W: 1.86, H: 1.68, wheelR: 0.36, wheelW: 0.23, wheelbase: 2.68, track: 1.6, frontOverhang: 0.92, twoWheels: false,
    body: [[-2.25, 0.42], [-2.27, 1.08], [-2.1, 1.12], [1.1, 1.08], [2.1, 0.92], [2.25, 0.75], [2.25, 0.42], [2.05, 0.32], [-2.05, 0.32]], cabin: [[-2.15, 1.1], [-2.0, 1.66], [0.55, 1.68], [1.25, 1.07]], cabinInset: 0.1 },
  bigsuv: { label: 'Yipetón Cordillera', L: 5.2, W: 2.0, H: 1.9, wheelR: 0.4, wheelW: 0.26, wheelbase: 2.95, track: 1.72, frontOverhang: 1.0, twoWheels: false,
    body: [[-2.6, 0.48], [-2.61, 1.2], [1.3, 1.2], [2.45, 1.08], [2.6, 0.86], [2.6, 0.48], [2.4, 0.36], [-2.4, 0.36]], cabin: [[-2.5, 1.18], [-2.42, 1.88], [0.8, 1.9], [1.45, 1.18]], cabinInset: 0.08 },
  pickup: { label: 'Camioneta Ozama', L: 5.3, W: 1.85, H: 1.8, wheelR: 0.38, wheelW: 0.24, wheelbase: 3.1, track: 1.55, frontOverhang: 0.95, twoWheels: false,
    body: [[-2.65, 0.5], [-2.66, 1.05], [-0.45, 1.05], [-0.45, 1.1], [1.35, 1.1], [2.5, 0.98], [2.65, 0.8], [2.65, 0.48], [2.45, 0.36], [-2.45, 0.36]], cabin: [[-0.45, 1.1], [-0.35, 1.78], [0.75, 1.8], [1.45, 1.1]], cabinInset: 0.09 },
  guagua: { label: 'Guagua Ruta 27', L: 7.0, W: 2.1, H: 2.65, wheelR: 0.42, wheelW: 0.26, wheelbase: 3.9, track: 1.75, frontOverhang: 1.1, twoWheels: false,
    body: [[-3.5, 0.5], [-3.5, 1.35], [3.3, 1.35], [3.5, 1.1], [3.5, 0.5], [3.3, 0.38], [-3.3, 0.38]], cabin: [[-3.48, 1.33], [-3.48, 2.6], [3.0, 2.62], [3.48, 1.4]], cabinInset: 0.02 },
  moto: { label: 'Motor Faro 150', L: 2.0, W: 0.75, H: 1.1, wheelR: 0.31, wheelW: 0.09, wheelbase: 1.3, track: 0, frontOverhang: 0.35, twoWheels: true, body: [], cabin: [], cabinInset: 0 },
  motoconcho: { label: 'Motoconcho', L: 2.0, W: 0.75, H: 1.1, wheelR: 0.31, wheelW: 0.09, wheelbase: 1.3, track: 0, frontOverhang: 0.35, twoWheels: true, body: [], cabin: [], cabinInset: 0 },
  delivery: { label: 'Motor Delivery', L: 2.05, W: 0.75, H: 1.25, wheelR: 0.3, wheelW: 0.09, wheelbase: 1.3, track: 0, frontOverhang: 0.35, twoWheels: true, body: [], cabin: [], cabinInset: 0 },
};

/** Typical Santo Domingo car colours (white and silver dominate the tropics). */
export const PAINTS: RGB[] = [hex(0xf2f2f0), hex(0xe9e9e6), hex(0xb8bcc0), hex(0x8d9196), hex(0x1c1d20), hex(0x7a0f12), hex(0x123a6b), hex(0x2f6f4e), hex(0xc8b27a), hex(0x5a5f63), hex(0xd9d4c9), hex(0x9e1b1b)];

function extrude(pts: [number, number][], width: number, color: RGB, mat: number, k: Kit, bevel = 0.06) {
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, width - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 4 });
  // shape x → world z (forward), extrusion → world x
  const m = new THREE.Matrix4().makeRotationY(-Math.PI / 2);
  m.premultiply(new THREE.Matrix4().makeTranslation(width / 2 - bevel, 0, 0));
  k.add(g, color, m, { _mat: mat });
}

function wheelInto(k: Kit, x: number, y: number, z: number, r: number, w: number, wheelExtras?: (cx: number, cy: number, cz: number) => Record<string, number>) {
  const ex = wheelExtras?.(x, y, z) ?? {};
  k.cyl(x, y, z, r, r, w, 16, hex(0x101010), { _mat: 6, ...ex }, 0, Math.PI / 2);
  k.cyl(x + Math.sign(x || 1) * 0.01, y, z, r * 0.62, r * 0.62, w + 0.02, 10, hex(0x9da3a8), { _mat: 3, ...ex }, 0, Math.PI / 2);
  k.cyl(x + Math.sign(x || 1) * 0.02, y, z, r * 0.18, r * 0.18, w + 0.04, 6, hex(0x3a3d40), { _mat: 3, ...ex }, 0, Math.PI / 2);
}

function carBody(model: VehicleModel, k: Kit) {
  const s = SPECS[model];
  extrude(s.body, s.W, [1, 1, 1], 1, k, 0.07);
  extrude(s.cabin, s.W - s.cabinInset * 2, hex(0x141a1f), 2, k, 0.05);
  const top = Math.max(...s.cabin.map((p) => p[1]));
  const zs = s.cabin.map((p) => p[0]);
  const z0 = Math.min(...zs);
  const z1 = Math.max(...zs);
  // painted roof and pillars over the glass greenhouse
  k.box(0, top - 0.02, (s.cabin[1][0] + s.cabin[2][0]) / 2, s.W - s.cabinInset * 2 - 0.04, 0.05, Math.abs(s.cabin[2][0] - s.cabin[1][0]) - 0.1, [1, 1, 1], 0, { _mat: 1 });
  const bottom = s.body[0][1];
  for (const side of [-1, 1]) {
    const x = side * (s.W / 2 - s.cabinInset - 0.005);
    const pillarZ = model === 'guagua' ? [z0 + 0.05, -1.6, 0.2, 1.9, z1 - 0.3] : [(z0 + z1) / 2 - 0.1];
    for (const pz of pillarZ) k.box(x, (top + bottom + 0.6) / 2 + 0.25, pz, 0.03, top - 1.0 * (model === 'guagua' ? 0.75 : 0.95), 0.12, [1, 1, 1], 0, { _mat: 1 });
    // mirrors, door lines
    k.box(side * (s.W / 2 + 0.08), s.body[2][1] + 0.12, s.cabin[3][0] - 0.25, 0.14, 0.1, 0.16, [1, 1, 1], 0, { _mat: 1 });
  }
  const nose = Math.max(...s.body.map((p) => p[0]));
  const tail = Math.min(...s.body.map((p) => p[0]));
  const lightY = s.body[s.body.length - 4]?.[1] ?? 0.6;
  for (const side of [-1, 1]) {
    k.box(side * (s.W / 2 - 0.25), Math.min(lightY, 0.75), nose - 0.02, 0.32, 0.12, 0.06, hex(0xfff6dd), 0, { _mat: 4 });
    k.box(side * (s.W / 2 - 0.2), Math.min(0.95, s.body[1][1] - 0.12), tail + 0.02, 0.3, 0.14, 0.06, hex(0x8a0d0d), 0, { _mat: 5 });
  }
  k.box(0, 0.42, nose + 0.02, s.W - 0.1, 0.18, 0.12, hex(0x2a2c2e), 0, { _mat: 0 });
  k.box(0, 0.42, tail - 0.02, s.W - 0.1, 0.18, 0.12, hex(0x2a2c2e), 0, { _mat: 0 });
  k.box(0, 0.55, nose + 0.035, 0.6, 0.18, 0.04, hex(0x0d0d0d), 0, { _mat: 0 });
  if (model === 'concho') {
    // route stripe and windscreen route card typical of carros públicos
    for (const side of [-1, 1]) k.box(side * (s.W / 2 + 0.002), 0.72, 0, 0.01, 0.1, s.L - 0.6, hex(0xf2c200), 0, { _mat: 0 });
    k.box(0.45, 1.05, s.cabin[3][0] - 0.12, 0.35, 0.12, 0.02, hex(0xf8f8f8), 0, { _mat: 0 });
  }
  if (model === 'guagua') {
    for (const side of [-1, 1]) {
      k.box(side * (s.W / 2 + 0.003), 0.95, -0.2, 0.01, 0.16, s.L - 1, hex(0xd62828), 0, { _mat: 0 });
      k.box(side * (s.W / 2 + 0.003), 1.15, -0.2, 0.01, 0.1, s.L - 1, hex(0xf2c200), 0, { _mat: 0 });
    }
    k.box(0, 2.72, -0.3, s.W - 0.4, 0.12, s.L - 2.2, hex(0x333333), 0, { _mat: 0 });
  }
  if (model === 'pickup') {
    k.box(0, 0.98, -1.6, s.W - 0.12, 0.08, 1.95, hex(0x1d1d1d), 0, { _mat: 0 });
  }
}

function motoBody(model: VehicleModel, k: Kit) {
  const s = SPECS[model];
  const frame = hex(0x202224);
  const zF = s.wheelbase / 2;
  const zR = -s.wheelbase / 2;
  const R = s.wheelR;
  k.box(0, 0.62, -0.05, 0.12, 0.08, 1.05, frame, 0, { _mat: 0 }, -0.18);
  k.box(0, 0.86, 0.22, 0.3, 0.2, 0.48, [1, 1, 1], 0, { _mat: 1 }); // tank
  k.box(0, 0.86, -0.36, 0.28, 0.1, 0.62, hex(0x111111), 0, { _mat: 0 }); // seat
  k.box(0, 0.48, 0.05, 0.26, 0.28, 0.36, hex(0x5b5f62), 0, { _mat: 3 }); // engine
  k.cyl(0.15, 0.42, -0.45, 0.05, 0.05, 0.75, 8, hex(0xb0b5b8), { _mat: 3 }, Math.PI / 2 - 0.15); // exhaust
  k.box(0, 0.72, zF - 0.18, 0.06, 0.7, 0.06, hex(0x9da3a8), 0, { _mat: 3 }, 0.38); // fork
  k.box(0, 1.08, zF - 0.32, 0.72, 0.04, 0.04, hex(0x1a1a1a), 0, { _mat: 0 }); // handlebar
  k.box(0, 0.98, zF - 0.12, 0.2, 0.18, 0.14, [1, 1, 1], 0, { _mat: 1 });
  k.box(0, 0.98, zF - 0.04, 0.14, 0.12, 0.04, hex(0xfff6dd), 0, { _mat: 4 });
  k.box(0, 0.78, zR - 0.08, 0.12, 0.06, 0.04, hex(0x8a0d0d), 0, { _mat: 5 });
  k.box(0, 0.74, zR + 0.08, 0.16, 0.06, 0.4, [1, 1, 1], 0, { _mat: 1 }); // rear fender
  k.box(0, 0.62, zF + 0.02, 0.14, 0.05, 0.4, [1, 1, 1], 0, { _mat: 1 }, 0.2); // front fender
  if (model === 'delivery') k.box(0, 1.15, zR + 0.05, 0.48, 0.44, 0.48, hex(0xd62828), 0, { _mat: 0 });
  if (model === 'motoconcho') k.box(0, 0.9, -0.75, 0.3, 0.05, 0.25, hex(0x222222), 0, { _mat: 0 });
  void R;
}

/** Body without wheels (player vehicles animate wheels separately). */
export function buildBody(model: VehicleModel): THREE.BufferGeometry {
  const k = new Kit();
  if (SPECS[model].twoWheels) motoBody(model, k);
  else carBody(model, k);
  return k.build();
}

export function wheelPositions(model: VehicleModel): THREE.Vector3[] {
  const s = SPECS[model];
  const zf = s.wheelbase / 2;
  const y = s.wheelR;
  if (s.twoWheels) return [new THREE.Vector3(0, y, zf), new THREE.Vector3(0, y, -zf)];
  const x = s.track / 2;
  return [new THREE.Vector3(-x, y, zf), new THREE.Vector3(x, y, zf), new THREE.Vector3(-x, y, -zf), new THREE.Vector3(x, y, -zf)];
}

export function buildWheel(model: VehicleModel): THREE.BufferGeometry {
  const s = SPECS[model];
  const k = new Kit();
  wheelInto(k, 0, 0, 0, s.wheelR, s.wheelW);
  return k.build();
}

/** Body + wheels merged for instanced traffic; wheels roll in the vertex shader. */
export function buildInstanced(model: VehicleModel): THREE.BufferGeometry {
  const k = new Kit();
  if (SPECS[model].twoWheels) motoBody(model, k);
  else carBody(model, k);
  const s = SPECS[model];
  for (const w of wheelPositions(model)) wheelInto(k, w.x, w.y, w.z, s.wheelR, s.wheelW, (cx, cy, cz) => ({ _wx: cx, _wy: cy, _wz: cz, _isw: 1 }));
  return k.build();
}

/**
 * Vehicle material: per-channel PBR (paint/glass/chrome/lights/tyres), instance
 * paint colour, wheel roll and light states for instanced traffic.
 */
export function vehicleMaterial(instanced: boolean): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
  const uniforms = { uPaint: { value: new THREE.Color(0xb3261e) }, uLights: { value: 0 }, uBrake: { value: 0 } };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uNight: G.uNight, uWetness: G.uWetness });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float _mat; varying float vMat; varying vec3 vPaint; varying float vBrake; varying float vLightsOn;
        ${instanced ? 'attribute float _wx; attribute float _wy; attribute float _wz; attribute float _isw; attribute vec4 aState;' : ''}
        uniform vec3 uPaint; uniform float uLights; uniform float uBrake;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vMat = _mat;
        ${
          instanced
            ? `vPaint = instanceColor; vBrake = aState.y; vLightsOn = aState.z;
               if (_isw > 0.5) {
                 float a = -aState.x / max(0.2, _wy);
                 vec3 c = vec3(_wx, _wy, _wz); vec3 p = transformed - c;
                 transformed = c + vec3(p.x, p.y * cos(a) - p.z * sin(a), p.y * sin(a) + p.z * cos(a));
               }`
            : 'vPaint = uPaint; vBrake = uBrake; vLightsOn = uLights;'
        }`,
      )
      .replace('#include <color_vertex>', instanced ? '#ifdef USE_COLOR\n vColor = vec4(color, 1.0);\n#endif' : '#include <color_vertex>');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vMat; varying vec3 vPaint; varying float vBrake; varying float vLightsOn; uniform float uNight; uniform float uWetness; float vRough; float vMetal; vec3 vEmis;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float m = floor(vMat + 0.5);
        vRough = 0.65; vMetal = 0.0; vEmis = vec3(0.0);
        if (m == 1.0) { diffuseColor.rgb = vPaint; vRough = 0.28; vMetal = 0.35; }
        else if (m == 2.0) { vRough = 0.05; vMetal = 0.1; }
        else if (m == 3.0) { vRough = 0.25; vMetal = 0.9; }
        else if (m == 4.0) { vRough = 0.1; vEmis = vec3(1.0, 0.95, 0.85) * 3.0 * max(vLightsOn, uNight); }
        else if (m == 5.0) { vRough = 0.2; vEmis = vec3(1.0, 0.05, 0.03) * (0.6 * max(vLightsOn, uNight) + 2.5 * vBrake); }
        else if (m == 6.0) { vRough = 0.92; }`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(vRough, vRough * 0.5, uWetness * 0.6);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vMetal;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += vEmis;');
  };
  mat.customProgramCacheKey = () => `vehicle-${instanced}`;
  return mat;
}
