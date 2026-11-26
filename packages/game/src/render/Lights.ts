import * as THREE from 'three';
import { G } from './materials.ts';

/**
 * Night lighting without hundreds of real lights: every lamp gets an additive
 * glow billboard + a fake light pool on the ground, and a small fixed pool of
 * real PointLights follows the lamps nearest to the camera (fixed count, so
 * shaders never recompile).
 */
export class CityLights {
  readonly group = new THREE.Group();
  private glowGeo = new THREE.InstancedBufferGeometry();
  private poolGeo = new THREE.InstancedBufferGeometry();
  private sources: number[] = [];
  private points: THREE.PointLight[] = [];
  private timer = 0;
  private glowMeshes: THREE.Mesh[] = [];

  constructor(pointCount: number) {
    this.glowGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    this.glowGeo.setIndex([0, 1, 2, 0, 2, 3]);
    this.poolGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3));
    this.poolGeo.setIndex([0, 2, 1, 0, 3, 2]);
    const common = /* glsl */ `
      attribute vec4 aSrc; varying vec2 vQ; varying vec3 vCol; uniform float uNight;
      vec3 lampColor(float k) { return k < 0.5 ? vec3(1.0, 0.72, 0.42) : k < 1.5 ? vec3(1.0, 0.62, 0.28) : vec3(0.92, 0.96, 1.0); }`;
    const glowMat = new THREE.ShaderMaterial({
      uniforms: { uNight: G.uNight },
      vertexShader: `${common}
        varying float vFade;
        void main() {
          vQ = position.xy; vCol = lampColor(aSrc.w);
          vec4 mv = viewMatrix * vec4(aSrc.xyz, 1.0);
          // fade out when the camera is next to the lamp (avoids a screen-filling glare quad)
          vFade = smoothstep(1.5, 6.0, -mv.z);
          float size = aSrc.w < 0.5 ? 0.55 : 1.1;
          mv.xy += position.xy * size;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying vec2 vQ; varying vec3 vCol; varying float vFade; uniform float uNight;
        void main() { float d = length(vQ); float a = pow(max(0.0, 1.0 - d), 2.4) * uNight * vFade; gl_FragColor = vec4(vCol * a * 3.5, a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const poolMat = new THREE.ShaderMaterial({
      uniforms: { uNight: G.uNight },
      vertexShader: `${common}
        void main() {
          vQ = position.xz; vCol = lampColor(aSrc.w);
          float r = aSrc.w < 0.5 ? 4.5 : 8.5;
          vec3 p = vec3(aSrc.x, aSrc.w < 0.5 ? 0.17 : 0.17, aSrc.z) + vec3(position.x * r, 0.0, position.z * r);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `varying vec2 vQ; varying vec3 vCol; uniform float uNight;
        void main() { float d = length(vQ); float a = smoothstep(1.0, 0.0, d); a *= a * uNight * 0.28; gl_FragColor = vec4(vCol * a, a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
    });
    const glow = new THREE.Mesh(this.glowGeo, glowMat);
    const pool = new THREE.Mesh(this.poolGeo, poolMat);
    glow.frustumCulled = pool.frustumCulled = false;
    glow.renderOrder = 10;
    this.group.add(pool, glow);
    this.glowMeshes = [pool, glow];
    for (let i = 0; i < pointCount; i++) {
      const l = new THREE.PointLight(0xffb066, 0, 26, 2);
      this.points.push(l);
      this.group.add(l);
    }
    this.setSources([]);
  }

  setSources(flat: number[]) {
    this.sources = flat;
    const n = flat.length / 4;
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(flat.length ? flat : [0, -999, 0, 0]), 4);
    this.glowGeo.setAttribute('aSrc', attr);
    this.poolGeo.setAttribute('aSrc', attr);
    this.glowGeo.instanceCount = this.poolGeo.instanceCount = n;
  }

  update(dt: number, cam: THREE.Vector3, night: number) {
    // The point lights stay in the scene (intensity 0 by day) so the light count never changes: hiding them
    // would recompile every material at dusk and dawn.
    for (const m of this.glowMeshes) m.visible = night > 0.02;
    this.timer -= dt;
    if (this.timer > 0 || !this.points.length) return;
    this.timer = 0.3;
    const s = this.sources;
    const cand: { d: number; i: number }[] = [];
    for (let i = 0; i < s.length; i += 4) {
      const d = (s[i] - cam.x) ** 2 + (s[i + 2] - cam.z) ** 2;
      if (d < 90 * 90) cand.push({ d, i });
    }
    cand.sort((a, b) => a.d - b.d);
    this.points.forEach((l, k) => {
      const c = cand[k];
      if (!c || night < 0.05) {
        l.intensity = 0;
        return;
      }
      const kind = s[c.i + 3];
      l.position.set(s[c.i], s[c.i + 1] - 0.3, s[c.i + 2]);
      l.color.setHex(kind < 0.5 ? 0xffb36b : kind < 1.5 ? 0xff9e4a : 0xe8f0ff);
      l.distance = kind < 0.5 ? 14 : 26;
      l.intensity = night * (kind < 0.5 ? 14 : 55);
    });
  }
}
