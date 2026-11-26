import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { type Physics, ALL, LAYER, groups } from '../physics/Physics.ts';
import type { Input } from '../engine/Input.ts';
import type { CameraRig } from '../camera/CameraRig.ts';
import type { VehicleManager } from '../vehicles/VehicleManager.ts';
import type { WorldStreamer } from '../world/WorldStreamer.ts';
import type { AudioEngine } from '../audio/Audio.ts';
import { ANIM, Crowd } from '../characters/Humanoid.ts';
import type { Vehicle } from '../vehicles/Vehicle.ts';

export interface Interactable {
  id: string;
  position: THREE.Vector3;
  radius: number;
  label: string;
  enabled: () => boolean;
  action: () => void;
}

type State = 'foot' | 'vehicle' | 'down';

const WALK = 1.8;
const JOG = 3.7;
const SPRINT = 6.6;
const CROUCH = 1.2;
const GRAVITY = -19;

/** The player character: kinematic capsule controller, animation, interactions and vehicle use. */
export class Player {
  readonly position = new THREE.Vector3();
  heading = 0;
  speed = 0;
  grounded = false;
  crouching = false;
  state: State = 'foot';
  private body!: RAPIER.RigidBody;
  private collider!: RAPIER.Collider;
  private ctrl: RAPIER.KinematicCharacterController;
  private vel = new THREE.Vector3();
  private vy = 0;
  private phase = 0;
  private lastStep = 0;
  private downTimer = 0;
  private safe = new THREE.Vector3();
  private safeTimer = 0;
  private enterTimer = 0;
  private walkToggle = false;
  readonly crowd: Crowd;
  readonly interactables: Interactable[] = [];
  private currentPrompt: Interactable | null = null;
  private vehiclePrompt: { label: string; act: () => void } | null = null;
  onEnterVehicle?: (v: Vehicle) => void;
  onExitVehicle?: (v: Vehicle) => void;
  onDrown?: () => void;

  constructor(private readonly scene: THREE.Scene, private readonly physics: Physics, private readonly input: Input, private readonly rig: CameraRig, private readonly vehicles: VehicleManager, private readonly world: WorldStreamer, private readonly audio: AudioEngine, shadows: boolean) {
    const R = physics.R;
    this.ctrl = physics.world.createCharacterController(0.03);
    this.ctrl.enableAutostep(0.42, 0.18, false);
    this.ctrl.enableSnapToGround(0.4);
    this.ctrl.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
    this.ctrl.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    this.ctrl.setApplyImpulsesToDynamicBodies(true);
    this.ctrl.setCharacterMass(80);
    this.body = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 5, 0));
    this.collider = physics.world.createCollider(R.ColliderDesc.capsule(0.55, 0.3).setTranslation(0, 0.86, 0).setCollisionGroups(groups(LAYER.PLAYER, ALL & ~LAYER.PLAYER)), this.body);
    this.crowd = new Crowd(1, shadows);
    this.crowd.setLook(0, {
      skin: new THREE.Color('#a86b3c'),
      hairDark: 1,
      shirt: new THREE.Color('#1d4e89'),
      pants: new THREE.Color('#2b2b2b'),
      shorts: 0,
      height: 1.02,
      girth: 1.0,
      female: 0,
      longHair: 0,
    });
    this.crowd.mesh.frustumCulled = false;
    scene.add(this.crowd.mesh);
    vehicles.onImpact = (v, k) => {
      if (v === this.vehicles.active && v.spec.twoWheels && v.crashed) this.knockDown(v);
      if (v === this.vehicles.active) this.rig.addShake(Math.min(0.8, k * 6));
    };
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  spawn(x: number, y: number, z: number, heading: number) {
    this.teleport(x, y, z);
    this.heading = heading;
    this.rig.yaw = heading + Math.PI;
    this.safe.set(x, y, z);
  }

  teleport(x: number, y: number, z: number) {
    if (this.vehicles.active) this.leaveVehicle(true);
    this.body.setNextKinematicTranslation({ x, y, z });
    this.body.setTranslation({ x, y, z }, true);
    this.position.set(x, y, z);
    this.vy = 0;
    this.state = 'foot';
  }

  /** Text for the HUD interaction prompt. */
  prompt(): string | null {
    if (this.state === 'vehicle') {
      const v = this.vehicles.active!;
      return v.spec.twoWheels ? (v.crashed ? null : 'F — Bajarse del motor') : 'F — Salir del vehículo · V — Cámara';
    }
    if (this.currentPrompt) return `E — ${this.currentPrompt.label}`;
    if (this.vehiclePrompt) return `E — ${this.vehiclePrompt.label}`;
    return null;
  }

  private scanInteractions() {
    this.currentPrompt = null;
    this.vehiclePrompt = null;
    if (this.state !== 'foot') return;
    let best: Interactable | null = null;
    let bd = Infinity;
    for (const it of this.interactables) {
      if (!it.enabled()) continue;
      const d = it.position.distanceTo(this.position);
      if (d < it.radius && d < bd) {
        best = it;
        bd = d;
      }
    }
    if (best) {
      this.currentPrompt = best;
      return;
    }
    const v = this.vehicles.nearest(this.position, 3.2);
    if (v) {
      const fallen = v.spec.twoWheels && (v.crashed || v.upY < 0.8);
      this.vehiclePrompt = fallen ? { label: 'Levantar el motor', act: () => v.reset() } : { label: v.spec.twoWheels ? 'Montarse en el motor' : 'Entrar al vehículo', act: () => this.enterVehicle(v) };
      return;
    }
    const parked = this.world.parkedNear(this.position.x, this.position.z, 3.4);
    if (parked) {
      this.vehiclePrompt = {
        label: parked.model.startsWith('moto') || parked.model === 'delivery' ? 'Tomar el motor' : 'Entrar al vehículo',
        act: () => {
          this.world.hideParked(parked.mesh, parked.index);
          const v = this.vehicles.spawn(parked.model, parked.x, parked.y + 0.25, parked.z, parked.rot);
          this.enterVehicle(v);
        },
      };
    }
  }

  enterVehicle(v: Vehicle) {
    this.vehicles.enter(v);
    this.state = 'vehicle';
    this.enterTimer = 0.4;
    this.collider.setEnabled(false);
    this.rig.firstPerson = false;
    this.onEnterVehicle?.(v);
  }

  leaveVehicle(force = false) {
    const v = this.vehicles.active;
    if (!v) return;
    if (!force && Math.abs(v.speed) > 6 && !v.spec.twoWheels) return; // don't jump out at speed
    const p = v.exitPoint();
    this.vehicles.exit();
    this.collider.setEnabled(true);
    this.body.setTranslation({ x: p.x, y: p.y + 0.1, z: p.z }, true);
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y + 0.1, z: p.z });
    this.position.copy(p);
    this.heading = v.yaw;
    this.state = 'foot';
    this.vy = 0;
    this.onExitVehicle?.(v);
  }

  private knockDown(v: Vehicle) {
    const p = v.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0.2, (Math.random() - 0.5) * 2));
    this.vehicles.exit();
    this.collider.setEnabled(true);
    this.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
    this.position.copy(p);
    this.state = 'down';
    this.downTimer = 2.6;
    this.audio.crash(0.7, p);
    this.onExitVehicle?.(v);
  }

  fixedUpdate(dt: number) {
    if (this.state === 'vehicle') {
      const v = this.vehicles.active!;
      const inp = this.input;
      v.input = {
        throttle: inp.held('forward') ? 1 : 0,
        brake: inp.held('backward') ? 1 : 0,
        steer: (inp.held('right') ? 1 : 0) - (inp.held('left') ? 1 : 0),
        handbrake: inp.held('handbrake'),
      };
      return;
    }
    if (this.state === 'down') {
      this.downTimer -= dt;
      this.vy += GRAVITY * dt;
      this.move(new THREE.Vector3(0, this.vy * dt, 0));
      if (this.downTimer <= 0) this.state = 'foot';
      return;
    }
    // camera-relative movement
    const inp = this.input;
    if (inp.hit('crouch')) this.crouching = !this.crouching;
    const mx = (inp.held('right') ? 1 : 0) - (inp.held('left') ? 1 : 0);
    const mz = (inp.held('forward') ? 1 : 0) - (inp.held('backward') ? 1 : 0);
    const camF = this.rig.forward;
    const camR = new THREE.Vector3(-camF.z, 0, camF.x);
    const wish = camF.clone().multiplyScalar(mz).add(camR.multiplyScalar(mx));
    const moving = wish.lengthSq() > 0.01;
    if (moving) wish.normalize();
    const sprint = inp.held('sprint') && !this.crouching;
    const target = this.crouching ? CROUCH : sprint ? SPRINT : this.walkToggle ? WALK : JOG;
    const desired = wish.multiplyScalar(moving ? target : 0);
    const accel = this.grounded ? 14 : 3;
    this.vel.x += (desired.x - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (desired.z - this.vel.z) * Math.min(1, accel * dt);
    if (this.grounded && inp.hit('jump') && !this.crouching) {
      this.vy = 5.4;
      this.audio.footstep(1.2);
    }
    this.vy += GRAVITY * dt;
    if (this.grounded && this.vy < 0) this.vy = -2;
    const wasGrounded = this.grounded;
    const fall = this.vy;
    this.move(new THREE.Vector3(this.vel.x * dt, this.vy * dt, this.vel.z * dt));
    if (!wasGrounded && this.grounded && fall < -3.5) {
      const impact = Math.min(1, -fall / 12);
      this.audio.land(impact);
      this.rig.addShake(impact * 0.45);
    }
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.3) {
      const h = Math.atan2(this.vel.x, this.vel.z);
      let d = h - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * 12);
    }
    this.speed = hs;
  }

  private move(delta: THREE.Vector3) {
    this.ctrl.computeColliderMovement(this.collider, { x: delta.x, y: delta.y, z: delta.z }, undefined, groups(ALL, ALL & ~LAYER.PLAYER));
    const m = this.ctrl.computedMovement();
    const t = this.body.translation();
    const next = { x: t.x + m.x, y: t.y + m.y, z: t.z + m.z };
    this.body.setNextKinematicTranslation(next);
    this.grounded = this.ctrl.computedGrounded();
    if (this.grounded && this.vy < 0) this.vy = 0;
    // ceiling bonk
    if (m.y < delta.y * 0.5 && delta.y > 0) this.vy = 0;
    this.position.set(next.x, next.y, next.z);
  }

  update(dt: number) {
    const inp = this.input;
    this.scanInteractions();
    if (this.state === 'foot' && inp.hit('interact')) {
      if (this.currentPrompt) this.currentPrompt.action();
      else if (this.vehiclePrompt) this.vehiclePrompt.act();
    } else if (this.state === 'vehicle') {
      this.enterTimer -= dt;
      const v = this.vehicles.active!;
      if (this.enterTimer <= 0 && (inp.hit('exitVehicle') || (inp.hit('interact') && Math.abs(v.speed) < 2))) this.leaveVehicle();
      if (inp.hit('horn')) this.audio.horn(v.spec.twoWheels);
    }
    if (inp.hitCode('CapsLock')) this.walkToggle = !this.walkToggle;
    // keep a safe respawn point; fall into the sea → respawn
    this.safeTimer -= dt;
    if (this.state === 'foot' && this.grounded && this.safeTimer <= 0 && this.position.y > -0.5) {
      this.safe.copy(this.position);
      this.safeTimer = 1;
    }
    const sea = this.world.manifest.seaLevel;
    if (this.state !== 'vehicle' && this.position.y < sea - 0.2) {
      this.teleport(this.safe.x, this.safe.y + 0.5, this.safe.z);
      this.onDrown?.();
    }
    if (this.state === 'vehicle' && this.vehicles.active!.position.y < sea - 0.5) {
      const v = this.vehicles.active!;
      this.leaveVehicle(true);
      this.teleport(this.safe.x, this.safe.y + 0.5, this.safe.z);
      this.vehicles.remove(v);
      this.onDrown?.();
    }
    this.animate(dt);
  }

  private animate(dt: number) {
    const c = this.crowd;
    if (this.state === 'vehicle') {
      const v = this.vehicles.active!;
      const seat = v.seatWorld(new THREE.Vector3());
      const yaw = v.yaw;
      if (v.spec.twoWheels) {
        c.set(0, seat.x, seat.y - 0.6, seat.z, yaw, ANIM.RIDE, 0);
        // lean the rider with the bike
        const m = new THREE.Matrix4().compose(new THREE.Vector3(seat.x, seat.y - 0.6, seat.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, v.lean, 'YXZ')), new THREE.Vector3(1, 1, 1));
        c.mesh.setMatrixAt(0, m);
      } else c.set(0, seat.x, seat.y - 0.62, seat.z, yaw, ANIM.DRIVE, 0);
      this.position.copy(v.position);
      this.heading = yaw;
      c.commit(1);
      return;
    }
    let anim: number = ANIM.IDLE;
    let amount = 1;
    if (this.state === 'down') anim = ANIM.LIE;
    else if (!this.grounded && Math.abs(this.vy) > 1.5) anim = ANIM.JUMP;
    else if (this.crouching) anim = ANIM.CROUCH;
    else if (this.speed > 4.5) anim = ANIM.RUN;
    else if (this.speed > 0.25) {
      anim = ANIM.WALK;
      amount = Math.min(1, this.speed / 2.2);
    }
    if (anim === ANIM.WALK || anim === ANIM.RUN) {
      this.phase += dt * this.speed * (anim === ANIM.RUN ? 1.55 : 2.3);
      const stepIdx = Math.floor(this.phase / Math.PI);
      if (stepIdx !== this.lastStep && this.grounded) {
        this.lastStep = stepIdx;
        this.audio.footstep(anim === ANIM.RUN ? 1 : 0.6);
      }
    }
    c.set(0, this.position.x, this.position.y, this.position.z, this.heading, anim, this.phase, amount);
    c.commit(1);
  }
}
