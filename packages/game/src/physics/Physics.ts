import RAPIER from '@dimforge/rapier3d-compat';

export type R = typeof RAPIER;

/** Collision layers (Rapier interaction groups: membership << 16 | filter). */
export const LAYER = {
  STATIC: 0x0001,
  PLAYER: 0x0002,
  VEHICLE: 0x0004,
  TRAFFIC: 0x0008,
  PROP: 0x0010,
  WATER_FLOOR: 0x0020,
} as const;
export const groups = (member: number, filter: number) => ((member & 0xffff) << 16) | (filter & 0xffff);
export const ALL = 0xffff;

/** Thin wrapper over a Rapier world with helpers for static city colliders. */
export class Physics {
  readonly world: RAPIER.World;
  readonly R = RAPIER;
  readonly events: RAPIER.EventQueue;
  private fixedBody: RAPIER.RigidBody;
  readonly step_ = 1 / 60;

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = this.step_;
    this.events = new RAPIER.EventQueue(true);
    this.fixedBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  }

  static async create(): Promise<Physics> {
    await RAPIER.init();
    return new Physics();
  }

  addTrimesh(positions: Float32Array, indices: Uint32Array): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.trimesh(positions, indices).setCollisionGroups(groups(LAYER.STATIC, ALL)).setFriction(0.9);
    return this.world.createCollider(desc, this.fixedBody);
  }

  addCuboid(x: number, y: number, z: number, hx: number, hy: number, hz: number, rotY = 0, layer: number = LAYER.STATIC): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(x, y, z)
      .setRotation({ x: 0, y: Math.sin(rotY / 2), z: 0, w: Math.cos(rotY / 2) })
      .setCollisionGroups(groups(layer, ALL));
    return this.world.createCollider(desc, this.fixedBody);
  }

  addCylinder(x: number, y: number, z: number, r: number, hh: number, layer: number = LAYER.PROP): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cylinder(hh, r).setTranslation(x, y + hh, z).setCollisionGroups(groups(layer, ALL));
    return this.world.createCollider(desc, this.fixedBody);
  }

  remove(colliders: RAPIER.Collider[]) {
    for (const c of colliders) if (this.world.getCollider(c.handle)) this.world.removeCollider(c, false);
  }

  step() {
    this.world.step(this.events);
  }

  /** Ray against static geometry (and optionally props); returns hit distance or null. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number, filter: number = LAYER.STATIC): number | null {
    const ray = new RAPIER.Ray({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz });
    const hit = this.world.castRay(ray, max, true, undefined, groups(ALL, filter));
    return hit ? hit.timeOfImpact : null;
  }
}
