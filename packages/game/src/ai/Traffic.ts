import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { GraphicsSettings } from '@sd/shared';
import type { Path, RoadNetwork } from './RoadNetwork.ts';
import { type Physics, ALL, LAYER, groups } from '../physics/Physics.ts';
import { type VehicleModel, PAINTS, SPECS } from '../vehicles/vehicleMeshes.ts';
import type { AudioEngine } from '../audio/Audio.ts';
import type { Vehicle } from '../vehicles/Vehicle.ts';

const MODELS: { m: VehicleModel; w: number }[] = [
  { m: 'sedan', w: 26 },
  { m: 'compact', w: 18 },
  { m: 'suv', w: 14 },
  { m: 'concho', w: 11 },
  { m: 'motoconcho', w: 9 },
  { m: 'moto', w: 7 },
  { m: 'pickup', w: 6 },
  { m: 'bigsuv', w: 5 },
  { m: 'guagua', w: 3 },
  { m: 'delivery', w: 3 },
];
const TOTAL_W = MODELS.reduce((a, b) => a + b.w, 0);

interface Agent {
  id: number;
  model: VehicleModel;
  path: Path;
  s: number;
  v: number;
  desire: number;
  half: number;
  width: number;
  moto: boolean;
  next: Path | null;
  holding: Path | null;
  color: THREE.Color;
  roll: number;
  braking: boolean;
  stuck: number;
  wait: number;
  honkCd: number;
  stopAt: number;
  stopTimer: number;
  weave: number;
  body: RAPIER.RigidBody | null;
  wreck: number;
  x: number;
  z: number;
  yaw: number;
}

/** Autonomous city traffic on the lane graph: IDM car-following, signals, junction conflicts, spawn ring. */
export class Traffic {
  private agents: Agent[] = [];
  private byPath = new Map<number, Agent[]>();
  private nodeHold = new Map<number, Set<Agent>>();
  private meshes = new Map<VehicleModel, { mesh: THREE.InstancedMesh; state: THREE.InstancedBufferAttribute }>();
  private nextId = 1;
  private time = 0;
  private spawnTimer = 0;
  private acc = 0;
  private maxAgents: number;
  private density: number;
  private bodyPool: RAPIER.RigidBody[] = [];
  private tmp = { x: 0, z: 0, dx: 0, dz: 0 };
  private signalMesh: THREE.InstancedMesh | null = null;
  private signalHeads: { x: number; y: number; z: number; node: number; edge: number; rot: number }[] = [];
  private camPos = new THREE.Vector3();
  private camDir = new THREE.Vector3();
  stuckCount = 0;
  readonly radius = 260;

  constructor(private readonly scene: THREE.Scene, private readonly net: RoadNetwork, private readonly physics: Physics, geos: Record<VehicleModel, THREE.BufferGeometry>, material: THREE.Material, private readonly audio: AudioEngine, gs: GraphicsSettings) {
    this.density = gs.trafficDensity;
    this.maxAgents = Math.round(90 * this.density) + 10;
    for (const { m } of MODELS) {
      const geo = geos[m].clone();
      const cap = 80;
      const state = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      state.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aState', state);
      const mesh = new THREE.InstancedMesh(geo, material, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = gs.shadows !== 'off';
      mesh.receiveShadow = true;
      scene.add(mesh);
      this.meshes.set(m, { mesh, state });
    }
    for (let i = 0; i < 18; i++) {
      const b = physics.world.createRigidBody(physics.R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -100, 0));
      physics.world.createCollider(physics.R.ColliderDesc.cuboid(0.9, 0.6, 2.2).setCollisionGroups(groups(LAYER.TRAFFIC, ALL)), b);
      this.bodyPool.push(b);
    }
  }

  get count() {
    return this.agents.length;
  }

  setDensity(d: number) {
    this.density = d;
    this.maxAgents = Math.round(90 * d) + 10;
  }

  onChunksChanged() {
    /* signal heads are refreshed lazily in update() */
    this.signalHeads = [];
  }

  private pickModel(): VehicleModel {
    let r = Math.random() * TOTAL_W;
    for (const m of MODELS) if ((r -= m.w) <= 0) return m.m;
    return 'sedan';
  }

  private addToPath(a: Agent, p: Path) {
    a.path = p;
    const list = this.byPath.get(p.id) ?? this.byPath.set(p.id, []).get(p.id)!;
    list.push(a);
  }

  private removeFromPath(a: Agent) {
    const list = this.byPath.get(a.path.id);
    if (list) list.splice(list.indexOf(a), 1);
  }

  private chooseNext(p: Path): Path | null {
    if (!p.next.length) return null;
    const opts = p.next.filter((c) => c.turn !== 'uturn');
    const list = opts.length ? opts : p.next;
    const w = list.map((c) => (c.turn === 'straight' ? 3 : 1.4) * (c.outLane?.sink ? 0.4 : 1));
    let r = Math.random() * w.reduce((x, y) => x + y, 0);
    for (let i = 0; i < list.length; i++) if ((r -= w[i]) <= 0) return list[i];
    return list[0];
  }

  private spawn(player: THREE.Vector3) {
    for (let tries = 0; tries < 12; tries++) {
      const lane = this.net.lanes[Math.floor(Math.random() * this.net.lanes.length)];
      if (lane.length < 25) continue;
      const s = 5 + Math.random() * (lane.length - 10);
      this.net.sample(lane, s, this.tmp);
      const d = Math.hypot(this.tmp.x - player.x, this.tmp.z - player.z);
      if (d < 70 || d > this.radius) continue;
      // don't pop in on screen nearby
      const tx = this.tmp.x - this.camPos.x;
      const tz = this.tmp.z - this.camPos.z;
      const td = Math.hypot(tx, tz);
      if (td < 160 && (tx * this.camDir.x + tz * this.camDir.z) / td > 0.3) continue;
      const others = this.byPath.get(lane.id) ?? [];
      if (others.some((o) => Math.abs(o.s - s) < 14)) continue;
      const model = this.pickModel();
      const spec = SPECS[model];
      const p = PAINTS[Math.floor(Math.random() * PAINTS.length)];
      const moto = spec.twoWheels;
      const a: Agent = {
        id: this.nextId++, model, path: lane, s, v: lane.speed * 0.6, desire: (moto ? 1.15 : 0.85) + Math.random() * 0.3, half: spec.L / 2, width: spec.W, moto, next: this.chooseNext(lane), holding: null,
        color: model === 'concho' ? new THREE.Color().setRGB(...PAINTS[Math.random() < 0.5 ? 0 : 3]) : new THREE.Color().setRGB(p[0], p[1], p[2]),
        roll: 0, braking: false, stuck: 0, wait: 0, honkCd: 5 + Math.random() * 10, stopAt: model === 'guagua' || model === 'concho' ? Math.random() * lane.length : -1, stopTimer: 0, weave: Math.random() * 6.28, body: null, wreck: 0, x: this.tmp.x, z: this.tmp.z, yaw: 0,
      };
      this.addToPath(a, lane);
      this.agents.push(a);
      return;
    }
  }

  private despawn(a: Agent) {
    this.removeFromPath(a);
    if (a.holding) this.nodeHold.get(a.holding.node!)?.delete(a);
    if (a.body) {
      if (a.wreck > 0) {
        this.physics.world.removeRigidBody(a.body);
      } else {
        a.body.setNextKinematicTranslation({ x: 0, y: -100, z: 0 });
        this.bodyPool.push(a.body);
      }
      a.body = null;
    }
    this.agents.splice(this.agents.indexOf(a), 1);
  }

  /** Distance to the closest obstacle ahead (leader, stop line, player) and its speed. */
  private leader(a: Agent, player: THREE.Vector3, playerVeh: Vehicle | null): { gap: number; v: number; red: boolean } {
    let gap = Infinity;
    let lv = 0;
    let red = false;
    const list = this.byPath.get(a.path.id) ?? [];
    for (const o of list) if (o !== a && o.s > a.s && o.s - a.s - o.half - a.half < gap) ((gap = o.s - a.s - o.half - a.half), (lv = o.v));
    const remaining = a.path.length - a.s;
    if (a.path.kind === 'lane' && remaining < 60) {
      const node = a.path.to!;
      // stop line: red light / blocked junction
      let mustStop = false;
      if (this.net.signals.has(node)) {
        const st = this.net.signalState(node, a.path.edge!.id, this.time);
        if (st === 'red' || (st === 'yellow' && remaining > (a.v * a.v) / 6 + 2)) {
          mustStop = true;
          red = true;
        }
      }
      if (!mustStop && a.next && !this.canEnter(a, a.next)) mustStop = true;
      if (mustStop && remaining - a.half - 0.5 < gap) ((gap = Math.max(0, remaining - a.half - 0.5)), (lv = 0));
      // look into the next path
      if (a.next && gap > remaining) {
        for (const o of this.byPath.get(a.next.id) ?? []) if (remaining + o.s - o.half - a.half < gap) ((gap = remaining + o.s - o.half - a.half), (lv = o.v));
        const after = a.next.next[0];
        if (after && gap > remaining + a.next.length)
          for (const o of this.byPath.get(after.id) ?? []) if (remaining + a.next.length + o.s - o.half - a.half < gap) ((gap = remaining + a.next.length + o.s - o.half - a.half), (lv = o.v));
      }
    } else if (a.path.kind === 'conn') {
      const out = a.path.next[0];
      for (const o of this.byPath.get(out.id) ?? []) if (remaining + o.s - o.half - a.half < gap) ((gap = remaining + o.s - o.half - a.half), (lv = o.v));
    }
    // guagua / concho passenger stop
    if (a.stopAt >= 0 && a.path.kind === 'lane' && a.stopTimer <= 0 && a.s < a.stopAt && a.stopAt - a.s < 25 && a.stopAt - a.s < gap) ((gap = a.stopAt - a.s), (lv = 0));
    // the player (on foot or driving) in our corridor
    const ppos = playerVeh ? playerVeh.position : player;
    const dx = ppos.x - a.x;
    const dz = ppos.z - a.z;
    const fx = Math.sin(a.yaw);
    const fz = Math.cos(a.yaw);
    const ahead = dx * fx + dz * fz;
    const lat = Math.abs(-dx * fz + dz * fx);
    const pHalf = playerVeh ? playerVeh.spec.L / 2 : 0.4;
    const pW = playerVeh ? playerVeh.spec.W / 2 : 0.4;
    if (ahead > 0 && ahead < 30 && lat < a.width / 2 + pW + 0.4) {
      const g = ahead - a.half - pHalf - 1.2;
      if (g < gap) ((gap = Math.max(0, g)), (lv = playerVeh ? Math.max(0, playerVeh.speed) : 0));
    }
    return { gap, v: lv, red };
  }

  /** Junction admission: no conflicting connector currently occupied. */
  private canEnter(a: Agent, conn: Path): boolean {
    const held = this.nodeHold.get(conn.node!);
    if (!held || !held.size) return true;
    for (const o of held) if (o !== a && o.holding && (o.holding.id === conn.id ? false : conn.conflicts!.has(o.holding.id))) return a.wait > 9 && !this.near(o, a, 6);
    return true;
  }

  private near(a: Agent, b: Agent, r: number) {
    return Math.hypot(a.x - b.x, a.z - b.z) < r;
  }

  fixedUpdate(dt: number, player: THREE.Vector3, playerVeh: Vehicle | null) {
    this.acc += dt;
    if (this.acc < 1 / 30) return;
    const h = this.acc;
    this.acc = 0;
    this.time += h;
    this.stuckCount = 0;
    for (const a of [...this.agents]) {
      if (a.wreck > 0) {
        a.wreck -= h;
        if (a.body) {
          const t = a.body.translation();
          a.x = t.x;
          a.z = t.z;
        }
        if (a.wreck <= 0) this.despawn(a);
        continue;
      }
      const L = this.leader(a, player, playerVeh);
      const v0 = Math.max(1.5, a.path.speed * a.desire * (a.path.kind === 'conn' ? 0.85 : 1));
      const A = a.moto ? 2.8 : 1.7;
      const B = 3.2;
      const T = a.moto ? 0.8 : 1.25;
      const s0 = a.moto ? 1.0 : 1.8;
      const dv = a.v - L.v;
      const sStar = s0 + Math.max(0, a.v * T + (a.v * dv) / (2 * Math.sqrt(A * B)));
      let acc = A * (1 - (a.v / v0) ** 4 - (L.gap === Infinity ? 0 : (sStar / Math.max(0.1, L.gap)) ** 2));
      acc = Math.max(-9, Math.min(A, acc));
      a.v = Math.max(0, a.v + acc * h);
      if (L.gap < 0.3) a.v = Math.min(a.v, 0.5);
      a.braking = acc < -1 || a.v < 0.3;
      const ds = a.v * h;
      a.s += ds;
      a.roll += ds;
      // waiting / honking (Dominican traffic etiquette)
      if (a.v < 0.2) {
        a.wait += h;
        a.stuck += h;
        if (!L.red && a.wait > 3.5 && (a.honkCd -= h) <= 0) {
          a.honkCd = 6 + Math.random() * 12;
          if (Math.random() < 0.45) this.audio.honkAt(a.x, a.z, a.moto);
        }
      } else {
        a.wait = 0;
        if (a.v > 1) a.stuck = 0;
      }
      if (L.red) a.stuck = 0;
      if (a.stopAt >= 0 && a.path.kind === 'lane' && Math.abs(a.s - a.stopAt) < 2 && a.v < 0.5 && a.stopTimer <= 0) a.stopTimer = 4 + Math.random() * 4;
      if (a.stopTimer > 0) {
        a.stopTimer -= h;
        if (a.stopTimer <= 0) a.stopAt = -1;
      }
      if (a.stuck > 12) this.stuckCount++;
      // advance along paths
      while (a.s >= a.path.length) {
        const over = a.s - a.path.length;
        const p = a.path;
        let np: Path | null = null;
        if (p.kind === 'lane') {
          if (p.sink || !a.next) break;
          np = a.next;
          (this.nodeHold.get(np.node!) ?? this.nodeHold.set(np.node!, new Set()).get(np.node!)!).add(a);
          a.holding = np;
          a.next = null;
        } else {
          np = p.next[0];
          if (a.holding) this.nodeHold.get(a.holding.node!)?.delete(a);
          a.holding = null;
          a.next = this.chooseNext(np);
          a.stopAt = (a.model === 'guagua' || a.model === 'concho') && Math.random() < 0.5 ? Math.random() * np.length : -1;
        }
        this.removeFromPath(a);
        this.addToPath(a, np);
        a.s = over;
      }
      if (a.path.kind === 'lane' && a.path.sink && a.s >= a.path.length - 1) {
        this.despawn(a);
        continue;
      }
      if (a.s > a.path.length) a.s = a.path.length;
      this.net.sample(a.path, a.s, this.tmp);
      let ox = 0;
      if (a.moto) {
        a.weave += h * 0.7;
        ox = Math.sin(a.weave) * 0.45 + 0.35;
      }
      a.x = this.tmp.x - this.tmp.dz * ox;
      a.z = this.tmp.z + this.tmp.dx * ox;
      const yaw = Math.atan2(this.tmp.dx, this.tmp.dz);
      let dy = yaw - a.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      a.yaw += dy * Math.min(1, h * 10);
      // kinematic collider for agents near the player
      const dp = Math.hypot(a.x - player.x, a.z - player.z);
      if (dp < 70 && !a.body && this.bodyPool.length) a.body = this.bodyPool.pop()!;
      else if (dp > 90 && a.body) {
        a.body.setNextKinematicTranslation({ x: 0, y: -100, z: 0 });
        this.bodyPool.push(a.body);
        a.body = null;
      }
      if (a.body) {
        a.body.setNextKinematicTranslation({ x: a.x, y: SPECS[a.model].H / 2 + 0.05, z: a.z });
        a.body.setNextKinematicRotation({ x: 0, y: Math.sin(a.yaw / 2), z: 0, w: Math.cos(a.yaw / 2) });
      }
      // stuck recovery: despawn when far or unseen
      if (a.stuck > 25 && (dp > 90 || !this.visible(a))) this.despawn(a);
      else if (dp > this.radius + 60) this.despawn(a);
    }
    // player hit an AI car hard → it becomes a physical wreck for a while
    if (playerVeh && Math.abs(playerVeh.speed) > 9) {
      for (const a of this.agents) {
        if (!a.body || a.wreck > 0) continue;
        if (Math.hypot(a.x - playerVeh.position.x, a.z - playerVeh.position.z) < (a.half + playerVeh.spec.L / 2) * 0.8) this.wreck(a, playerVeh);
      }
    }
    this.spawnTimer -= h;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.25;
      const want = this.maxAgents;
      for (let i = 0; i < 3 && this.agents.length < want; i++) this.spawn(player);
    }
  }

  private wreck(a: Agent, v: Vehicle) {
    if (!a.body) return;
    const R = this.physics.R;
    const t = a.body.translation();
    this.removeFromPath(a);
    this.byPath.set(-a.id, [a]);
    a.path = { ...a.path, id: -a.id };
    if (a.holding) this.nodeHold.get(a.holding.node!)?.delete(a);
    a.holding = null;
    // replace pooled kinematic body with a dynamic one
    a.body.setNextKinematicTranslation({ x: 0, y: -100, z: 0 });
    this.bodyPool.push(a.body);
    const s = SPECS[a.model];
    const b = this.physics.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(t.x, t.y + 0.2, t.z).setRotation({ x: 0, y: Math.sin(a.yaw / 2), z: 0, w: Math.cos(a.yaw / 2) }).setLinearDamping(0.8).setAngularDamping(1.5));
    this.physics.world.createCollider(R.ColliderDesc.cuboid(s.W / 2, s.H / 2 - 0.1, s.L / 2).setMass(s.twoWheels ? 200 : 1300).setCollisionGroups(groups(LAYER.TRAFFIC, ALL)), b);
    const f = v.forward.multiplyScalar(v.speed * 0.6);
    b.setLinvel({ x: f.x, y: 0.5, z: f.z }, true);
    a.body = b;
    a.wreck = 20;
    a.v = 0;
    this.audio.crash(0.8, new THREE.Vector3(t.x, t.y, t.z));
  }

  private visible(a: Agent): boolean {
    const tx = a.x - this.camPos.x;
    const tz = a.z - this.camPos.z;
    const d = Math.hypot(tx, tz) || 1;
    return d < 200 && (tx * this.camDir.x + tz * this.camDir.z) / d > 0.2;
  }

  update(dt: number, camera: THREE.Camera) {
    this.camPos.copy(camera.position);
    camera.getWorldDirection(this.camDir);
    this.camDir.y = 0;
    this.camDir.normalize();
    const counts = new Map<VehicleModel, number>();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const one = new THREE.Vector3(1, 1, 1);
    const pos = new THREE.Vector3();
    for (const a of this.agents) {
      const entry = this.meshes.get(a.model)!;
      const i = counts.get(a.model) ?? 0;
      if (i >= entry.mesh.instanceMatrix.count) continue;
      counts.set(a.model, i + 1);
      if (a.wreck > 0 && a.body) {
        const t = a.body.translation();
        const r = a.body.rotation();
        pos.set(t.x, t.y - SPECS[a.model].H / 2 + 0.1, t.z);
        q.set(r.x, r.y, r.z, r.w);
      } else {
        pos.set(a.x, 0, a.z);
        const lean = a.moto ? THREE.MathUtils.clamp(-a.v * 0.03 * Math.sin(a.weave * 2), -0.3, 0.3) : 0;
        q.setFromEuler(e.set(0, a.yaw, lean, 'YXZ'));
      }
      m.compose(pos, q, one);
      entry.mesh.setMatrixAt(i, m);
      entry.mesh.setColorAt(i, a.color);
      entry.state.setXYZW(i, a.roll, a.braking ? 1 : 0, 0, 0);
    }
    for (const [model, { mesh, state }] of this.meshes) {
      mesh.count = counts.get(model) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      state.needsUpdate = true;
    }
    this.updateSignals();
    void dt;
  }

  /** Traffic-light lamps (red/yellow/green discs) for signals in loaded chunks. */
  private updateSignals() {
    if (!this.signalHeads.length) {
      const flat = (this.scene.userData.signalSource as (() => number[]) | undefined)?.() ?? [];
      for (let i = 0; i < flat.length; i += 5) {
        const [x, z, rot, node, edge] = flat.slice(i, i + 5);
        // head on the mast arm (local -3.4, 4.6, +0.26) and a lower head on the pole (0.18, 2.9, +0.24)
        for (const [lx, ly] of [[-3.4, 4.6], [0.18, 2.9]]) {
          const c = Math.cos(rot);
          const s = Math.sin(rot);
          this.signalHeads.push({ x: x + lx * c + 0.27 * s, y: 0.15 + ly, z: z - lx * s + 0.27 * c, node, edge, rot });
        }
      }
      if (this.signalMesh) {
        this.scene.remove(this.signalMesh);
        this.signalMesh.dispose();
        this.signalMesh = null;
      }
      if (!this.signalHeads.length) return;
      const geo = new THREE.CircleGeometry(0.11, 12);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      this.signalMesh = new THREE.InstancedMesh(geo, mat, this.signalHeads.length * 3);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      this.signalHeads.forEach((hd, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hd.rot);
        for (let k = 0; k < 3; k++) {
          m.compose(new THREE.Vector3(hd.x, hd.y + 0.3 - k * 0.3, hd.z), q, new THREE.Vector3(1, 1, 1));
          this.signalMesh!.setMatrixAt(i * 3 + k, m);
        }
      });
      this.scene.add(this.signalMesh);
    }
    if (!this.signalMesh) return;
    const on = [new THREE.Color(6, 0.3, 0.2), new THREE.Color(6, 3.2, 0.2), new THREE.Color(0.3, 6, 1.6)];
    const off = [new THREE.Color(0.12, 0.02, 0.02), new THREE.Color(0.12, 0.08, 0.01), new THREE.Color(0.01, 0.1, 0.04)];
    this.signalHeads.forEach((hd, i) => {
      const st = this.net.signalState(hd.node, hd.edge, this.time);
      const lit = st === 'red' ? 0 : st === 'yellow' ? 1 : 2;
      for (let k = 0; k < 3; k++) this.signalMesh!.setColorAt(i * 3 + k, k === lit ? on[k] : off[k]);
    });
    if (this.signalMesh.instanceColor) this.signalMesh.instanceColor.needsUpdate = true;
  }

  /** Nearest agents (for spatial engine audio). */
  nearest(x: number, z: number, n: number): { x: number; z: number; v: number; moto: boolean; id: number }[] {
    return this.agents
      .map((a) => ({ x: a.x, z: a.z, v: a.v, moto: a.moto, id: a.id, d: (a.x - x) ** 2 + (a.z - z) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, n);
  }

  /** Positions of all agents (for pedestrians to avoid cars). */
  agentsNear(x: number, z: number, r: number): { x: number; z: number; v: number; yaw: number }[] {
    const out: { x: number; z: number; v: number; yaw: number }[] = [];
    for (const a of this.agents) if (Math.abs(a.x - x) < r && Math.abs(a.z - z) < r) out.push({ x: a.x, z: a.z, v: a.v, yaw: a.yaw });
    return out;
  }
}
