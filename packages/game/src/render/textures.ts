import * as THREE from 'three';

/**
 * GPU texture baker: renders tileable procedural materials (albedo+roughness and
 * tangent-space normal) into mip-mapped render targets once at load time.
 * All noise is periodic so textures tile seamlessly. No external image assets.
 */
const NOISE_GLSL = /* glsl */ `
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(mod(i, per)), b = hash(mod(i + vec2(1, 0), per));
  float c = hash(mod(i + vec2(0, 1), per)), d = hash(mod(i + vec2(1, 1), per));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p, float per, int oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) { if (i >= oct) break; s += a * vnoise(p, per); p *= 2.0; per *= 2.0; a *= 0.5; }
  return s;
}
vec2 hash2(vec2 p) { return vec2(hash(p), hash(p + 17.31)); }
// periodic voronoi: returns (F1, F2, cell id hash)
vec3 voronoi(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  float f1 = 8.0, f2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(x, y);
    vec2 o = hash2(mod(i + g, per));
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; id = hash(mod(i + g, per) + 3.7); } else if (d < f2) f2 = d;
  }
  return vec3(sqrt(f1), sqrt(f2), id);
}
`;

/** Each recipe outputs height h, albedo col, roughness r for uv in [0,1). */
const RECIPES: Record<string, string> = {
  asphalt: `
    float n = fbm(uv * 8.0, 8.0, 6);
    float grain = hash(floor(uv * 512.0));
    float stones = smoothstep(0.82, 0.95, hash(floor(uv * 256.0) + 0.5));
    float ptch = smoothstep(0.55, 0.6, fbm(uv * 3.0 + 7.0, 3.0, 4));
    float crack = 1.0 - smoothstep(0.0, 0.025, abs(fbm(uv * 4.0 + 3.0, 4.0, 5) - 0.5));
    vec3 base = mix(vec3(0.055), vec3(0.085), n);
    base = mix(base, vec3(0.04), ptch * 0.6);
    base += grain * 0.025 + stones * 0.07;
    base = mix(base, vec3(0.02), crack * 0.8);
    col = base; r = 0.9 - stones * 0.25 - ptch * 0.05;
    h = n * 0.4 + grain * 0.4 + stones * 0.5 - crack * 0.6;`,
  pavers: `
    // running-bond granite pavers (adoquines) ~ 8x4 per tile
    vec2 q = uv * vec2(8.0, 16.0);
    q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
    vec2 c = floor(q); vec2 f = fract(q);
    float id = hash(mod(c, vec2(8.0, 16.0)) + 1.3);
    vec2 d = min(f, 1.0 - f) * vec2(1.0, 0.5);
    float edge = smoothstep(0.0, 0.06, min(d.x, d.y * 2.0));
    float wear = fbm(uv * 16.0, 16.0, 4);
    vec3 stone = mix(vec3(0.24, 0.21, 0.19), vec3(0.42, 0.36, 0.31), id);
    stone = mix(stone, vec3(0.33, 0.33, 0.34), hash(c + 9.1) * 0.5);
    stone *= 0.8 + wear * 0.4;
    col = mix(vec3(0.08, 0.07, 0.06), stone, edge);
    r = mix(0.95, 0.62 + id * 0.2, edge);
    h = edge * (0.75 + wear * 0.25) - (1.0 - edge) * 0.2;`,
  sidewalk: `
    vec2 q = uv * 2.0; vec2 f = fract(q); vec2 c = floor(q);
    float joint = smoothstep(0.0, 0.015, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    float n = fbm(uv * 12.0, 12.0, 5);
    float stain = smoothstep(0.55, 0.75, fbm(uv * 3.0 + 1.7, 3.0, 4));
    vec3 base = vec3(0.48, 0.47, 0.44) * (0.85 + 0.25 * n) * (0.92 + 0.1 * hash(mod(c, 2.0) + 4.0));
    base = mix(base, base * vec3(0.7, 0.68, 0.64), stain);
    col = mix(base * 0.55, base, joint); r = 0.88;
    h = joint * 0.8 + n * 0.2;`,
  plaza: `
    vec2 q = uv * 3.0; vec2 f = fract(q); vec2 c = floor(q);
    float id = hash(mod(c, 3.0) + 2.2);
    float joint = smoothstep(0.0, 0.012, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    float n = fbm(uv * 24.0, 24.0, 5);
    vec3 tile = mix(vec3(0.52, 0.42, 0.36), vec3(0.62, 0.56, 0.5), id) * (0.85 + 0.25 * n);
    col = mix(tile * 0.5, tile, joint); r = mix(0.9, 0.55 + n * 0.2, joint);
    h = joint * 0.9 + n * 0.15;`,
  ground: `
    float n = fbm(uv * 6.0, 6.0, 6);
    float g = smoothstep(0.45, 0.7, fbm(uv * 3.0 + 4.0, 3.0, 5));
    float pebbles = smoothstep(0.75, 0.9, hash(floor(uv * 300.0)));
    vec3 dirt = mix(vec3(0.33, 0.27, 0.2), vec3(0.46, 0.39, 0.3), n);
    vec3 grass = mix(vec3(0.17, 0.23, 0.08), vec3(0.3, 0.33, 0.13), n);
    vec3 concrete = vec3(0.42, 0.41, 0.38) * (0.85 + 0.3 * n);
    float paved = smoothstep(0.35, 0.6, fbm(uv * 1.5 + 9.0, 1.5, 4));
    col = mix(mix(dirt, grass, g * 0.6), concrete, paved * 0.7) + pebbles * 0.06; r = 0.95;
    h = n * 0.6 + pebbles * 0.4;`,
  grass: `
    float n = fbm(uv * 10.0, 10.0, 6);
    float blades = hash(floor(uv * vec2(600.0, 200.0)));
    float dry = smoothstep(0.55, 0.8, fbm(uv * 2.0 + 9.0, 2.0, 4));
    vec3 g = mix(vec3(0.07, 0.17, 0.03), vec3(0.18, 0.3, 0.06), n * 0.7 + blades * 0.3);
    col = mix(g, vec3(0.32, 0.3, 0.12), dry * 0.55); r = 0.92;
    h = blades * 0.6 + n * 0.4;`,
  sand: `
    float n = fbm(uv * 20.0, 20.0, 6);
    float ripples = sin((uv.x + fbm(uv * 4.0, 4.0, 3) * 0.3) * 6.2831 * 24.0) * 0.5 + 0.5;
    col = mix(vec3(0.64, 0.56, 0.42), vec3(0.78, 0.7, 0.55), n) * (0.95 + ripples * 0.05); r = 0.95;
    h = n * 0.5 + ripples * 0.3;`,
  stone: `
    // coral stone ashlar (piedra coralina): porous limestone blocks
    vec2 q = uv * vec2(3.0, 6.0);
    q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
    vec2 f = fract(q); vec2 c = floor(q);
    float joint = smoothstep(0.0, 0.03, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y) * 2.0));
    vec3 v = voronoi(uv * 40.0, 40.0);
    float pores = 1.0 - smoothstep(0.0, 0.18, v.x);
    float n = fbm(uv * 12.0, 12.0, 5);
    vec3 st = mix(vec3(0.55, 0.47, 0.36), vec3(0.72, 0.64, 0.5), hash(mod(c, vec2(3.0, 6.0))) * 0.6 + n * 0.4);
    st *= 1.0 - pores * 0.45;
    col = mix(st * 0.6, st, joint); r = 0.9;
    h = joint * 0.7 + n * 0.3 - pores * 0.5;`,
  plaster: `
    float n = fbm(uv * 6.0, 6.0, 7);
    float fine = fbm(uv * 48.0, 48.0, 3);
    float stain = smoothstep(0.5, 0.8, fbm(vec2(uv.x * 4.0, uv.y * 1.0) + 2.0, 4.0, 5));
    float crack = 1.0 - smoothstep(0.0, 0.012, abs(fbm(uv * 3.0 + 11.0, 3.0, 6) - 0.5));
    float v = 0.84 + n * 0.18 + fine * 0.07 - stain * 0.15 - crack * 0.08;
    col = vec3(v); r = 0.88 - fine * 0.1;
    h = n * 0.3 + fine * 0.5 - crack * 0.6;`,
  roof: `
    float n = fbm(uv * 5.0, 5.0, 6);
    float st = smoothstep(0.5, 0.8, fbm(uv * 2.5 + 5.0, 2.5, 5));
    float tar = smoothstep(0.62, 0.66, fbm(uv * 1.5 + 2.0, 1.5, 4));
    col = vec3(0.75 + n * 0.2) * (1.0 - st * 0.35) * (1.0 - tar * 0.6); r = 0.93 - tar * 0.3;
    h = n * 0.5 - tar * 0.2;`,
  rock: `
    vec3 v = voronoi(uv * 10.0, 10.0);
    float n = fbm(uv * 8.0, 8.0, 7);
    float holes = 1.0 - smoothstep(0.0, 0.25, voronoi(uv * 30.0, 30.0).x);
    col = mix(vec3(0.16, 0.15, 0.13), vec3(0.34, 0.31, 0.27), n) * (1.0 - holes * 0.5); r = 0.8;
    h = (v.y - v.x) * 0.8 + n * 0.5 - holes * 0.4;`,
  water: `
    // two octaves of directional waves; height only (normal is what matters)
    float w = 0.0; vec2 p = uv * 6.2831;
    w += sin(p.x * 3.0 + p.y * 2.0 + fbm(uv * 4.0, 4.0, 3) * 4.0) * 0.5;
    w += sin(p.x * -5.0 + p.y * 7.0) * 0.25;
    w += fbm(uv * 16.0, 16.0, 4) * 0.8;
    col = vec3(0.5); r = 0.1; h = w * 0.5;`,
  // data texture: R = large blotches, G = puddle mask, B = fine variation, A = streaks
  macro: `
    col = vec3(fbm(uv * 4.0, 4.0, 6), fbm(uv * 8.0 + 3.1, 8.0, 5), fbm(uv * 32.0 + 7.7, 32.0, 4));
    r = fbm(vec2(uv.x * 24.0, uv.y * 3.0), 24.0, 5); h = 0.0;`,
};

export interface BakedMaterialMaps {
  albedo: THREE.Texture;
  normal: THREE.Texture;
}

export class TextureBaker {
  private readonly rtCache: THREE.WebGLRenderTarget[] = [];
  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly size: number) {}

  /** Linear data texture (no sRGB encoding): rgb + a from the recipe's col / r. */
  bakeData(name: string): THREE.Texture {
    return this.bakePass(RECIPES[name], false, 0, true).texture;
  }

  private bakePass(recipe: string, normalPass: boolean, strength: number, data = false): THREE.WebGLRenderTarget {
    const size = this.size;
    const rt = new THREE.WebGLRenderTarget(size, size, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      depthBuffer: false,
      colorSpace: normalPass || data ? THREE.NoColorSpace : THREE.SRGBColorSpace,
    });
    rt.texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTexel: { value: 1 / size }, uStrength: { value: strength } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uTexel; uniform float uStrength;
        ${NOISE_GLSL}
        void sampleMat(vec2 uv, out vec3 col, out float r, out float h) { ${recipe} }
        void main() {
          vec3 col; float r; float h;
          vec2 uv = vUv;
          sampleMat(uv, col, r, h);
          ${
            normalPass
              ? `vec3 c2; float r2; float hx; float hy;
                 sampleMat(fract(uv + vec2(uTexel, 0.0)), c2, r2, hx);
                 sampleMat(fract(uv + vec2(0.0, uTexel)), c2, r2, hy);
                 vec3 n = normalize(vec3((h - hx) * uStrength, (h - hy) * uStrength, 1.0));
                 gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);`
              : data
                ? `gl_FragColor = vec4(clamp(col, 0.0, 1.0), clamp(r, 0.0, 1.0));`
                : // linear albedo; the SRGB8_ALPHA8 target encodes on write and decodes on sampling
                  `gl_FragColor = vec4(clamp(col, 0.0, 1.0), clamp(r, 0.0, 1.0));`
          }
        }`,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    const scene = new THREE.Scene();
    scene.add(quad);
    const cam = new THREE.OrthographicCamera();
    const prevRT = this.renderer.getRenderTarget();
    const prevTone = this.renderer.toneMapping;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setRenderTarget(rt);
    this.renderer.render(scene, cam);
    this.renderer.setRenderTarget(prevRT);
    this.renderer.toneMapping = prevTone;
    mat.dispose();
    quad.geometry.dispose();
    this.rtCache.push(rt);
    return rt;
  }

  bake(name: keyof typeof RECIPES | string, normalStrength = 6): BakedMaterialMaps {
    const recipe = RECIPES[name];
    if (!recipe) throw new Error(`Unknown texture recipe ${name}`);
    const a = this.bakePass(recipe, false, normalStrength);
    const n = this.bakePass(recipe, true, normalStrength);
    return { albedo: a.texture, normal: n.texture };
  }

  dispose() {
    for (const rt of this.rtCache) rt.dispose();
    this.rtCache.length = 0;
  }
}

export const TEXTURE_RECIPES = Object.keys(RECIPES);
