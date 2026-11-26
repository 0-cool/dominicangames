import * as THREE from 'three';
import type { Physics } from '../physics/Physics.ts';
import type { AudioEngine } from '../audio/Audio.ts';
import type { WorldStreamer } from '../world/WorldStreamer.ts';
import { Vehicle } from './Vehicle.ts';
import type { VehicleModel } from './vehicleMeshes.ts';

/** Owns player-drivable vehicles: spawning, entering/exiting, impacts and engine audio. */
export class VehicleManager {
  readonly list: Vehicle[] = [];
  active: Vehicle | null = null;
  lastUsed: Vehicle | null = null;
  onImpact?: (v: Vehicle, strength: number) => void;
  private byCollider = new Map<number, Vehicle>();

  constructor(private readonly scene: THREE.Scene, private readonly physics: Physics, private readonly audio: AudioEngine, private readonly world: WorldStreamer) {}

  spawn(model: VehicleModel, x: number, y: number, z: number, yaw: number, paint?: THREE.ColorRepresentation): Vehicle {
    const v = new Vehicle(model, this.physics, x, y, z, yaw, paint);
    this.scene.add(v.group);
    this.list.push(v);
    this.byCollider.set(v.collider.handle, v);
    this.trim();
    return v;
  }

  private trim() {
    // keep at most 8 physical vehicles; drop the farthest unoccupied ones
    while (this.list.length > 8) {
      const ref = this.active?.position ?? this.list[this.list.length - 1].position;
      const cand = this.list.filter((v) => v !== this.active && v !== this.lastUsed && !v.userDataPinned).sort((a, b) => b.position.distanceTo(ref) - a.position.distanceTo(ref))[0];
      if (!cand) break;
      this.remove(cand);
    }
  }

  remove(v: Vehicle) {
    this.byCollider.delete(v.collider.handle);
    v.dispose();
    this.list.splice(this.list.indexOf(v), 1);
    if (this.lastUsed === v) this.lastUsed = null;
  }

  nearest(p: THREE.Vector3, r: number): Vehicle | null {
    let best: Vehicle | null = null;
    let bd = r;
    for (const v of this.list) {
      if (v.occupied) continue;
      const d = v.position.distanceTo(p);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  enter(v: Vehicle) {
    this.active = v;
    this.lastUsed = v;
    v.occupied = true;
    v.input = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this.audio.door(true, v.spec.twoWheels);
    this.audio.startEngine(v.model);
  }

  exit(): Vehicle | null {
    const v = this.active;
    if (!v) return null;
    v.occupied = false;
    v.input = { throttle: 0, brake: 0, steer: 0, handbrake: true };
    this.active = null;
    this.audio.stopEngine();
    this.audio.door(false, v.spec.twoWheels);
    return v;
  }

  fixedUpdate(dt: number) {
    for (const v of this.list) v.fixedUpdate(dt);
  }

  afterStep(dt: number) {
    for (const v of this.list) v.afterStep(dt);
  }

  onContactForce(h1: number, h2: number, force: number) {
    const v = this.byCollider.get(h1) ?? this.byCollider.get(h2);
    if (!v) return;
    const k = v.onImpact(force);
    if (k > 0.02) {
      this.audio.crash(Math.min(1, k * 4), v.position);
      this.onImpact?.(v, k);
      if (v.spec.twoWheels && Math.abs(v.speed) > 7 && k > 0.05) v.crash(Math.random() < 0.5 ? 1 : -1);
    }
  }

  update(dt: number, camera: THREE.Camera) {
    for (const v of this.list) v.update(dt);
    const a = this.active;
    if (a) this.audio.updateEngine(a.rpm / a.rpmMax, a.input.throttle, a.speed, a.spec.twoWheels);
    // despawn abandoned vehicles that fell into the sea
    for (const v of [...this.list]) if (v !== this.active && v.position.y < this.world.manifest.seaLevel - 4) this.remove(v);
    void camera;
  }
}

declare module './Vehicle.ts' {
  interface Vehicle {
    userDataPinned?: boolean;
  }
}
