import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { GraphicsSettings } from '@sd/shared';
import { G } from '../render/materials.ts';

/**
 * HDR safety: very glossy surfaces (calm sea, wet asphalt, car paint) can produce GGX
 * highlights above the half-float range (65504) at grazing sun angles. An Inf pixel turns
 * into NaN inside the bloom blur and blacks out the whole frame, so every built-in lit
 * material clamps its linear output. 64 is far above anything the tone mapper needs.
 */
const OPAQUE = 'gl_FragColor = vec4( outgoingLight, diffuseColor.a );';
if (THREE.ShaderChunk.opaque_fragment.includes(OPAQUE)) {
  THREE.ShaderChunk.opaque_fragment = THREE.ShaderChunk.opaque_fragment.replace(OPAQUE, 'gl_FragColor = vec4( clamp( outgoingLight, 0.0, 64.0 ), diffuseColor.a );');
}

/**
 * Colour grade: slight warm tropical look, vignette, rain desaturation. Runs after tone mapping.
 * Also the lens effects: faint colour fringing towards the corners (Alto/Ultra) and a radial speed blur at the
 * screen edges when driving fast (setting "Desenfoque de velocidad").
 */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uRain: { value: 0 }, uNight: { value: 0 }, uVignette: { value: 0.22 }, uSpeed: { value: 0 }, uCA: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uRain; uniform float uNight; uniform float uVignette; uniform float uSpeed; uniform float uCA; varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5;
      float r = length(d);
      vec4 c = texture2D(tDiffuse, vUv);
      if (uCA > 0.0) {
        float k = uCA * r * r * 4.0;
        c.r = texture2D(tDiffuse, vUv + d * k).r;
        c.b = texture2D(tDiffuse, vUv - d * k).b;
      }
      if (uSpeed > 0.001) {
        float amt = uSpeed * smoothstep(0.12, 0.7, r) * 0.06;
        vec3 acc = c.rgb;
        for (int i = 1; i <= 6; i++) acc += texture2D(tDiffuse, vUv - d * amt * (float(i) / 6.0)).rgb;
        c.rgb = acc / 7.0;
      }
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 col = mix(vec3(l), c.rgb, 1.08 - uRain * 0.25);
      col *= mix(vec3(1.02, 1.0, 0.96), vec3(0.95, 0.98, 1.05), uNight);
      col = col * col * (3.0 - 2.0 * col) * 0.18 + col * 0.82;
      float v = smoothstep(0.85, 0.2, r);
      col *= mix(1.0 - uVignette, 1.0, v);
      gl_FragColor = vec4(col, c.a);
    }`,
};

/**
 * Final touch after anti-aliasing: contrast-adaptive sharpening (crisper textures without halos) and a fine,
 * animated film grain that hides banding in the sky and in night gradients.
 */
const FinishShader = {
  uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) }, uSharp: { value: 0.5 }, uGrain: { value: 0 }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uSharp; uniform float uGrain; uniform float uTime; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb;
      vec3 s = texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb;
      vec3 e = texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb;
      vec3 w = texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb;
      vec3 mn = min(c, min(min(n, s), min(e, w)));
      vec3 mx = max(c, max(max(n, s), max(e, w)));
      vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
      vec3 k = -amp / mix(8.0, 5.0, uSharp);
      vec3 col = clamp((c + (n + s + e + w) * k) / (1.0 + 4.0 * k), 0.0, 1.0);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      float g = hash(vUv * vec2(1931.0, 1173.0) + fract(uTime * 7.31)) - 0.5;
      col += g * uGrain * (1.0 - abs(l - 0.5) * 1.6);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class RenderPipeline {
  /** Player vehicle speed in m/s (drives the speed blur). */
  speed = 0;
  private grade: ShaderPass | null = null;
  private finish: ShaderPass | null = null;
  private clock = 0;
  readonly renderer: THREE.WebGLRenderer;
  composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private gtao: GTAOPass | null = null;
  private basePixelRatio = 1;
  private dynScale = 1;
  private frameTimes: number[] = [];
  private settings!: GraphicsSettings;
  private size = new THREE.Vector2();

  constructor(readonly canvas: HTMLCanvasElement, private readonly scene: THREE.Scene, private readonly camera: THREE.PerspectiveCamera) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = false;
  }

  apply(s: GraphicsSettings, sun: THREE.DirectionalLight) {
    this.settings = s;
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, 2) * s.resolutionScale;
    this.dynScale = 1;
    this.renderer.setPixelRatio(this.basePixelRatio);
    this.renderer.shadowMap.enabled = s.shadows !== 'off';
    sun.castShadow = s.shadows !== 'off';
    const map = s.shadows === 'high' ? (s.preset === 'ultra' ? 4096 : 2048) : 1024;
    sun.shadow.mapSize.set(map, map);
    const ext = s.shadows === 'high' ? 95 : 60;
    const cam = sun.shadow.camera;
    cam.left = -ext;
    cam.right = ext;
    cam.top = ext;
    cam.bottom = -ext;
    cam.near = 50;
    cam.far = 900;
    cam.updateProjectionMatrix();
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.045;
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    this.camera.fov = s.fov;
    this.camera.far = Math.max(1500, s.drawDistance * 2.2);
    this.camera.updateProjectionMatrix();
    this.buildComposer();
  }

  get shadowExtent() {
    return this.settings?.shadows === 'high' ? 95 : 60;
  }

  private buildComposer() {
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    this.gtao = null;
    this.grade = null;
    this.finish = null;
    const s = this.settings;
    const usePost = s.bloom || s.antialias || s.ambientOcclusion;
    if (!usePost) return;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0 });
    const composer = new EffectComposer(this.renderer, rt);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (s.ambientOcclusion) {
      this.gtao = new GTAOPass(this.scene, this.camera, 1, 1);
      this.gtao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.5, thickness: 2, scale: 1 });
      // The AO normal/depth pass ignores alpha maps, so leaf cards would darken the sky behind them as solid
      // rectangles: leave objects flagged `userData.noAO` (foliage) out of that pass.
      const pass = this.gtao as unknown as { _overrideVisibility(): void; _visibilityCache: THREE.Object3D[]; scene: THREE.Scene };
      const hideLines = pass._overrideVisibility.bind(pass);
      pass._overrideVisibility = () => {
        hideLines();
        pass.scene.traverse((o) => {
          if (o.visible && o.userData.noAO) {
            o.visible = false;
            pass._visibilityCache.push(o);
          }
        });
      };
      composer.addPass(this.gtao);
    }
    if (s.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.55, 0.92);
      composer.addPass(this.bloom);
    }
    composer.addPass(new OutputPass());
    const cinematic = s.preset === 'high' || s.preset === 'ultra';
    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.uCA.value = cinematic ? 0.0011 : 0;
    composer.addPass(this.grade);
    if (s.antialias) composer.addPass(new SMAAPass());
    if (s.preset !== 'low') {
      this.finish = new ShaderPass(FinishShader);
      this.finish.uniforms.uSharp.value = cinematic ? 0.55 : 0.35;
      this.finish.uniforms.uGrain.value = cinematic ? 0.022 : 0;
      composer.addPass(this.finish);
    }
    this.composer = composer;
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      const pr = this.renderer.getPixelRatio();
      this.finish?.uniforms.uTexel.value.set(1 / Math.max(1, w * pr), 1 / Math.max(1, h * pr));
    }
    this.renderer.getSize(this.size);
  }

  /** Dynamic resolution: keep frame time near target by scaling pixel ratio (0.6×–1×). */
  adapt(frameMs: number) {
    if (!this.settings?.dynamicResolution) return;
    this.frameTimes.push(frameMs);
    if (this.frameTimes.length < 45) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    const target = 1000 / 58;
    let next = this.dynScale;
    if (avg > target * 1.25) next = Math.max(0.6, this.dynScale - 0.1);
    else if (avg < target * 0.8) next = Math.min(1, this.dynScale + 0.05);
    if (Math.abs(next - this.dynScale) > 0.01) {
      this.dynScale = next;
      this.renderer.setPixelRatio(this.basePixelRatio * next);
      this.resize();
    }
  }

  get resolutionScale() {
    return this.dynScale;
  }

  render(night: number) {
    if (this.bloom) {
      this.bloom.strength = 0.18 + night * 0.42;
      this.bloom.threshold = THREE.MathUtils.lerp(2.4, 1.05, night);
    }
    if (this.grade) {
      // ShaderPass clones its uniforms, so the shared weather/night values are copied every frame
      this.grade.uniforms.uRain.value = G.uRain.value;
      this.grade.uniforms.uNight.value = night;
      const blur = this.settings.motionBlur === false ? 0 : THREE.MathUtils.smoothstep(this.speed * 3.6, 70, 170);
      this.grade.uniforms.uSpeed.value += (blur - this.grade.uniforms.uSpeed.value) * 0.15;
    }
    if (this.finish) {
      this.clock = (this.clock + 1 / 60) % 1000;
      this.finish.uniforms.uTime.value = this.clock;
    }
    this.renderer.info.reset();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
