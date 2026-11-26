import * as THREE from 'three';
import type { Physics } from '../physics/Physics.ts';
import { LAYER } from '../physics/Physics.ts';
import type { Input } from '../engine/Input.ts';

interface FollowTarget {
  position: THREE.Vector3;
  heading: number;
  crouching?: boolean;
}
interface VehicleTarget {
  position: THREE.Vector3;
  yaw: number;
  speed: number;
  camDistance: number;
  camHeight: number;
  driverEye: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

/** Third-person on-foot camera, chase/cockpit vehicle camera with collision, and a free photo camera. */
export class CameraRig {
  yaw = 0;
  pitch = -0.12;
  readonly target = new THREE.Vector3();
  private dist = 3.8;
  private vehYaw = 0;
  private idleOrbit = 0;
  private shake = 0;
  firstPerson = false;
  private photoPos = new THREE.Vector3();
  private photoLook = new THREE.Vector3();
  private smoothPos = new THREE.Vector3();
  private initialized = false;
  baseFov = 70;

  constructor(readonly camera: THREE.PerspectiveCamera, private readonly physics: Physics) {}

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(-1);
  }

  addShake(a: number) {
    this.shake = Math.min(1, this.shake + a);
  }

  setPhoto(pos: THREE.Vector3, look: THREE.Vector3) {
    this.photoPos.copy(pos);
    this.photoLook.copy(look);
    this.target.copy(look);
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
  }

  updatePhoto(dt: number, input: Input) {
    const yawDelta = -input.mouseDX * 0.0025;
    const pitchDelta = -input.mouseDY * 0.0025;
    const dir = this.photoLook.clone().sub(this.photoPos);
    if (yawDelta || pitchDelta) {
      const sph = new THREE.Spherical().setFromVector3(dir);
      sph.theta += yawDelta;
      sph.phi = THREE.MathUtils.clamp(sph.phi - pitchDelta, 0.2, Math.PI - 0.2);
      dir.setFromSpherical(sph);
      this.photoLook.copy(this.photoPos).add(dir);
    }
    const f = dir.clone().normalize();
    const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
    const v = new THREE.Vector3();
    if (input.held('forward')) v.add(f);
    if (input.held('backward')) v.sub(f);
    if (input.held('right')) v.add(r);
    if (input.held('left')) v.sub(r);
    v.multiplyScalar(dt * (input.held('sprint') ? 60 : 15));
    this.photoPos.add(v);
    this.photoLook.add(v);
    this.camera.position.copy(this.photoPos);
    this.camera.lookAt(this.photoLook);
    this.target.copy(this.photoLook);
  }

  private resolve(pivot: THREE.Vector3, desired: THREE.Vector3): THREE.Vector3 {
    const d = desired.clone().sub(pivot);
    const len = d.length();
    if (len < 1e-3) return desired;
    d.divideScalar(len);
    const hit = this.physics.raycast(pivot.x, pivot.y, pivot.z, d.x, d.y, d.z, len + 0.3, LAYER.STATIC);
    if (hit !== null && hit < len + 0.3) return pivot.clone().addScaledVector(d, Math.max(0.4, hit - 0.35));
    return desired;
  }

  update(dt: number, input: Input, foot: FollowTarget, veh: VehicleTarget | null) {
    const sens = 0.0022 * input.sensitivity;
    const mdx = input.mouseDX * sens;
    const mdy = input.mouseDY * sens * (input.invertY ? -1 : 1);
    if (input.hit('camera') && veh) this.firstPerson = !this.firstPerson;
    this.dist = THREE.MathUtils.clamp(this.dist + input.wheel * 0.5, 2.2, 7);
    const shakeV = new THREE.Vector3((Math.random() - 0.5) * this.shake * 0.25, (Math.random() - 0.5) * this.shake * 0.25, 0);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    if (!veh) {
      this.yaw -= mdx;
      this.pitch = THREE.MathUtils.clamp(this.pitch - mdy, -1.2, 0.9);
      const pivot = foot.position.clone().add(new THREE.Vector3(0, foot.crouching ? 1.15 : 1.55, 0));
      const back = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const desired = pivot.clone().addScaledVector(back, this.dist).addScaledVector(right, 0.45);
      const pos = this.resolve(pivot, desired);
      this.smoothPos.lerp(pos, this.initialized ? 1 - Math.exp(-dt * 25) : 1);
      this.initialized = true;
      this.camera.position.copy(this.smoothPos).add(shakeV);
      this.camera.lookAt(pivot.clone().addScaledVector(right, 0.45).addScaledVector(back, -4));
      this.target.copy(foot.position);
      this.camera.fov += (this.baseFov - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
      this.vehYaw = this.yaw;
      return;
    }
    this.target.copy(veh.position);
    if (this.firstPerson) {
      this.camera.position.copy(veh.driverEye).add(shakeV.multiplyScalar(0.3));
      this.yaw = THREE.MathUtils.clamp(this.yaw - mdx, -1.8, 1.8);
      if (!mdx) this.yaw *= Math.exp(-dt * 2);
      const look = new THREE.Vector3(Math.sin(this.yaw) * -1, -0.08 - this.pitch * 0.3, Math.cos(this.yaw)).applyQuaternion(veh.quaternion);
      this.camera.lookAt(veh.driverEye.clone().add(look));
      this.camera.fov += (this.baseFov + 8 - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
      return;
    }
    // chase camera: orbit offset decays back behind the vehicle
    if (Math.abs(mdx) > 1e-4 || Math.abs(mdy) > 1e-4) this.idleOrbit = 1.6;
    this.idleOrbit -= dt;
    let behind = veh.yaw + Math.PI;
    if (this.idleOrbit > 0) {
      this.vehYaw -= mdx;
      this.pitch = THREE.MathUtils.clamp(this.pitch - mdy, -0.9, 0.5);
    } else {
      // follow behind, smoothed
      let diff = behind - this.vehYaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.vehYaw += diff * Math.min(1, dt * (2 + Math.min(veh.speed, 20) * 0.15));
      this.pitch += (-0.16 - this.pitch) * Math.min(1, dt * 2);
    }
    behind = this.vehYaw;
    this.yaw = behind - Math.PI;
    const dist = veh.camDistance + Math.min(veh.speed, 40) * 0.04;
    const pivot = veh.position.clone().add(new THREE.Vector3(0, veh.camHeight * 0.6, 0));
    const desired = pivot.clone().add(new THREE.Vector3(Math.sin(behind) * Math.cos(this.pitch) * dist, veh.camHeight * 0.55 - Math.sin(this.pitch) * dist, Math.cos(behind) * Math.cos(this.pitch) * dist));
    const pos = this.resolve(pivot, desired);
    this.smoothPos.lerp(pos, 1 - Math.exp(-dt * 12));
    this.camera.position.copy(this.smoothPos).add(shakeV);
    this.camera.lookAt(pivot.clone().add(new THREE.Vector3(0, 0.5, 0)));
    const fov = this.baseFov + Math.min(veh.speed * 3.6, 140) * 0.09;
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3);
    this.camera.updateProjectionMatrix();
  }
}
