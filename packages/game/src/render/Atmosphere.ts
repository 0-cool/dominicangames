import * as THREE from 'three';
import { G } from './materials.ts';

/**
 * Sky, sun/moon, fog, exposure, weather and rain for Santo Domingo
 * (lat 18.47°N, lon 69.89°W, UTC−4). Sun position uses the NOAA
 * approximation for the real calendar day.
 */
export type Weather = 'clear' | 'cloudy' | 'rain';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uSun; uniform vec3 uMoon; uniform float uNight; uniform float uCloud; uniform float uTime; uniform float uRain; uniform float uFlash;
float h1(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h1(i), h1(i + vec2(1, 0)), u.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += a * n2(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
vec3 skyColor(vec3 d) {
  float sunEl = uSun.y;
  float up = max(d.y, 0.0);
  vec3 dayZen = vec3(0.07, 0.25, 0.68), dayHor = vec3(0.55, 0.72, 0.92);
  vec3 setZen = vec3(0.12, 0.16, 0.38), setHor = vec3(1.0, 0.46, 0.2);
  vec3 nightZen = vec3(0.002, 0.004, 0.012), nightHor = vec3(0.025, 0.03, 0.05);
  float dayF = smoothstep(-0.05, 0.35, sunEl);
  float setF = (1.0 - abs(sunEl - 0.04) / 0.22);
  setF = clamp(setF, 0.0, 1.0);
  vec3 zen = mix(nightZen, dayZen, dayF);
  vec3 hor = mix(nightHor, dayHor, dayF);
  float towardSun = pow(max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSun.x, 0.0, uSun.z) + 1e-5)), 0.0), 3.0);
  hor = mix(hor, setHor, setF * (0.35 + 0.65 * towardSun));
  zen = mix(zen, setZen, setF * 0.4);
  vec3 col = mix(hor, zen, pow(up, 0.45));
  // city glow on the horizon at night (sodium lights)
  col += vec3(0.09, 0.05, 0.02) * uNight * pow(1.0 - up, 6.0);
  // overcast desaturation
  float gray = dot(col, vec3(0.3, 0.55, 0.15));
  col = mix(col, vec3(gray) * (0.75 - uRain * 0.25), uCloud * 0.75);
  return col;
}
void main() {
  vec3 d = normalize(vDir);
  vec3 col = skyColor(d);
  float sd = dot(d, uSun);
  // sun disk + glow
  col += vec3(1.0, 0.85, 0.6) * pow(max(sd, 0.0), 300.0) * 2.5 * (1.0 - uCloud * 0.8) * step(-0.02, uSun.y);
  col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9996, sd) * 60.0 * (1.0 - uCloud) * step(-0.02, uSun.y);
  // moon
  float md = dot(d, uMoon);
  col += vec3(0.75, 0.8, 0.9) * smoothstep(0.99955, 0.9997, md) * 3.0 * uNight * (1.0 - uCloud);
  col += vec3(0.2, 0.25, 0.35) * pow(max(md, 0.0), 80.0) * 0.4 * uNight;
  // stars
  if (d.y > 0.0) {
    vec2 sp = d.xz / (d.y + 0.25) * 180.0;
    float s = step(0.9975, h1(floor(sp))) * (0.6 + 0.4 * sin(uTime * 3.0 + h1(floor(sp) + 3.0) * 30.0));
    col += vec3(s) * uNight * (1.0 - uCloud) * smoothstep(0.0, 0.3, d.y) * 0.9;
  }
  // clouds on a virtual plane
  if (d.y > 0.01) {
    vec2 cp = d.xz / d.y * 1.2 + vec2(uTime * 0.004, uTime * 0.0015);
    float c = fbm(cp * 1.4);
    float cov = mix(0.62, 0.25, uCloud);
    float dens = smoothstep(cov, cov + 0.28, c) * smoothstep(0.01, 0.15, d.y);
    float lit = clamp(0.55 + 0.45 * dot(normalize(vec3(uSun.x, max(uSun.y, 0.05), uSun.z)), vec3(0.0, 1.0, 0.0)) + 0.35 * max(sd, 0.0), 0.0, 1.2);
    vec3 cDay = mix(vec3(0.55, 0.57, 0.6), vec3(1.0, 0.98, 0.95), lit) * mix(1.0, 0.45, uRain);
    vec3 cSet = vec3(1.0, 0.55, 0.35) * 0.9;
    float dayF = smoothstep(-0.05, 0.3, uSun.y);
    float setF = clamp(1.0 - abs(uSun.y - 0.05) / 0.2, 0.0, 1.0);
    vec3 cCol = mix(vec3(0.03, 0.035, 0.05) + vec3(0.05, 0.03, 0.01) * 0.6, cDay, dayF);
    cCol = mix(cCol, cSet, setF * 0.6 * (1.0 - uRain));
    col = mix(col, cCol, dens * 0.92);
  }
  col += vec3(0.6, 0.65, 0.8) * uFlash;
  if (d.y < 0.0) col = mix(col, skyColor(vec3(d.x, 0.0, d.z)) * 0.9, smoothstep(0.0, -0.1, d.y));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Atmosphere {
  readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  readonly moon = new THREE.DirectionalLight(0x9db4ff, 0);
  readonly hemi = new THREE.HemisphereLight(0x9fc4ff, 0x4a3b2a, 0.25);
  readonly fog = new THREE.FogExp2(0xb8c8d8, 0.0011);
  readonly rain: THREE.Mesh;
  readonly sunDir = new THREE.Vector3();
  timeOfDay = 17.2;
  timeScale = 1 / 60; // game hours per real second (1 game hour = 60 s)
  dayOfYear: number;
  weather: Weather = 'clear';
  cloud = 0.15;
  rainAmt = 0;
  wetness = 0;
  private weatherTimer = 240;
  private flash = 0;
  private envScene = new THREE.Scene();
  private envSky: THREE.Mesh;
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private envTimer = 0;
  private lastEnvKey = '';
  autoWeather = true;
  onThunder?: (intensity: number) => void;

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly scene: THREE.Scene, rainDrops: number) {
    const now = new Date();
    this.dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uSun: { value: new THREE.Vector3(0, 1, 0) },
        uMoon: { value: new THREE.Vector3(0, -1, 0) },
        uNight: G.uNight,
        uCloud: { value: 0 },
        uTime: G.uTime,
        uRain: G.uRain,
        uFlash: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), mat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    scene.add(this.sky);
    this.envSky = new THREE.Mesh(this.sky.geometry, mat);
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    scene.fog = this.fog;
    this.sun.castShadow = false;
    scene.add(this.sun, this.sun.target, this.moon, this.moon.target, this.hemi);
    this.rain = this.makeRain(rainDrops);
    scene.add(this.rain);
  }

  private makeRain(count: number): THREE.Mesh {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.008, 0, 0, 0.008, 0, 0, 0.008, 0.55, 0, -0.008, 0.55, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const offs = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      offs[i * 4] = Math.random() * 50 - 25;
      offs[i * 4 + 1] = Math.random() * 24;
      offs[i * 4 + 2] = Math.random() * 50 - 25;
      offs[i * 4 + 3] = 0.8 + Math.random() * 0.4;
    }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(offs, 4));
    geo.instanceCount = count;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: G.uTime, uRain: G.uRain, uCam: { value: new THREE.Vector3() }, uNight: G.uNight },
      vertexShader: /* glsl */ `
        attribute vec4 aOff; uniform float uTime; uniform vec3 uCam; uniform float uRain; varying float vA;
        void main() {
          vec3 base = aOff.xyz;
          float y = mod(base.y - uTime * 14.0 * aOff.w, 24.0);
          vec3 wp = vec3(uCam.x + mod(base.x - uCam.x, 50.0) - 25.0, uCam.y - 8.0 + y, uCam.z + mod(base.z - uCam.z, 50.0) - 25.0);
          wp.x += position.y * 0.18;
          vec4 mv = viewMatrix * vec4(wp + vec3(position.x, position.y, 0.0), 1.0);
          // keep streaks facing the camera horizontally
          mv.x += position.x * 0.0;
          vA = step(fract(aOff.w * 7.13), uRain) * 0.35;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: 'varying float vA; uniform float uNight; void main(){ gl_FragColor = vec4(vec3(0.7, 0.75, 0.8) * (1.0 - uNight * 0.6), vA); }',
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.visible = false;
    return m;
  }

  setWeather(w: Weather, immediate = false) {
    this.weather = w;
    this.weatherTimer = 200 + Math.random() * 300;
    if (immediate) {
      this.cloud = w === 'clear' ? 0.15 : w === 'cloudy' ? 0.7 : 0.95;
      this.rainAmt = w === 'rain' ? 1 : 0;
      this.wetness = w === 'rain' ? 1 : 0;
    }
  }

  /** Real solar position for Santo Domingo on the current day of year. */
  static solar(dayOfYear: number, hour: number, lat = 18.47, lon = -69.89, tz = -4): { az: number; el: number } {
    const g = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (hour - 12) / 24);
    const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const tst = hour * 60 + eqt + 4 * lon - 60 * tz;
    const ha = ((tst / 4 - 180) * Math.PI) / 180;
    const latR = (lat * Math.PI) / 180;
    const cosZ = Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(ha);
    const el = Math.PI / 2 - Math.acos(Math.max(-1, Math.min(1, cosZ)));
    const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(latR) - Math.tan(decl) * Math.cos(latR)) + Math.PI;
    return { az, el };
  }

  update(dt: number, focus: THREE.Vector3, camera: THREE.Camera, shadowSize: number) {
    dt = Math.max(0, dt);
    this.timeOfDay = (this.timeOfDay + dt * this.timeScale) % 24;
    // weather state machine
    if (this.autoWeather) {
      this.weatherTimer -= dt;
      if (this.weatherTimer <= 0) {
        const r = Math.random();
        this.setWeather(this.weather === 'rain' ? (r < 0.6 ? 'cloudy' : 'clear') : r < 0.55 ? 'clear' : r < 0.8 ? 'cloudy' : 'rain');
      }
    }
    const tCloud = this.weather === 'clear' ? 0.15 : this.weather === 'cloudy' ? 0.7 : 0.95;
    const tRain = this.weather === 'rain' ? 1 : 0;
    this.cloud += (tCloud - this.cloud) * Math.min(1, dt / 40);
    this.rainAmt += (tRain - this.rainAmt) * Math.min(1, dt / (tRain > this.rainAmt ? 25 : 15));
    this.wetness = Math.min(1, Math.max(0, this.wetness + (this.rainAmt > 0.3 ? dt / 35 : -dt / 160)));
    if (this.rainAmt > 0.7 && Math.random() < dt * 0.02) {
      this.flash = 1;
      const intensity = 0.5 + Math.random() * 0.5;
      setTimeout(() => this.onThunder?.(intensity), 600 + Math.random() * 2200);
    }
    this.flash = Math.max(0, this.flash - dt * 4);

    const { az, el } = Atmosphere.solar(this.dayOfYear, this.timeOfDay);
    const sd = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    this.sunDir.copy(sd);
    const moonDir = new THREE.Vector3(-sd.x * 0.8 + 0.2, Math.max(0.25, -sd.y) * 0.9 + 0.1, -sd.z * 0.8).normalize();
    const elDeg = (el * 180) / Math.PI;
    const night = 1 - THREE.MathUtils.smoothstep(elDeg, -7, 3);
    const golden = THREE.MathUtils.clamp(1 - Math.abs(elDeg - 4) / 14, 0, 1);
    G.uNight.value = night;
    G.uRain.value = this.rainAmt;
    G.uWetness.value = this.wetness;
    const u = this.sky.material.uniforms;
    (u.uSun.value as THREE.Vector3).copy(sd);
    (u.uMoon.value as THREE.Vector3).copy(moonDir);
    u.uCloud.value = this.cloud;
    u.uFlash.value = this.flash * 0.6;
    this.sky.position.copy(camera.position);

    // Sun light: warm at low elevation, dimmed by clouds; follows the focus for shadow coverage.
    const cloudDim = 1 - this.cloud * 0.72;
    const sunUp = THREE.MathUtils.smoothstep(elDeg, -2, 6);
    this.sun.intensity = 2.75 * sunUp * cloudDim + this.flash * 3;
    this.sun.color.setRGB(1, 0.93 - golden * 0.35, 0.86 - golden * 0.5);
    G.uSunDir.value.copy(this.sunDir);
    G.uSunCol.value.copy(this.sun.color).multiplyScalar(this.sun.intensity);
    const lightDir = sunUp > 0.01 ? sd : moonDir;
    // texel snapping keeps shadow edges stable while moving
    const texel = (shadowSize * 2) / Math.max(1, this.sun.shadow.mapSize.x);
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    this.sun.position.set(fx + lightDir.x * 400, lightDir.y * 400, fz + lightDir.z * 400);
    this.sun.target.position.set(fx, 0, fz);
    this.moon.intensity = 0.22 * night * (1 - this.cloud * 0.8);
    this.moon.position.copy(moonDir).multiplyScalar(400).add(focus);
    this.moon.target.position.copy(focus);
    this.hemi.intensity = 0.12 + 0.25 * (1 - night) * (1 - this.cloud * 0.4) + night * 0.06;
    this.hemi.color.setRGB(0.6 - night * 0.45, 0.72 - night * 0.55, 1.0 - night * 0.7);
    this.scene.environmentIntensity = THREE.MathUtils.lerp(0.85, 0.12, night) * (1 - this.cloud * 0.25) * (1 - golden * 0.3);
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.82, 1.65, night) + this.cloud * 0.2 + golden * 0.12;

    // Fog / atmospheric perspective coloured like the horizon.
    const day = 1 - night;
    const hz = new THREE.Color(0.55, 0.68, 0.82).multiplyScalar(day).add(new THREE.Color(0.02, 0.025, 0.04).multiplyScalar(night));
    hz.lerp(new THREE.Color(0.95, 0.55, 0.3), golden * 0.45 * (1 - this.cloud));
    const gray = hz.r * 0.3 + hz.g * 0.55 + hz.b * 0.15;
    hz.lerp(new THREE.Color(gray, gray, gray), this.cloud * 0.6);
    this.fog.color.copy(hz);
    this.fog.density = 0.00085 + this.cloud * 0.0005 + this.rainAmt * 0.0028 + night * 0.0003;
    this.scene.background = null;

    // Rain streaks follow the camera.
    this.rain.visible = this.rainAmt > 0.02;
    ((this.rain.material as THREE.ShaderMaterial).uniforms.uCam.value as THREE.Vector3).copy(camera.position);

    // Refresh the reflection/IBL environment when lighting changed noticeably.
    this.envTimer -= dt;
    const key = `${Math.round(this.timeOfDay * 6)}_${Math.round(this.cloud * 8)}_${Math.round(this.rainAmt * 4)}`;
    // (also refresh while paused, e.g. when the time/weather is changed from a menu)
    if ((this.envTimer <= 0 || dt === 0) && key !== this.lastEnvKey) this.refreshEnvironment(key);
  }

  refreshEnvironment(key = '') {
    this.envTimer = 2;
    this.lastEnvKey = key;
    this.envSky.position.set(0, 0, 0);
    const prevTone = this.renderer.toneMapping;
    this.renderer.toneMapping = THREE.NoToneMapping;
    const rt = this.pmrem.fromScene(this.envScene, 0, 1, 6000);
    this.renderer.toneMapping = prevTone;
    this.envRT?.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
  }

  dispose() {
    this.envRT?.dispose();
    this.pmrem.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
  }
}
