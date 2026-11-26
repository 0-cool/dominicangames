import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { type Physics, ALL, LAYER, groups } from '../physics/Physics.ts';
import { type VehicleModel, PAINTS, SPECS, buildBody, buildWheel, vehicleMaterial, wheelPositions } from './vehicleMeshes.ts';

export interface DriveInput {
  throttle: number; // 0..1
  brake: number; // 0..1 (also reverse when stopped)
  steer: number; // -1 (left) .. 1 (right)
  handbrake: boolean;
}

interface Phys {
  mass: number;
  torque: number;
  gears: number[];
  final: number;
  idle: number;
  redline: number;
  drive: 'fwd' | 'rwd' | 'awd';
  slip: number;
  stiffness: number;
  rest: number;
  brake: number;
  latG: number;
  camDistance: number;
  camHeight: number;
  seat: [number, number, number];
}

/** Handling characteristics per model (arcade-simulation hybrid). */
export const PHYS: Record<VehicleModel, Phys> = {
  compact: { mass: 1100, torque: 135, gears: [3.4, 1.95, 1.35, 1.0, 0.8], final: 4.1, idle: 850, redline: 6400, drive: 'fwd', slip: 2.6, stiffness: 34, rest: 0.26, brake: 26, latG: 8.0, camDistance: 6.2, camHeight: 2.3, seat: [0.36, 0.42, -0.1] },
  sedan: { mass: 1350, torque: 195, gears: [3.3, 1.9, 1.3, 0.98, 0.78], final: 3.9, idle: 800, redline: 6500, drive: 'fwd', slip: 2.8, stiffness: 36, rest: 0.27, brake: 30, latG: 8.5, camDistance: 6.6, camHeight: 2.3, seat: [0.38, 0.42, -0.2] },
  concho: { mass: 1250, torque: 140, gears: [3.4, 1.95, 1.3, 0.95], final: 4.0, idle: 900, redline: 5800, drive: 'fwd', slip: 2.4, stiffness: 28, rest: 0.3, brake: 24, latG: 7.2, camDistance: 6.5, camHeight: 2.3, seat: [0.36, 0.42, -0.2] },
  suv: { mass: 1650, torque: 240, gears: [3.5, 2.0, 1.35, 1.0, 0.8], final: 3.9, idle: 800, redline: 6200, drive: 'awd', slip: 2.7, stiffness: 34, rest: 0.3, brake: 34, latG: 7.8, camDistance: 7, camHeight: 2.6, seat: [0.4, 0.62, -0.15] },
  bigsuv: { mass: 2500, torque: 480, gears: [3.6, 2.1, 1.4, 1.0, 0.75], final: 3.4, idle: 700, redline: 5600, drive: 'awd', slip: 2.6, stiffness: 32, rest: 0.32, brake: 46, latG: 7.2, camDistance: 7.8, camHeight: 2.9, seat: [0.42, 0.72, -0.3] },
  pickup: { mass: 1950, torque: 420, gears: [3.9, 2.2, 1.45, 1.0, 0.78], final: 3.7, idle: 750, redline: 4300, drive: 'rwd', slip: 2.5, stiffness: 30, rest: 0.32, brake: 38, latG: 7.0, camDistance: 7.6, camHeight: 2.8, seat: [0.4, 0.66, 0.45] },
  guagua: { mass: 4600, torque: 620, gears: [5.0, 2.9, 1.8, 1.2, 0.9], final: 4.3, idle: 650, redline: 3400, drive: 'rwd', slip: 2.4, stiffness: 30, rest: 0.33, brake: 80, latG: 5.5, camDistance: 11, camHeight: 3.8, seat: [0.55, 0.85, 2.7] },
  moto: { mass: 220, torque: 13, gears: [2.8, 1.75, 1.3, 1.08, 0.93], final: 9.5, idle: 1300, redline: 8500, drive: 'rwd', slip: 2.9, stiffness: 30, rest: 0.22, brake: 6, latG: 9.0, camDistance: 4.3, camHeight: 1.9, seat: [0, 0.62, -0.32] },
  motoconcho: { mass: 230, torque: 12, gears: [2.8, 1.75, 1.3, 1.08, 0.93], final: 9.5, idle: 1300, redline: 8000, drive: 'rwd', slip: 2.8, stiffness: 28, rest: 0.22, brake: 6, latG: 8.5, camDistance: 4.3, camHeight: 1.9, seat: [0, 0.62, -0.32] },
  delivery: { mass: 230, torque: 12, gears: [2.8, 1.75, 1.3, 1.08, 0.93], final: 9.5, idle: 1300, redline: 8000, drive: 'rwd', slip: 2.8, stiffness: 28, rest: 0.22, brake: 6, latG: 8.5, camDistance: 4.5, camHeight: 2.0, seat: [0, 0.62, -0.3] },
};

let NEXT_ID = 1;

export class Vehicle {
  readonly id = NEXT_ID++;
  readonly spec;
  readonly phys: Phys;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly ctrl: RAPIER.DynamicRayCastVehicleController;
  readonly group = new THREE.Group();
  private readonly visual = new THREE.Group();
  private readonly wheels: THREE.Mesh[] = [];
  private readonly wheelBase: THREE.Vector3[];
  private readonly yc: number;
  readonly material: THREE.MeshStandardMaterial;
  readonly position = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  private prevPos = new THREE.Vector3();
  private prevQuat = new THREE.Quaternion();
  input: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  speed = 0; // signed forward speed (m/s)
  rpm = 0;
  gear = 1; // 0 = reverse
  private shiftTimer = 0;
  private steer = 0;
  damage = 0;
  occupied = false;
  crashed = false;
  lean = 0;
  private yawRate = 0;
  private upsideTimer = 0;
  collisions = 0;
  lastImpact = 0;
  readonly driverEye = new THREE.Vector3();
  private interpAlpha = 1;

  constructor(readonly model: VehicleModel, private readonly physics: Physics, x: number, y: number, z: number, yaw: number, paint?: THREE.ColorRepresentation) {
    const R = physics.R;
    this.spec = SPECS[model];
    this.phys = PHYS[model];
    const s = this.spec;
    const p = this.phys;
    const two = s.twoWheels;
    const hx = two ? 0.22 : s.W / 2 - 0.04;
    const hy = two ? 0.32 : Math.max(0.3, (s.H - s.wheelR) * 0.38);
    const hz = s.L / 2 - (two ? 0.15 : 0.05);
    this.yc = s.wheelR + hy + (two ? 0.12 : 0.08);
    this.body = physics.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(x, y + this.yc, z)
        .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
        .setCanSleep(false)
        .setCcdEnabled(true)
        .setLinearDamping(0.05)
        .setAngularDamping(two ? 2 : 0.6),
    );
    const m = p.mass;
    const inertia = { x: (m / 12) * ((2 * hy) ** 2 + (2 * hz) ** 2), y: (m / 12) * ((2 * hx) ** 2 + (2 * hz) ** 2), z: (m / 12) * ((2 * hx) ** 2 + (2 * hy) ** 2) };
    this.collider = physics.world.createCollider(
      R.ColliderDesc.cuboid(hx, hy, hz)
        .setMassProperties(m, { x: 0, y: -hy * 0.7, z: 0.05 }, inertia, { x: 0, y: 0, z: 0, w: 1 })
        .setFriction(0.4)
        .setRestitution(0.1)
        .setCollisionGroups(groups(LAYER.VEHICLE, ALL))
        .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(m * 18),
      this.body,
    );
    if (two) this.body.setEnabledRotations(false, true, false, true);
    this.ctrl = physics.world.createVehicleController(this.body);
    this.ctrl.setIndexForwardAxis = 2;
    this.wheelBase = wheelPositions(model);
    for (const w of this.wheelBase) this.ctrl.addWheel({ x: w.x, y: w.y + p.rest - this.yc, z: w.z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, p.rest, s.wheelR);
    for (let i = 0; i < this.wheelBase.length; i++) {
      this.ctrl.setWheelSuspensionStiffness(i, p.stiffness);
      this.ctrl.setWheelSuspensionCompression(i, 2.6);
      this.ctrl.setWheelSuspensionRelaxation(i, 3.4);
      this.ctrl.setWheelFrictionSlip(i, p.slip);
      this.ctrl.setWheelSideFrictionStiffness(i, 1);
      this.ctrl.setWheelMaxSuspensionForce(i, (m * 9.81 * 2.2) / this.wheelBase.length * 2);
      this.ctrl.setWheelMaxSuspensionTravel(i, p.rest * 0.9);
    }
    // visuals
    this.material = vehicleMaterial(false);
    const pc = paint !== undefined ? new THREE.Color(paint) : new THREE.Color().setRGB(...PAINTS[Math.floor(Math.random() * PAINTS.length)]);
    (this.material.userData.uniforms.uPaint.value as THREE.Color).copy(pc);
    const bodyMesh = new THREE.Mesh(buildBody(model), this.material);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.visual.add(bodyMesh);
    const wg = buildWheel(model);
    for (const w of this.wheelBase) {
      const wm = new THREE.Mesh(wg, this.material);
      wm.castShadow = true;
      wm.position.copy(w);
      this.visual.add(wm);
      this.wheels.push(wm);
    }
    this.visual.position.y = -this.yc;
    this.group.add(this.visual);
    this.readTransform(true);
  }

  get camDistance() {
    return this.phys.camDistance;
  }
  get camHeight() {
    return this.phys.camHeight;
  }
  get rpmMax() {
    return this.phys.redline;
  }
  get yaw(): number {
    const e = new THREE.Euler().setFromQuaternion(this.quaternion, 'YXZ');
    return e.y;
  }
  get upY(): number {
    return new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion).y;
  }
  get gearLabel(): string {
    return this.gear === 0 ? 'R' : this.speed < 0.3 && this.input.throttle === 0 ? 'N' : String(this.gear);
  }
  get forward(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, 1).applyQuaternion(this.quaternion);
  }

  /** World-space seat position for the driver/rider model. */
  seatWorld(target: THREE.Vector3): THREE.Vector3 {
    const [sx, sy, sz] = this.phys.seat;
    return target.set(this.spec.twoWheels ? 0 : -sx, sy + 0.05, sz).applyQuaternion(this.quaternion).add(this.position);
  }

  /** Exit point: driver side for cars, left of the bike for motorcycles. */
  exitPoint(): THREE.Vector3 {
    const side = this.spec.twoWheels ? 1.0 : this.spec.W / 2 + 0.7;
    return new THREE.Vector3(side, 0, 0).applyQuaternion(this.quaternion).add(this.position).setY(this.position.y - this.yc + 0.95);
  }

  fixedUpdate(dt: number) {
    const p = this.phys;
    const s = this.spec;
    const lin = this.body.linvel();
    const fwd = this.forward;
    this.speed = lin.x * fwd.x + lin.y * fwd.y + lin.z * fwd.z;
    const v = Math.abs(this.speed);
    const inp = this.occupied && !this.crashed ? this.input : { throttle: 0, brake: 0, steer: 0, handbrake: !this.occupied };
    // ── automatic gearbox ──
    const wheelRpm = (v / s.wheelR) * (60 / (2 * Math.PI));
    if (this.gear === 0) {
      if (inp.throttle > 0 && this.speed > -0.5) this.gear = 1;
    } else if (inp.brake > 0 && v < 0.6 && inp.throttle === 0) this.gear = 0;
    const ratio = this.gear === 0 ? 3.2 : p.gears[this.gear - 1];
    this.rpm = Math.max(p.idle, Math.min(p.redline * 1.02, wheelRpm * ratio * p.final));
    if (this.occupied && inp.throttle < 0.05 && v < 1) this.rpm = p.idle + (this.rpm - p.idle) * 0.5;
    this.shiftTimer -= dt;
    if (this.gear > 0 && this.shiftTimer <= 0) {
      if (this.rpm > p.redline * 0.9 && this.gear < p.gears.length) {
        this.gear++;
        this.shiftTimer = 0.45;
      } else if (this.rpm < p.redline * 0.38 && this.gear > 1) {
        this.gear--;
        this.shiftTimer = 0.3;
      }
    }
    // ── engine & brakes ──
    const rpmN = (this.rpm - p.idle) / (p.redline - p.idle);
    const torque = p.torque * (0.62 + 0.38 * Math.sin(Math.PI * Math.min(1, Math.max(0, rpmN * 0.9 + 0.1))));
    const health = this.damage > 0.75 ? 0.55 : 1;
    let force = 0;
    let brake = 0;
    if (this.gear === 0) {
      force = inp.brake > 0 && this.speed > -7 ? -torque * ratio * p.final * 0.85 / s.wheelR * inp.brake : 0;
      if (inp.throttle > 0) brake = p.brake;
    } else {
      const cut = this.shiftTimer > 0.25 || this.rpm >= p.redline ? 0.15 : 1;
      force = inp.throttle * torque * ratio * p.final * 0.85 / s.wheelR * cut * health;
      if (inp.brake > 0) brake = p.brake * inp.brake;
    }
    if (inp.throttle === 0 && inp.brake === 0) brake = p.brake * 0.04; // engine braking / rolling resistance
    const n = this.wheelBase.length;
    const two = s.twoWheels;
    const drivenIdx = two ? [1] : p.drive === 'fwd' ? [0, 1] : p.drive === 'rwd' ? [2, 3] : [0, 1, 2, 3];
    for (let i = 0; i < n; i++) {
      this.ctrl.setWheelEngineForce(i, drivenIdx.includes(i) ? force / drivenIdx.length : 0);
      const rear = two ? i === 1 : i >= 2;
      this.ctrl.setWheelBrake(i, inp.handbrake && rear ? p.brake * 1.6 : brake);
      this.ctrl.setWheelFrictionSlip(i, inp.handbrake && rear ? p.slip * 0.45 : p.slip * (1 - this.damage * 0.15));
    }
    // ── speed-sensitive steering limited by available lateral grip ──
    const wb = s.wheelbase;
    const maxSteer = Math.min(two ? 0.55 : 0.62, (p.latG * wb) / Math.max(1, v * v));
    const target = -inp.steer * maxSteer;
    const rate = (two ? 2.4 : 3.2) * dt;
    this.steer += THREE.MathUtils.clamp(target - this.steer, -rate, rate);
    for (let i = 0; i < (two ? 1 : 2); i++) this.ctrl.setWheelSteering(i, this.steer);
    // aerodynamic drag + rolling resistance
    this.body.resetForces(true);
    const drag = 0.38 * (two ? 0.6 : s.W * s.H * 0.5) * v;
    this.body.addForce({ x: -lin.x * drag - lin.x * p.mass * 0.012, y: -v * v * 0.05 * p.mass * 0.01, z: -lin.z * drag - lin.z * p.mass * 0.012 }, true);
    this.ctrl.updateVehicle(dt, undefined, groups(ALL, LAYER.STATIC | LAYER.PROP | LAYER.TRAFFIC | LAYER.WATER_FLOOR));
    this.prevPos.copy(this.position);
    this.prevQuat.copy(this.quaternion);
  }

  afterStep(dt: number) {
    this.readTransform(false);
    const av = this.body.angvel();
    this.yawRate = av.y;
    // flip recovery (cars) when stuck on the roof/side at low speed
    if (!this.spec.twoWheels && this.upY < 0.35 && Math.abs(this.speed) < 2) {
      this.upsideTimer += dt;
      if (this.upsideTimer > 2.5) this.reset();
    } else this.upsideTimer = 0;
  }

  readTransform(snap: boolean) {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.position.set(t.x, t.y, t.z);
    this.quaternion.set(r.x, r.y, r.z, r.w);
    if (snap) {
      this.prevPos.copy(this.position);
      this.prevQuat.copy(this.quaternion);
    }
  }

  /** Put the vehicle back on its wheels (also used to pick up a fallen motorcycle). */
  reset() {
    const yaw = this.yaw;
    const t = this.body.translation();
    this.body.setTranslation({ x: t.x, y: Math.max(t.y, 0) + 1.0, z: t.z }, true);
    this.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    if (this.spec.twoWheels) this.body.setEnabledRotations(false, true, false, true);
    this.crashed = false;
    this.lean = 0;
    this.upsideTimer = 0;
    this.readTransform(true);
  }

  /** Motorcycle loses balance: unlock roll/pitch and topple. */
  crash(dir = 1) {
    if (!this.spec.twoWheels || this.crashed) return;
    this.crashed = true;
    this.body.setEnabledRotations(true, true, true, true);
    const f = this.forward;
    this.body.applyTorqueImpulse({ x: f.x * 90 * dir, y: 0, z: f.z * 90 * dir }, true);
  }

  onImpact(force: number) {
    const k = force / (this.phys.mass * 400);
    this.damage = Math.min(1, this.damage + k * 0.6);
    this.collisions++;
    this.lastImpact = performance.now();
    return k;
  }

  update(dt: number) {
    this.group.position.copy(this.position);
    this.group.quaternion.copy(this.quaternion);
    const s = this.spec;
    // lean for motorcycles: physically motivated lean = atan(v·ω/g) + counter-steer flick
    if (s.twoWheels && !this.crashed) {
      const target = THREE.MathUtils.clamp(Math.atan2(this.speed * this.yawRate, 9.81), -0.75, 0.75);
      this.lean += (target - this.lean) * Math.min(1, dt * 6);
      this.visual.rotation.z = this.lean;
      this.visual.position.y = -this.yc - Math.abs(Math.sin(this.lean)) * 0.06;
    }
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      const base = this.wheelBase[i];
      const susp = this.ctrl.wheelSuspensionLength(i) ?? this.phys.rest;
      w.position.set(base.x, base.y + (this.phys.rest - susp), base.z);
      const rot = this.ctrl.wheelRotation(i) ?? 0;
      const steer = i < (s.twoWheels ? 1 : 2) ? this.ctrl.wheelSteering(i) ?? 0 : 0;
      w.rotation.set(rot, steer, 0, 'YXZ');
    }
    // driver eye for cockpit camera
    const [sx, sy, sz] = this.phys.seat;
    this.driverEye.set(s.twoWheels ? 0 : -sx, sy + 0.72, sz + (s.twoWheels ? 0.05 : 0.1)).applyQuaternion(this.quaternion).add(this.position);
    const u = this.material.userData.uniforms;
    u.uBrake.value = this.input.brake > 0 && this.gear !== 0 && this.speed > 0.5 ? 1 : 0;
    u.uLights.value = this.occupied ? 1 : 0;
    void this.interpAlpha;
  }

  dispose() {
    this.physics.world.removeVehicleController(this.ctrl);
    this.physics.world.removeRigidBody(this.body);
    this.group.removeFromParent();
    this.material.dispose();
  }
}
