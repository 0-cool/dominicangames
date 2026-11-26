import * as THREE from 'three';

/** What the headlights need from the player's vehicle. */
export interface HeadlightCar {
  readonly position: THREE.Vector3;
  readonly forward: THREE.Vector3;
  readonly spec: { L: number; H: number; twoWheels: boolean };
}

const CONE_VERT = /* glsl */ `
  varying float vAxial; varying float vFacing;
  void main() {
    vAxial = position.z; // 0 at the lamp, 1 at the end of the beam
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vFacing = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }`;
const CONE_FRAG = /* glsl */ `
  uniform float uIntensity; uniform vec3 uColor; varying float vAxial; varying float vFacing;
  void main() {
    float a = uIntensity * pow(1.0 - vAxial, 1.7) * smoothstep(0.0, 0.06, vAxial) * vFacing * vFacing;
    gl_FragColor = vec4(uColor * a, a);
  }`;

/**
 * Headlight beams for the player's vehicle: one shadowless SpotLight that lights the road ahead plus a soft
 * additive light cone (more visible in rain). The light always exists (intensity 0 when off) so the number of
 * lights in the scene — and therefore every compiled shader — never changes at run time.
 * The light sits a little higher than the real lamps so the pool on the road reads well from the chase camera.
 */
export class Headlights {
  readonly group = new THREE.Group();
  readonly light = new THREE.SpotLight(0xfff1dc, 0, 85, THREE.MathUtils.degToRad(38), 0.85, 1.5);
  private readonly cone: THREE.Mesh<THREE.ConeGeometry, THREE.ShaderMaterial>;
  private level = 0;
  /** `auto` switches on at dusk, at night and in heavy rain; L forces on/off until the player leaves the vehicle. */
  mode: 'auto' | 'on' | 'off' = 'auto';
  /** Peak beam intensity (candela-like units used by three.js physical lights). */
  power = 520;

  constructor() {
    this.light.castShadow = false;
    this.group.add(this.light, this.light.target);
    const geo = new THREE.ConeGeometry(1, 1, 28, 1, true);
    geo.translate(0, -0.5, 0); // apex at the origin…
    geo.rotateX(-Math.PI / 2); // …opening towards +z
    const mat = new THREE.ShaderMaterial({
      uniforms: { uIntensity: { value: 0 }, uColor: { value: new THREE.Color(0xfff0d6) } },
      vertexShader: CONE_VERT,
      fragmentShader: CONE_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.cone = new THREE.Mesh(geo, mat);
    this.cone.frustumCulled = false;
    this.cone.renderOrder = 11;
    this.group.add(this.cone);
  }

  /** Whether the beams should be on right now (before smoothing). */
  wanted(night: number, rain: number): boolean {
    if (this.mode === 'on') return true;
    if (this.mode === 'off') return false;
    return night > 0.22 || rain > 0.55;
  }

  /** Flips the lights relative to what the player sees now; returns the new state. */
  toggle(night: number, rain: number): boolean {
    this.mode = this.wanted(night, rain) ? 'off' : 'on';
    return this.mode === 'on';
  }

  get on(): boolean {
    return this.level > 0.5;
  }

  update(dt: number, car: HeadlightCar | null, night: number, rain: number) {
    if (!car) this.mode = 'auto';
    const target = car && this.wanted(night, rain) ? 1 : 0;
    // lamps come on quickly and fade out a bit slower (filament-like)
    this.level += (target - this.level) * Math.min(1, dt * (target > this.level ? 14 : 6));
    const visible = this.level > 0.01 && !!car;
    // only the beam mesh is hidden: hiding the light would change the scene's light count and make every
    // material recompile (a visible hitch) each time the lights switch on or off
    this.cone.visible = visible;
    if (!visible || !car) {
      this.light.intensity = 0;
      return;
    }
    const f = car.forward;
    const moto = car.spec.twoWheels;
    const front = car.spec.L / 2 - (moto ? 0.35 : 0.25);
    const lampY = moto ? 1.0 : Math.min(0.75, car.spec.H * 0.45);
    // spot light: raised a little and aimed ~30 m down the road (wide, soft-edged low beam)
    this.light.position.copy(car.position).addScaledVector(f, front - 0.6).setY(car.position.y + lampY + 0.7);
    this.light.target.position.copy(car.position).addScaledVector(f, 30).setY(car.position.y - 0.4);
    this.light.target.updateMatrixWorld();
    this.light.intensity = this.power * this.level * (moto ? 0.6 : 1);
    this.light.angle = THREE.MathUtils.degToRad(moto ? 28 : 38);
    // visible beam: brighter in rain (light scattering) and at full night
    const lamp = car.position.clone().addScaledVector(f, front).setY(car.position.y + lampY);
    this.cone.position.copy(lamp);
    this.cone.lookAt(lamp.clone().addScaledVector(f, 10).setY(lamp.y - 0.9));
    const len = moto ? 11 : 15;
    const radius = moto ? 2.6 : 3.8;
    this.cone.scale.set(radius, radius, len);
    this.cone.material.uniforms.uIntensity.value = this.level * (0.05 + rain * 0.16) * Math.max(0.35, night);
  }
}
