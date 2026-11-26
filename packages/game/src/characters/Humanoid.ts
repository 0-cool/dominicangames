import * as THREE from 'three';
import { Kit, type RGB } from '../world/geomkit.ts';
import { G } from '../render/materials.ts';

/**
 * Original procedural people rendered with GPU instancing. Each vertex is
 * rigidly bound to one bone; poses are computed in the vertex shader from
 * per-instance animation parameters, so hundreds of pedestrians cost a single
 * draw call (plus one for shadows).
 */
export const ANIM = { IDLE: 0, WALK: 1, RUN: 2, TALK: 3, PHONE: 4, SIT: 5, DOMINO: 6, LIE: 7, DRIVE: 8, RIDE: 9, JUMP: 10, DANCE: 11, WAVE: 12, CROUCH: 13 } as const;

// part channel: 0 skin, 1 shirt, 2 pants, 3 hair, 4 shoes, 5 long hair (optional), 6 shin (pants or skin)
function buildBody(): THREE.BufferGeometry {
  const k = new Kit();
  const W: RGB = [1, 1, 1];
  const bp = (bone: number, part: number) => ({ _bone: bone, _part: part });
  // pelvis
  k.box(0, 0.9, 0, 0.32, 0.2, 0.2, W, 0, bp(0, 2));
  // torso (two boxes for a tapered silhouette)
  k.box(0, 1.1, 0, 0.32, 0.22, 0.2, W, 0, bp(1, 1));
  k.box(0, 1.32, 0, 0.38, 0.24, 0.22, W, 0, bp(1, 1));
  k.cyl(0, 1.48, 0, 0.05, 0.055, 0.1, 6, W, bp(1, 0));
  // head + hair
  k.add(new THREE.SphereGeometry(0.105, 10, 8), W, new THREE.Matrix4().compose(new THREE.Vector3(0, 1.62, 0.005), new THREE.Quaternion(), new THREE.Vector3(0.92, 1.08, 1)), bp(2, 0));
  k.add(new THREE.SphereGeometry(0.11, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), W, new THREE.Matrix4().compose(new THREE.Vector3(0, 1.64, -0.004), new THREE.Quaternion(), new THREE.Vector3(0.96, 1.05, 1.02)), bp(2, 3));
  k.box(0, 1.5, -0.08, 0.2, 0.3, 0.06, W, 0, bp(2, 5));
  k.box(0, 1.62, 0.1, 0.03, 0.03, 0.03, [0.9, 0.9, 0.9], 0, bp(2, 0)); // nose hint
  for (const s of [1, -1]) {
    const up = s > 0 ? 3 : 5;
    const lo = s > 0 ? 4 : 6;
    const th = s > 0 ? 7 : 9;
    const sh = s > 0 ? 8 : 10;
    k.cyl(s * 0.225, 1.3, 0, 0.055, 0.05, 0.26, 6, W, bp(up, 1));
    k.cyl(s * 0.225, 1.04, 0, 0.045, 0.04, 0.26, 6, W, bp(lo, 0));
    k.box(s * 0.225, 0.87, 0.01, 0.06, 0.1, 0.035, W, 0, bp(lo, 0));
    k.cyl(s * 0.095, 0.7, 0, 0.08, 0.065, 0.42, 7, W, bp(th, 2));
    k.cyl(s * 0.095, 0.28, 0, 0.058, 0.048, 0.44, 7, W, bp(sh, 6));
    k.box(s * 0.095, 0.04, 0.05, 0.1, 0.08, 0.26, W, 0, bp(sh, 4));
  }
  return k.build();
}

const HUMAN_VERT_PARS = /* glsl */ `
attribute float _bone; attribute float _part;
attribute vec4 aAnim; attribute vec4 aShape;
uniform float uTime;
vec3 hRX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
vec3 hRY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }
vec3 hRZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z); }
vec3 hJ(vec3 p, vec3 piv, vec3 e) { vec3 q = p - piv; q = hRZ(q, e.z); q = hRX(q, e.x); q = hRY(q, e.y); return piv + q; }
vec3 hJn(vec3 n, vec3 e) { n = hRZ(n, e.z); n = hRX(n, e.x); n = hRY(n, e.y); return n; }
void humanPose(inout vec3 p, inout vec3 n) {
  float type = floor(aAnim.x + 0.5); float ph = aAnim.y; float amt = aAnim.z;
  float b = floor(_bone + 0.5);
  vec3 ePel = vec3(0.0), eSp = vec3(0.0), eHd = vec3(0.0), eUL = vec3(0.0, 0.0, 0.07), eLL = vec3(-0.15, 0.0, 0.0), eUR = vec3(0.0, 0.0, -0.07), eLR = vec3(-0.15, 0.0, 0.0);
  vec3 eTL = vec3(0.0), eSL = vec3(0.0), eTR = vec3(0.0), eSR = vec3(0.0);
  vec3 off = vec3(0.0);
  float breathe = sin(uTime * 1.3 + aShape.z * 20.0) * 0.02;
  eSp.x = breathe;
  if (type == 1.0 || type == 2.0) {
    float run = type == 2.0 ? 1.0 : 0.0;
    float A = mix(0.45, 0.85, run) * amt; float s = sin(ph); float c = cos(ph);
    eTL.x = -s * A; eTR.x = s * A;
    eSL.x = max(0.0, sin(ph + 1.2)) * mix(0.7, 1.4, run) * amt; eSR.x = max(0.0, sin(ph + 1.2 + 3.14159)) * mix(0.7, 1.4, run) * amt;
    eUL.x = s * mix(0.4, 0.8, run) * amt; eUR.x = -s * mix(0.4, 0.8, run) * amt;
    eLL.x = -mix(0.25, 1.3, run); eLR.x = -mix(0.25, 1.3, run);
    eSp.x = mix(0.04, 0.2, run); eSp.y = s * 0.08;
    off.y = abs(c) * mix(0.025, 0.06, run) * amt;
  } else if (type == 3.0 || type == 12.0) {
    float g = sin(uTime * 2.3 + ph) * 0.5 + 0.5;
    eUR.x = -0.4 - g * 0.5; eLR.x = -1.0 - g * 0.5; eHd.y = sin(uTime * 0.7 + ph) * 0.3;
    if (type == 12.0) { eUR = vec3(-0.2, 0.0, -2.4 - sin(uTime * 6.0) * 0.25); eLR.x = -0.3; }
  } else if (type == 4.0) {
    eUR = vec3(-0.35, 0.0, -0.35); eLR.x = -2.4; eHd.z = -0.12;
  } else if (type == 5.0 || type == 6.0 || type == 8.0) {
    eTL.x = -1.5; eTR.x = -1.5; eSL.x = 1.45; eSR.x = 1.45; off.y = -0.47; off.z = -0.05;
    if (type == 6.0) { eUL.x = -0.75; eLL.x = -0.6 - sin(uTime * 1.7 + ph) * 0.25; eUR.x = -0.7; eLR.x = -0.7; eSp.x = 0.18; }
    if (type == 8.0) { eUL.x = -1.0; eLL.x = -0.5; eUR.x = -1.0; eLR.x = -0.5; eUL.z = -0.15; eUR.z = 0.15; }
  } else if (type == 9.0) {
    eTL = vec3(-1.25, 0.0, 0.35); eTR = vec3(-1.25, 0.0, -0.35); eSL.x = 1.25; eSR.x = 1.25; off.y = -0.28; off.z = -0.08;
    eUL = vec3(-1.05, 0.0, 0.15); eUR = vec3(-1.05, 0.0, -0.15); eLL.x = -0.45; eLR.x = -0.45; eSp.x = 0.28;
  } else if (type == 7.0) {
    eUL.z = 0.6; eUR.z = -0.6; eTL.z = 0.12; eTR.z = -0.12;
  } else if (type == 10.0) {
    eTL.x = -0.6; eTR.x = -0.2; eSL.x = 0.9; eSR.x = 0.5; eUL = vec3(-0.6, 0.0, 0.5); eUR = vec3(-0.6, 0.0, -0.5);
  } else if (type == 11.0) {
    float d = uTime * 7.0 + ph;
    ePel.z = sin(d) * 0.12; eSp.z = -sin(d) * 0.1; eTL.x = -abs(sin(d)) * 0.35; eTR.x = -abs(cos(d)) * 0.35;
    eSL.x = abs(sin(d)) * 0.5; eSR.x = abs(cos(d)) * 0.5; eUL = vec3(-0.6, 0.0, 0.3); eUR = vec3(-0.6, 0.0, -0.3); eLL.x = -1.4; eLR.x = -1.4;
    off.y = -abs(sin(d)) * 0.04;
  } else if (type == 13.0) {
    eTL.x = -1.2; eTR.x = -1.2; eSL.x = 1.6; eSR.x = 1.6; off.y = -0.38; eSp.x = 0.35;
  }
  vec3 pPel = vec3(0.0, 0.95, 0.0), pSp = vec3(0.0, 1.02, 0.0), pHd = vec3(0.0, 1.5, 0.0);
  vec3 pUL = vec3(0.225, 1.43, 0.0), pLL = vec3(0.225, 1.17, 0.0), pUR = vec3(-0.225, 1.43, 0.0), pLR = vec3(-0.225, 1.17, 0.0);
  vec3 pTL = vec3(0.095, 0.91, 0.0), pSL = vec3(0.095, 0.5, 0.0), pTR = vec3(-0.095, 0.91, 0.0), pSR = vec3(-0.095, 0.5, 0.0);
  // body shape variation (girth, gender) before posing
  float girth = aShape.y; float fem = aShape.z;
  if (b <= 1.0) { p.x *= girth * mix(1.0, p.y < 1.0 ? 1.12 : 0.92, fem); p.z *= girth; }
  if (b == 7.0 || b == 9.0) { p.x = mix(p.x, p.x * 1.08, fem); p.x *= mix(1.0, girth, 0.5); p.z *= mix(1.0, girth, 0.5); }
  if (_part > 4.5 && _part < 5.5 && aShape.w < 0.5) p = pHd + (p - pHd) * 0.0;
  if (b == 4.0 || b == 3.0) { p = hJ(p, b == 4.0 ? pLL : pUL, b == 4.0 ? eLL : eUL); if (b == 4.0) p = hJ(p, pUL, eUL); n = hJn(n, b == 4.0 ? eLL + eUL : eUL); }
  if (b == 6.0 || b == 5.0) { p = hJ(p, b == 6.0 ? pLR : pUR, b == 6.0 ? eLR : eUR); if (b == 6.0) p = hJ(p, pUR, eUR); n = hJn(n, b == 6.0 ? eLR + eUR : eUR); }
  if (b == 2.0) { p = hJ(p, pHd, eHd); n = hJn(n, eHd); }
  if (b >= 1.0 && b <= 6.0) { p = hJ(p, pSp, eSp); n = hJn(n, eSp); }
  if (b == 8.0 || b == 7.0) { p = hJ(p, b == 8.0 ? pSL : pTL, b == 8.0 ? eSL : eTL); if (b == 8.0) p = hJ(p, pTL, eTL); n = hJn(n, b == 8.0 ? eSL + eTL : eTL); }
  if (b == 10.0 || b == 9.0) { p = hJ(p, b == 10.0 ? pSR : pTR, b == 10.0 ? eSR : eTR); if (b == 10.0) p = hJ(p, pTR, eTR); n = hJn(n, b == 10.0 ? eSR + eTR : eTR); }
  p = hJ(p, pPel, ePel); n = hJn(n, ePel);
  p += off;
  if (type == 7.0) { p = hRX(p - vec3(0.0, 0.12, 0.0), -1.5708) + vec3(0.0, 0.12, 0.85); n = hRX(n, -1.5708); }
  p *= aShape.x;
}`;

export function humanMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.75, vertexColors: false });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uTime: G.uTime, uWetness: G.uWetness });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${HUMAN_VERT_PARS}\nattribute vec4 aSkin; attribute vec3 aShirt; attribute vec4 aPants; varying vec3 vHCol; varying float vHPart;`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec3 hp = position; humanPose(hp, objectNormal);')
      .replace('#include <begin_vertex>', `vec3 transformed = hp;
        float pt = floor(_part + 0.5); vHPart = pt;
        vec3 hair = aSkin.rgb * 0.15 * (1.0 - aSkin.w) + vec3(0.02, 0.015, 0.01) * aSkin.w;
        vec3 shoes = fract(aPants.w * 7.0) > 0.5 ? vec3(0.8) : vec3(0.03);
        vHCol = pt == 0.0 ? aSkin.rgb : pt == 1.0 ? aShirt : pt == 2.0 ? aPants.rgb : pt == 4.0 ? shoes : pt == 6.0 ? (aPants.w > 0.5 ? aSkin.rgb : aPants.rgb) : hair;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHCol; varying float vHPart; uniform float uWetness;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb = vHCol;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vHPart == 0.0 ? 0.55 : vHPart == 3.0 || vHPart == 5.0 ? 0.6 : 0.85; roughnessFactor = mix(roughnessFactor, 0.4, uWetness * 0.5);');
  };
  mat.customProgramCacheKey = () => 'human';
  return mat;
}

export function humanDepthMaterial(): THREE.MeshDepthMaterial {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uTime: G.uTime });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${HUMAN_VERT_PARS}`)
      .replace('#include <begin_vertex>', 'vec3 transformed = position; vec3 hn = vec3(0.0, 1.0, 0.0); humanPose(transformed, hn);');
  };
  mat.customProgramCacheKey = () => 'human-depth';
  return mat;
}

const SKIN = ['#f1c27d', '#e0ac69', '#d09a5e', '#c68642', '#a86b3c', '#8d5524', '#6b3e1f', '#4f2e19'].map((h) => new THREE.Color(h));
const SHIRTS = ['#f5f5f5', '#e63946', '#1d3557', '#457b9d', '#f4a261', '#2a9d8f', '#ffb703', '#8338ec', '#ff006e', '#06d6a0', '#222222', '#c1121f', '#0077b6', '#fb8500', '#9c6644', '#e9c46a'].map((h) => new THREE.Color(h));
const PANTS = ['#1f3b73', '#2b4c7e', '#23395b', '#111111', '#3d3d3d', '#7f6a4d', '#c2b280', '#5a5a5a', '#14213d'].map((h) => new THREE.Color(h));

export interface CrowdLook {
  skin: THREE.Color;
  hairDark: number;
  shirt: THREE.Color;
  pants: THREE.Color;
  shorts: number;
  height: number;
  girth: number;
  female: number;
  longHair: number;
}

export function randomLook(r: () => number): CrowdLook {
  const female = r() < 0.5 ? 1 : 0;
  return {
    skin: SKIN[Math.floor(r() * SKIN.length)],
    hairDark: 0.7 + r() * 0.3,
    shirt: SHIRTS[Math.floor(r() * SHIRTS.length)],
    pants: PANTS[Math.floor(r() * PANTS.length)],
    shorts: r() < 0.3 ? 1 : 0,
    height: female ? 0.9 + r() * 0.1 : 0.96 + r() * 0.12,
    girth: 0.88 + r() * 0.32,
    female,
    longHair: female && r() < 0.7 ? 1 : 0,
  };
}

/** Instanced crowd: fixed capacity, per-instance look + animation attributes. */
export class Crowd {
  readonly mesh: THREE.InstancedMesh;
  private aAnim: THREE.InstancedBufferAttribute;
  private aShape: THREE.InstancedBufferAttribute;
  private aSkin: THREE.InstancedBufferAttribute;
  private aShirt: THREE.InstancedBufferAttribute;
  private aPants: THREE.InstancedBufferAttribute;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3(1, 1, 1);
  private yAxis = new THREE.Vector3(0, 1, 0);

  constructor(readonly capacity: number, castShadow: boolean) {
    const geo = buildBody();
    this.aAnim = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.aShape = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4).fill(1), 4);
    this.aSkin = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.aShirt = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.aPants = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    for (const a of [this.aAnim]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAnim', this.aAnim);
    geo.setAttribute('aShape', this.aShape);
    geo.setAttribute('aSkin', this.aSkin);
    geo.setAttribute('aShirt', this.aShirt);
    geo.setAttribute('aPants', this.aPants);
    this.mesh = new THREE.InstancedMesh(geo, humanMaterial(), capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = castShadow;
    this.mesh.customDepthMaterial = humanDepthMaterial();
  }

  setLook(i: number, l: CrowdLook) {
    this.aShape.setXYZW(i, l.height, l.girth, l.female, l.longHair);
    this.aSkin.setXYZW(i, l.skin.r, l.skin.g, l.skin.b, l.hairDark);
    this.aShirt.setXYZ(i, l.shirt.r, l.shirt.g, l.shirt.b);
    this.aPants.setXYZW(i, l.pants.r, l.pants.g, l.pants.b, l.shorts);
    this.aShape.needsUpdate = this.aSkin.needsUpdate = this.aShirt.needsUpdate = this.aPants.needsUpdate = true;
  }

  set(i: number, x: number, y: number, z: number, yaw: number, anim: number, phase: number, amount = 1) {
    this.q.setFromAxisAngle(this.yAxis, yaw);
    this.m.compose(new THREE.Vector3(x, y, z), this.q, this.s);
    this.mesh.setMatrixAt(i, this.m);
    this.aAnim.setXYZW(i, anim, phase, amount, 0);
  }

  commit(count: number) {
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aAnim.needsUpdate = true;
  }
}
