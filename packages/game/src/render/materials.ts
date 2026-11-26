import * as THREE from 'three';
import type { BakedMaterialMaps } from './textures.ts';

/** Uniforms shared by every world material (updated once per frame by the environment). */
export const G = {
  uTime: { value: 0 },
  uWetness: { value: 0 },
  uRain: { value: 0 },
  uNight: { value: 0 },
  uDetailFade: { value: 1 },
  /** Direction towards the sun (world space) and its colour × intensity — used for light through leaves. */
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunCol: { value: new THREE.Color(0, 0, 0) },
  tMacro: { value: null as THREE.Texture | null },
};

interface PatchSpec {
  key: string;
  uniforms?: Record<string, { value: unknown }>;
  vertexPars?: string;
  vertexBegin?: string;
  vertexMain?: string;
  fragPars?: string;
  replace?: Record<string, string>;
  defines?: Record<string, string | number>;
}

const COMMON_VERT_PARS = /* glsl */ `
varying vec3 vWPos; varying vec3 vWNormal; varying vec2 vUvR;`;
const COMMON_VERT_MAIN = /* glsl */ `
  vec4 sdWp = vec4(transformed, 1.0);
  vec3 sdWn = objectNormal;
  #ifdef USE_INSTANCING
    sdWp = instanceMatrix * sdWp;
    sdWn = mat3(instanceMatrix) * sdWn;
  #endif
  sdWp = modelMatrix * sdWp;
  vWPos = sdWp.xyz;
  vWNormal = normalize(mat3(modelMatrix) * sdWn);
  vUvR = uv;`;
const COMMON_FRAG_PARS = /* glsl */ `
varying vec3 vWPos; varying vec3 vWNormal; varying vec2 vUvR;
uniform float uTime; uniform float uWetness; uniform float uRain; uniform float uNight; uniform float uDetailFade;
uniform sampler2D tMacro;
float sdHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float aastep(float e, float x) { float w = max(fwidth(x) * 0.75, 1e-4); return smoothstep(e - w, e + w, x); }
// band-limited stripes: fades to 0.5 when the pattern gets finer than a pixel (no shimmering)
float sdRib(float x) { float fw = fwidth(x); return mix(0.5 + 0.5 * sin(x * 6.2831853), 0.5, clamp((fw - 0.12) * 2.2, 0.0, 1.0)); }
float box01(vec2 p, vec2 lo, vec2 hi) { return aastep(lo.x, p.x) * (1.0 - aastep(hi.x, p.x)) * aastep(lo.y, p.y) * (1.0 - aastep(hi.y, p.y)); }
// Explicit-width variants: derivatives are undefined inside non-uniform control flow, so code in
// branches must receive widths computed at top level (otherwise drivers return per-pixel garbage).
float aastepW(float e, float x, float w) { w = max(w * 0.75, 1e-4); return smoothstep(e - w, e + w, x); }
float sdRibW(float x, float fw) { return mix(0.5 + 0.5 * sin(x * 6.2831853), 0.5, clamp((fw - 0.12) * 2.2, 0.0, 1.0)); }
float box01W(vec2 p, vec2 lo, vec2 hi, vec2 w) { return aastepW(lo.x, p.x, w.x) * (1.0 - aastepW(hi.x, p.x, w.x)) * aastepW(lo.y, p.y, w.y) * (1.0 - aastepW(hi.y, p.y, w.y)); }
vec3 sdPerturb(vec3 surfPos, vec3 n, float h, float scale) {
  vec2 dh = vec2(dFdx(h), dFdy(h)) * scale;
  vec3 sx = dFdx(surfPos); vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, n); vec3 r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * n - grad);
}
vec3 sdTangentToView(vec3 tn, vec3 wn) {
  vec3 T = abs(wn.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : normalize(cross(vec3(0.0, 1.0, 0.0), wn));
  vec3 B = normalize(cross(wn, T));
  vec3 w = normalize(T * tn.x + B * tn.y + wn * tn.z);
  return normalize((viewMatrix * vec4(w, 0.0)).xyz);
}
// Rain ripples (animated rings) for wet horizontal surfaces.
vec2 sdRipples(vec2 p) {
  vec2 cell = floor(p); vec2 f = fract(p) - 0.5;
  float t = fract(uTime * 0.9 + sdHash(cell) * 7.0);
  float d = length(f + (vec2(sdHash(cell + 1.3), sdHash(cell + 2.7)) - 0.5) * 0.5);
  float ring = sin((d - t * 0.5) * 60.0) * (1.0 - t) * smoothstep(0.5 * t + 0.08, 0.5 * t, d);
  return normalize(f + 1e-4) * ring;
}`;

function patch<T extends THREE.Material>(mat: T, spec: PatchSpec): T {
  if (spec.defines) (mat as unknown as { defines: Record<string, unknown> }).defines = { ...(mat as unknown as { defines?: object }).defines, ...spec.defines };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, G, spec.uniforms ?? {});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON_VERT_PARS}\n${spec.vertexPars ?? ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${spec.vertexBegin ?? ''}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n${COMMON_VERT_MAIN}\n${spec.vertexMain ?? ''}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${COMMON_FRAG_PARS}\n${spec.fragPars ?? ''}`);
    for (const [chunk, code] of Object.entries(spec.replace ?? {})) {
      const tag = `#include <${chunk}>`;
      if (!shader.fragmentShader.includes(tag)) throw new Error(`chunk ${chunk} missing`);
      shader.fragmentShader = shader.fragmentShader.replace(tag, code);
    }
  };
  mat.customProgramCacheKey = () => spec.key;
  return mat;
}

export interface SurfaceOpts {
  tile: number;
  tint?: THREE.ColorRepresentation;
  normalScale?: number;
  porosity?: number;
  puddles?: boolean;
  vertexColors?: boolean;
  curb?: boolean;
  wetBottom?: number;
  key: string;
}

/** Ground-type PBR surface with baked maps, macro variation, wetness, puddles and rain ripples. */
export function surfaceMaterial(maps: BakedMaterialMaps, o: SurfaceOpts): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: o.tint ?? 0xffffff, roughness: 1, metalness: 0, vertexColors: !!o.vertexColors });
  return patch(mat, {
    key: `surface-${o.key}`,
    uniforms: { tAlb: { value: maps.albedo }, tNrm: { value: maps.normal }, uTile: { value: o.tile }, uNS: { value: o.normalScale ?? 1 }, uPor: { value: o.porosity ?? 0.5 }, uWetBottom: { value: o.wetBottom ?? -999 } },
    defines: { ...(o.puddles ? { SD_PUDDLES: 1 } : {}), ...(o.curb ? { SD_CURB: 1 } : {}) },
    fragPars: 'uniform sampler2D tAlb; uniform sampler2D tNrm; uniform float uTile; uniform float uNS; uniform float uPor; uniform float uWetBottom; float sdRough; float sdPuddle;',
    replace: {
      map_fragment: /* glsl */ `
        vec2 suv = vUvR / uTile;
        vec4 alb = texture2D(tAlb, suv);
        vec4 mac = texture2D(tMacro, vWPos.xz / 173.0);
        vec4 mac2 = texture2D(tMacro, vWPos.xz / 41.0);
        float macro = 0.82 + 0.36 * mac.r * (0.6 + 0.4 * mac2.b);
        diffuseColor.rgb *= alb.rgb * macro;
        sdRough = alb.a;
        #ifdef SD_CURB
          if (vWNormal.y < 0.5) {
            float seg = floor((vWPos.x + vWPos.z) * 0.8);
            vec3 paint = sdHash(vec2(seg, 3.0)) < 0.7 ? vec3(0.75, 0.52, 0.05) : vec3(0.75);
            float worn = smoothstep(0.35, 0.7, mac2.g + mac2.b * 0.4);
            diffuseColor.rgb = mix(paint, diffuseColor.rgb, worn * 0.8);
          }
        #endif
        float wetHere = max(uWetness, step(vWPos.y, uWetBottom) * 0.9);
        sdPuddle = 0.0;
        #ifdef SD_PUDDLES
          sdPuddle = smoothstep(0.62, 0.7, mac2.g + (1.0 - uWetness) * 0.5) * step(0.7, vWNormal.y) * uWetness;
        #endif
        diffuseColor.rgb *= mix(1.0, 0.45, wetHere * uPor);`,
      roughnessmap_fragment: /* glsl */ `
        float roughnessFactor = roughness * sdRough;
        roughnessFactor = mix(roughnessFactor, 0.18, wetHere * 0.65);
        roughnessFactor = mix(roughnessFactor, 0.03, sdPuddle);`,
      normal_fragment_maps: /* glsl */ `
        vec3 tn = texture2D(tNrm, suv).xyz * 2.0 - 1.0;
        tn.xy *= uNS * (1.0 - sdPuddle);
        normal = sdTangentToView(normalize(tn), normalize(vWNormal));
        if (uRain > 0.01 && sdPuddle > 0.01) {
          vec2 rp = sdRipples(vWPos.xz * 2.5) * uRain * sdPuddle;
          normal = normalize(normal + (viewMatrix * vec4(rp.x, 0.0, rp.y, 0.0)).xyz * 0.6);
        }`,
    },
  });
}

/**
 * Procedural facade shader: windows, doors, shutters, iron bars, storefronts,
 * cornices, weathering and lit windows at night — driven by per-vertex
 * attributes from the world builder (style, seed, flags, levels).
 */
export function facadeMaterial(plaster: BakedMaterialMaps, stone: BakedMaterialMaps): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  return patch(mat, {
    key: 'facade',
    uniforms: { tPlaster: { value: plaster.albedo }, tPlasterN: { value: plaster.normal }, tStone: { value: stone.albedo }, tStoneN: { value: stone.normal } },
    // flat: per-wall constants must not be interpolated (hashes of interpolated seeds flicker per pixel)
    vertexPars: 'attribute vec4 _facade; attribute vec2 _bdim; flat varying vec4 vFacade; flat varying vec2 vBdim;',
    vertexMain: 'vFacade = _facade; vBdim = _bdim;',
    fragPars: /* glsl */ `
      uniform sampler2D tPlaster; uniform sampler2D tPlasterN; uniform sampler2D tStone; uniform sampler2D tStoneN;
      flat varying vec4 vFacade; flat varying vec2 vBdim;
      float fRough; float fMetal; vec3 fEmis; float fH; float fGlass;
      vec3 woodColor(float h) {
        return h < 0.25 ? vec3(0.05, 0.16, 0.08) : h < 0.5 ? vec3(0.17, 0.08, 0.035) : h < 0.7 ? vec3(0.04, 0.1, 0.2) : h < 0.85 ? vec3(0.32, 0.18, 0.08) : vec3(0.5, 0.48, 0.42);
      }`,
    replace: {
      map_fragment: /* glsl */ `
        float style = floor(vFacade.x + 0.5);
        float seed = vFacade.y;
        float flags = vFacade.z;
        float levels = vFacade.w;
        bool street = mod(flags, 2.0) > 0.5;
        bool shop = mod(floor(flags / 2.0), 2.0) > 0.5;
        bool blank = mod(floor(flags / 4.0), 2.0) > 0.5;
        bool arcade = mod(floor(flags / 8.0), 2.0) > 0.5;
        float floorH = vBdim.x;
        vec2 fuv = vUvR;
        float bay = floor(fuv.x); float fl = floor(fuv.y);
        vec2 f = vec2(fract(fuv.x), fract(fuv.y));
        float yM = fuv.y * floorH;
        vec2 wn2 = normalize(vWNormal.xz + 1e-5);
        vec2 puv = vec2(dot(vWPos.xz, vec2(-wn2.y, wn2.x)), vWPos.y);
        bool isStone = style == 1.0 || style == 7.0;
        vec3 paint = vColor.rgb;
        vec4 pl = isStone ? texture2D(tStone, puv / 3.0) : texture2D(tPlaster, puv / 2.2);
        vec3 wall = isStone ? pl.rgb * (paint / vec3(0.6, 0.53, 0.42)) : paint * pl.r;
        if (style == 8.0) wall = paint * (0.92 + 0.08 * pl.r);
        fRough = isStone ? 0.92 : style == 8.0 ? 0.4 : 0.85 + pl.a * 0.1;
        fMetal = 0.0; fEmis = vec3(0.0); fH = 0.0;
        float bh = sdHash(vec2(bay + seed * 97.0, fl + seed * 31.0));
        float colH = sdHash(vec2(bay * 0.37 + seed * 11.0, 5.0));
        bool parapet = fuv.y >= levels;
        vec2 fwu = fwidth(fuv);
        float aaK = 1.0 - smoothstep(0.08, 0.3, max(fwu.x, fwu.y));
        float detail = uDetailFade * (1.0 - smoothstep(240.0, 650.0, length(vViewPosition))) * aaK;
        vec3 col = wall;
        float glass = 0.0; float lit = 0.0; fGlass = 0.0;
        if (!blank && !parapet && detail > 0.0) {
          // per-style opening rectangle in bay/floor-local coords
          vec2 lo = vec2(0.28, 0.28); vec2 hi = vec2(0.72, 0.78);
          bool door = false; bool shopFront = false;
          if (style == 0.0) { // colonial
            if (fl < 0.5) { door = street && (mod(bay + floor(seed * 3.0), 2.0) < 1.0 || arcade); lo = door ? vec2(0.27, 0.0) : vec2(0.3, 0.22); hi = door ? vec2(0.73, 0.74) : vec2(0.7, 0.74); }
            else { lo = vec2(0.3, 0.1); hi = vec2(0.7, 0.8); }
          } else if (style == 1.0 || style == 7.0) { // coral stone / ruins: smaller arched openings
            lo = vec2(0.36, 0.3); hi = vec2(0.64, 0.75);
            if (fl < 0.5 && street && mod(bay, 3.0) < 1.0) { door = true; lo = vec2(0.3, 0.0); hi = vec2(0.7, 0.7); }
          } else if (style == 2.0) { // Gazcue 1950s: wide jalousie windows
            lo = vec2(0.12, 0.36); hi = vec2(0.88, 0.74);
            if (fl < 0.5 && street && bay < 0.5) { door = true; lo = vec2(0.3, 0.0); hi = vec2(0.66, 0.72); }
          } else if (style == 3.0) { // concrete house with rejas
            lo = vec2(0.24, 0.32); hi = vec2(0.76, 0.76);
            if (fl < 0.5 && street && mod(bay + floor(seed * 5.0), 3.0) < 1.0) { door = true; lo = vec2(0.28, 0.0); hi = vec2(0.72, 0.76); }
          } else if (style == 4.0) { lo = vec2(0.18, 0.3); hi = vec2(0.82, 0.78); }
          else if (style == 5.0) { lo = vec2(0.18, 0.3); hi = vec2(0.82, 0.78); }
          else if (style == 6.0) { lo = vec2(0.03, 0.06); hi = vec2(0.97, 0.94); }
          else if (style == 8.0) { lo = vec2(0.32, 0.2); hi = vec2(0.68, 0.8); }
          if ((shop || style == 5.0 && street) && fl < 0.5 && street && style != 1.0) { shopFront = true; lo = vec2(0.04, 0.0); hi = vec2(0.96, 0.8); }
          if (!street && sdHash(vec2(bay, fl + seed)) < 0.45) { lo = vec2(0.5); hi = vec2(0.5); }
          float frameW = style == 6.0 ? 0.015 : 0.05;
          float inOpen = box01W(f, lo, hi, fwu);
          float inFrame = box01W(f, lo - frameW, hi + frameW, fwu) - inOpen;
          // arched tops for colonial stone and arcades
          if ((style == 1.0 || style == 7.0 || (arcade && fl < 1.5)) && !shopFront) {
            vec2 c = vec2((lo.x + hi.x) * 0.5, hi.y - (hi.x - lo.x) * 0.5);
            float rad = (hi.x - lo.x) * 0.5;
            float inArch = 1.0 - aastepW(rad, length((f - c) * vec2(1.0, floorH / 3.4)), max(fwu.x, fwu.y * floorH / 3.4));
            inOpen = f.y > c.y ? inArch * box01W(f, lo, vec2(hi.x, 2.0), fwu) : inOpen;
          }
          if (arcade && fl < 1.5) { lo = vec2(0.08, 0.0); hi = vec2(0.92, 0.82); inOpen = max(inOpen, box01W(f, lo, hi, fwu) * (f.y < 0.6 ? 1.0 : 1.0 - aastepW(0.42, length((f - vec2(0.5, 0.6)) * vec2(1.0, floorH / 3.4)), max(fwu.x, fwu.y * floorH / 3.4)))); }
          vec2 lf = (f - lo) / max(hi - lo, vec2(1e-3));
          vec2 wl = fwu / max(hi - lo, vec2(1e-3));
          if (inOpen > 0.0) {
            vec3 openCol = vec3(0.02, 0.022, 0.025);
            float openRough = 0.08;
            if (shopFront) {
              // roll-up metal shutter (santamaría) partly open, lit interior
              float shutter = aastepW(0.55 + 0.35 * colH, lf.y, wl.y);
              float corr = sdRibW(lf.y * 28.0, 28.0 * wl.y);
              vec3 metal = vec3(0.32, 0.33, 0.33) * (0.75 + 0.25 * corr);
              vec3 interior = mix(vec3(0.12, 0.1, 0.08), vec3(0.35, 0.3, 0.22), sdHash(vec2(floor(lf.x * 6.0), bay)));
              openCol = mix(interior, metal, shutter);
              openRough = mix(0.7, 0.45, shutter);
              fMetal = shutter * 0.6;
              lit = (1.0 - shutter) * 1.4;
              fH = -0.5 + shutter * (0.35 + 0.15 * corr);
            } else if (style == 0.0 || style == 1.0) {
              // wooden doors / shutters (louvered), some open showing dark interior
              vec3 wc = woodColor(colH);
              bool open_ = bh < 0.35 && !door;
              float lk = door ? 14.0 : 18.0;
              float louver = sdRibW(lf.y * lk, lk * wl.y);
              float split = 1.0 - aastepW(0.015, abs(lf.x - 0.5), wl.x);
              vec3 shutterCol = wc * (0.75 + 0.35 * louver) * (1.0 - split * 0.6);
              openCol = open_ ? vec3(0.025) : shutterCol;
              openRough = open_ ? 0.1 : 0.7;
              fH = open_ ? -0.7 : -0.3 + louver * 0.08;
              glass = open_ ? 1.0 : 0.0;
              if (!door && fl < 0.5 && style == 0.0) { // iron bars (rejas) on ground-floor windows
                float bars = 1.0 - aastepW(0.06, abs(fract(lf.x * 7.0) - 0.5) * 2.0 * 0.5 + 0.02, 7.0 * wl.x);
                openCol = mix(openCol, vec3(0.02), bars);
                fH += bars * 0.25;
              }
              lit = open_ ? 1.0 : 0.25;
            } else if (style == 2.0 || style == 4.0 || style == 5.0 || style == 8.0) {
              // aluminium jalousie windows (persianas de celosía)
              float slat = sdRibW(lf.y * 11.0, 11.0 * wl.y);
              float alu = 1.0 - aastepW(0.04, min(min(lf.x, 1.0 - lf.x), abs(lf.x - 0.5) + 0.02), wl.x);
              openCol = mix(vec3(0.03, 0.04, 0.05) + vec3(0.18, 0.2, 0.22) * smoothstep(0.2, 0.9, slat), vec3(0.6, 0.62, 0.62), alu);
              openRough = mix(0.12, 0.35, alu);
              fH = -0.5 + slat * 0.08;
              glass = 0.85;
              lit = 1.0;
              if (door) { openCol = woodColor(colH) * 0.8; openRough = 0.6; glass = 0.0; lit = 0.0; }
            } else if (style == 3.0) {
              // window with decorative iron grille (reja) — very Dominican
              float g = max(1.0 - aastepW(0.05, abs(fract(lf.x * 5.0) - 0.5), 5.0 * wl.x), 1.0 - aastepW(0.04, abs(fract(lf.y * 4.0) - 0.5), 4.0 * wl.y));
              float curl = 1.0 - aastepW(0.04, abs(length(fract(lf * vec2(5.0, 4.0)) - 0.5) - 0.3), max(5.0 * wl.x, 4.0 * wl.y));
              vec3 behind = door ? vec3(0.55, 0.5, 0.42) * woodColor(colH) * 2.0 : vec3(0.03, 0.035, 0.04);
              openCol = mix(behind, vec3(0.04, 0.04, 0.045) + paint * 0.1, max(g, curl));
              openRough = mix(door ? 0.5 : 0.12, 0.5, max(g, curl));
              fH = -0.5 + max(g, curl) * 0.25;
              glass = door ? 0.0 : 0.8;
              lit = door ? 0.0 : 1.0;
            } else if (style == 6.0) {
              float mull = max(1.0 - aastepW(0.02, abs(lf.x - 0.5), wl.x), 0.0);
              openCol = mix(vec3(0.05, 0.08, 0.1) * (0.8 + 0.4 * colH), vec3(0.4), mull);
              openRough = 0.04; fMetal = 0.3; glass = 1.0; lit = 1.0;
              fH = -0.3;
            } else if (style == 7.0) {
              openCol = vec3(0.04, 0.035, 0.03); openRough = 0.95; glass = 0.0; lit = 0.0; fH = -1.0;
            }
            if (!shopFront && glass > 0.3) {
              // a dim room behind the glass instead of a black hole: brighter towards the top, varied per window
              float rh = sdHash(vec2(bay * 5.1 + seed, fl * 2.9 + seed * 3.0));
              vec3 room = mix(vec3(0.045, 0.04, 0.035), vec3(0.19, 0.16, 0.13), smoothstep(0.05, 1.0, lf.y)) * (0.6 + 0.8 * rh);
              openCol = max(openCol, room * (1.0 - uNight * 0.7));
            }
            col = mix(col, openCol, inOpen);
            fGlass = inOpen * max(glass, shopFront ? 0.6 : 0.0);
            fRough = mix(fRough, openRough, inOpen);
            // lit windows at night (deterministic per window)
            float on = step(sdHash(vec2(bay * 1.7 + seed * 13.0, fl * 3.1 + seed)), shopFront ? 0.85 : 0.38);
            vec3 warm = shopFront ? vec3(0.95, 1.0, 0.92) : mix(vec3(1.0, 0.68, 0.38), vec3(0.75, 0.85, 1.0), step(0.85, bh));
            float glowMul = 1.0;
            if (!shopFront) {
              // a room behind the glass: ceiling light at the top, darker towards the sill, some curtains and TVs
              float wh = sdHash(vec2(bay * 3.31 + seed * 7.0, fl * 1.73 + seed));
              glowMul = mix(0.4, 1.0, smoothstep(0.0, 0.95, lf.y)) * (0.8 + 0.2 * sin(clamp(lf.x, 0.0, 1.0) * 3.14159)) * 0.72;
              if (wh > 0.62) warm = mix(warm, vec3(0.85, 0.32, 0.18), 0.55) * 0.75;
              else if (wh > 0.48) warm = mix(warm, vec3(0.95, 0.85, 0.6), 0.6) * 0.8;
              if (wh < 0.06) warm = vec3(0.45, 0.6, 1.0) * (0.6 + 0.4 * sin(uTime * 9.0 + bay * 2.0) * sin(uTime * 2.3 + fl));
            }
            fEmis = warm * glowMul * lit * on * inOpen * uNight * (shopFront ? 0.7 : 0.85) * (0.7 + 0.6 * colH);
          }
          // window frames / surrounds (raised)
          vec3 frameCol = isStone ? wall * 1.15 : style == 0.0 ? mix(wall, vec3(0.85, 0.82, 0.75), 0.6) : style == 6.0 ? vec3(0.35) : wall * 1.12;
          col = mix(col, frameCol, inFrame * (1.0 - inOpen));
          fH += inFrame * 0.5;
        }
        // horizontal mouldings: floor lines and top cornice
        if (style != 6.0 && style != 7.0) {
          float band = (fl > 0.5 && !parapet) ? 1.0 - aastepW(0.035, f.y, fwu.y) : 0.0;
          float cornice = 1.0 - aastepW(0.09, abs(fuv.y - levels - 0.06), fwu.y);
          float m = max(band * (style == 0.0 || style == 2.0 || style == 8.0 ? 1.0 : 0.4), cornice);
          col = mix(col, isStone ? wall * 1.2 : mix(wall, vec3(0.9, 0.88, 0.84), 0.55), m * detail);
          fH += m * 0.6;
        }
        // plinth (zócalo) and ground splash, humidity stains below parapets
        float plinth = 1.0 - aastepW(0.55, yM, fwu.y * floorH);
        col = mix(col, isStone ? wall * 0.7 : mix(wall, vec3(0.32, 0.3, 0.28), style == 0.0 ? 0.55 : 0.3), plinth);
        float streaks = texture2D(tMacro, vec2(puv.x / 9.0, 0.0)).a;
        float topStain = smoothstep(levels * floorH - 3.5, levels * floorH, yM) * smoothstep(0.45, 0.75, streaks) * 0.5;
        float splash = (1.0 - smoothstep(0.2, 1.4, yM)) * 0.45;
        float mold = smoothstep(0.55, 0.85, texture2D(tMacro, puv / 37.0).r) * 0.35;
        col *= 1.0 - (topStain + splash + mold) * (isStone ? 0.6 : 1.0) * (1.0 - glass * 0.8);
        col = mix(col, col * vec3(0.8, 0.85, 0.78), mold);
        // distant / grazing LOD: fade to the average façade tone and an average window glow
        diffuseColor.rgb = mix(wall * 0.8, col, detail);
        vec3 avgGlow = (!blank && !parapet) ? vec3(1.0, 0.74, 0.46) * uNight * ((shop && street && fl < 0.5) ? 0.22 : 0.07) : vec3(0.0);
        fEmis = mix(avgGlow, fEmis, detail);`,
      color_fragment: '',
      roughnessmap_fragment: /* glsl */ `
        float roughnessFactor = mix(fRough, max(0.05, fRough * 0.4), uWetness * 0.8);
        diffuseColor.rgb *= mix(1.0, 0.72, uWetness * (1.0 - glass));`,
      metalnessmap_fragment: 'float metalnessFactor = fMetal;',
      normal_fragment_maps: /* glsl */ `
        vec3 pn = (isStone ? texture2D(tStoneN, puv / 3.0).xyz : texture2D(tPlasterN, puv / 2.2).xyz) * 2.0 - 1.0;
        pn.xy *= (isStone ? 1.2 : 0.5) * (1.0 - fGlass);
        normal = sdTangentToView(normalize(pn), normalize(vWNormal));
        normal = sdPerturb(-vViewPosition, normal, fH * detail * detail, 0.02);`,
      emissivemap_fragment: 'totalEmissiveRadiance += fEmis;',
    },
  });
}

/** Simple vertex-coloured PBR with baked detail map (roofs, stone, coast, props). */
export function detailMaterial(maps: BakedMaterialMaps | null, key: string, o: { tile?: number; roughness?: number; metalness?: number; vertexColors?: boolean; color?: THREE.ColorRepresentation; triplanar?: boolean; normalScale?: number; side?: THREE.Side; porosity?: number } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: o.color ?? 0xffffff, roughness: o.roughness ?? 1, metalness: o.metalness ?? 0, vertexColors: o.vertexColors ?? true, side: o.side ?? THREE.FrontSide });
  if (!maps)
    return patch(mat, {
      key: `detail-${key}`,
      replace: {
        roughnessmap_fragment: `float roughnessFactor = mix(roughness, roughness * 0.35, uWetness * 0.8); diffuseColor.rgb *= mix(1.0, 0.8, uWetness);`,
      },
    });
  return patch(mat, {
    key: `detail-${key}`,
    uniforms: { tAlb: { value: maps.albedo }, tNrm: { value: maps.normal }, uTile: { value: o.tile ?? 3 }, uNS: { value: o.normalScale ?? 1 }, uPor: { value: o.porosity ?? 0.4 } },
    fragPars: 'uniform sampler2D tAlb; uniform sampler2D tNrm; uniform float uTile; uniform float uNS; uniform float uPor; float sdR;',
    replace: {
      map_fragment: /* glsl */ `
        vec2 tuv = ${o.triplanar ? '(abs(vWNormal.y) > 0.6 ? vWPos.xz : vec2(dot(vWPos.xz, normalize(vec2(-vWNormal.z, vWNormal.x) + 1e-5)), vWPos.y))' : 'vUvR'} / uTile;
        vec4 alb = texture2D(tAlb, tuv);
        diffuseColor.rgb *= alb.rgb * (0.85 + 0.3 * texture2D(tMacro, vWPos.xz / 97.0).r);
        sdR = alb.a;`,
      roughnessmap_fragment: /* glsl */ `
        float roughnessFactor = mix(roughness * sdR, 0.15, uWetness * 0.6);
        diffuseColor.rgb *= mix(1.0, 0.55, uWetness * uPor);`,
      normal_fragment_maps: /* glsl */ `
        vec3 tn = texture2D(tNrm, tuv).xyz * 2.0 - 1.0; tn.xy *= uNS;
        normal = sdTangentToView(normalize(tn), normalize(vWNormal) * faceDirection);`,
    },
  });
}

/** Road markings (decals over asphalt): worn paint, polygon offset to avoid z-fighting. */
export function markingsMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  return patch(mat, {
    key: 'markings',
    replace: {
      color_fragment: /* glsl */ `
        diffuseColor.rgb *= vColor.rgb;
        float wear = texture2D(tMacro, vWPos.xz / 13.0).b * 0.6 + texture2D(tMacro, vWPos.xz / 3.0).g * 0.5;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07), smoothstep(0.45, 0.85, wear) * 0.75);
        diffuseColor.rgb *= mix(1.0, 0.7, uWetness);`,
    },
  });
}

/** Original abstract mural for the obelisks: tropical bands and butterfly motifs (Las Mariposas theme). */
export function muralMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
  return patch(mat, {
    key: 'mural',
    replace: {
      map_fragment: /* glsl */ `
        vec2 m = vUvR; float face = floor(m.x); vec2 q = vec2(fract(m.x), m.y);
        vec3 c1 = vec3(0.0, 0.21, 0.55); vec3 c2 = vec3(0.75, 0.05, 0.08); vec3 c3 = vec3(0.98, 0.78, 0.2); vec3 c4 = vec3(0.1, 0.55, 0.45);
        float w = sin(q.y * 26.0 + sin(q.x * 6.28 + face) * 1.5 + face * 2.0);
        vec3 col = mix(mix(c4, c1, smoothstep(-0.2, 0.6, w)), c3, smoothstep(0.7, 0.95, sin(q.y * 9.0 - face)));
        // butterflies
        vec2 cell = vec2(q.x * 2.0, q.y * 14.0); vec2 id = floor(cell); vec2 g = fract(cell) - 0.5;
        float h = sdHash(id + face * 7.0);
        if (h > 0.55) {
          g.x = abs(g.x);
          float wing = smoothstep(0.32, 0.28, length((g - vec2(0.17, 0.08)) * vec2(1.0, 1.5))) + smoothstep(0.22, 0.18, length((g - vec2(0.14, -0.14)) * vec2(1.0, 1.4)));
          col = mix(col, h > 0.8 ? c2 : vec3(0.95), clamp(wing, 0.0, 1.0));
        }
        col = mix(col, vec3(0.95, 0.93, 0.88), smoothstep(0.97, 1.0, q.y));
        diffuseColor.rgb = col * (0.9 + 0.1 * texture2D(tMacro, m * 3.0).r);`,
    },
  });
}

/** Caribbean sea / river surface: scrolling baked normals, low roughness, rain ripples. */
export function waterMaterial(waterMaps: BakedMaterialMaps): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0x0a4a5e, roughness: 0.06, metalness: 0.0 });
  return patch(mat, {
    key: 'water',
    uniforms: { tWN: { value: waterMaps.normal } },
    fragPars: 'uniform sampler2D tWN;',
    replace: {
      map_fragment: /* glsl */ `
        float dist = length(vWPos.xz - cameraPosition.xz);
        vec3 deep = vec3(0.004, 0.045, 0.08);
        vec3 shallow = vec3(0.02, 0.17, 0.2);
        diffuseColor.rgb = mix(shallow, deep, smoothstep(0.0, 900.0, dist)) * (1.0 - uRain * 0.35);`,
      normal_fragment_maps: /* glsl */ `
        vec2 p = vWPos.xz;
        vec3 n1 = texture2D(tWN, p / 37.0 + vec2(uTime * 0.012, uTime * 0.007)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(tWN, p / 13.0 - vec2(uTime * 0.018, -uTime * 0.011)).xyz * 2.0 - 1.0;
        vec3 n3 = texture2D(tWN, p / 3.7 + vec2(uTime * 0.05, uTime * 0.03)).xyz * 2.0 - 1.0;
        float fade = 1.0 - smoothstep(30.0, 600.0, length(p - cameraPosition.xz));
        vec3 tn = normalize(vec3((n1.xy + n2.xy * 0.7 + n3.xy * 0.4 * fade) * (0.55 + uRain * 0.4), 1.0));
        normal = sdTangentToView(tn, vec3(0.0, 1.0, 0.0));
        if (uRain > 0.01) { vec2 rp = sdRipples(p * 1.8) * uRain * fade; normal = normalize(normal + (viewMatrix * vec4(rp.x, 0.0, rp.y, 0.0)).xyz * 0.8); }`,
    },
  });
}

/** Vegetation & props with wind sway (attribute `_sway` = per-vertex sway weight). */
export function propMaterial(key: string, o: { alphaTest?: number; side?: THREE.Side; roughness?: number; metalness?: number; sway?: boolean; foliage?: boolean } = {}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: o.roughness ?? 0.8, metalness: o.metalness ?? 0, side: o.side ?? THREE.FrontSide, alphaTest: o.alphaTest ?? 0 });
  return patch(mat, {
    key: `prop-${key}`,
    vertexPars: o.sway ? 'attribute float _sway; uniform float uTime; uniform float uRain;' : '',
    vertexBegin: o.sway
      ? /* glsl */ `
        float sdPh = 0.0;
        #ifdef USE_INSTANCING
          sdPh = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.07;
        #endif
        float sdAmp = (0.1 + uRain * 0.28) * _sway;
        transformed.x += sin(uTime * 1.6 + sdPh) * sdAmp + sin(uTime * 4.1 + sdPh * 3.0) * sdAmp * 0.25;
        transformed.z += cos(uTime * 1.25 + sdPh * 1.7) * sdAmp * 0.6;`
      : '',
    fragPars: o.foliage ? 'uniform vec3 uSunDir; uniform vec3 uSunCol;' : '',
    replace: {
      roughnessmap_fragment: `float roughnessFactor = mix(roughness, roughness * 0.4, uWetness * 0.7); diffuseColor.rgb *= mix(1.0, 0.82, uWetness);`,
      ...(o.foliage
        ? {
            // Leaf cards: bend normals towards the sky so a canopy is lit as a volume (no black back faces)…
            normal_fragment_maps: /* glsl */ `#include <normal_fragment_maps>
              vec3 sdUpV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
              normal = normalize(mix(normal, sdUpV, 0.55));`,
            // …and let sunlight pass through the leaves when looking towards the sun.
            emissivemap_fragment: /* glsl */ `#include <emissivemap_fragment>
              float sdBack = pow(max(0.0, dot(normalize(vWPos - cameraPosition), normalize(uSunDir))), 3.0);
              totalEmissiveRadiance += diffuseColor.rgb * uSunCol * (0.06 + sdBack * 0.32);`,
          }
        : {}),
    },
  });
}

/** Depth material matching propMaterial sway so shadows move with the leaves. */
export function swayDepthMaterial(alphaTest = 0): THREE.MeshDepthMaterial {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uTime: G.uTime, uRain: G.uRain });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _sway; uniform float uTime; uniform float uRain;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float sdPh = 0.0;
        #ifdef USE_INSTANCING
          sdPh = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.07;
        #endif
        float sdAmp = (0.1 + uRain * 0.28) * _sway;
        transformed.x += sin(uTime * 1.6 + sdPh) * sdAmp + sin(uTime * 4.1 + sdPh * 3.0) * sdAmp * 0.25;
        transformed.z += cos(uTime * 1.25 + sdPh * 1.7) * sdAmp * 0.6;`,
      );
  };
  mat.customProgramCacheKey = () => 'sway-depth';
  return mat;
}
