import * as THREE from 'three';
import type { GraphicsSettings } from '@sd/shared';
import type { RoadNetwork } from './RoadNetwork.ts';
import type { WorldStreamer } from '../world/WorldStreamer.ts';
import type { AudioEngine } from '../audio/Audio.ts';
import type { Vehicle } from '../vehicles/Vehicle.ts';
import { ANIM, Crowd, randomLook } from '../characters/Humanoid.ts';
import { mulberry } from '../world/geomkit.ts';

interface Line {
  pts: Float32Array;
  cum: Float32Array;
  len: number;
  nodeA: number;
  nodeB: number;
}
interface Ped {
  slot: number;
  line: Line | null;
  s: number;
  dir: 1 | -1;
  speed: number;
  lat: number;
  state: 'walk' | 'idle' | 'cross' | 'flee' | 'down' | 'static';
  anim: number;
  timer: number;
  x: number;
  z: number;
  yaw: number;
  phase: number;
  from?: THREE.Vector2;
  to?: THREE.Vector2;
  target?: Line;
  targetDir?: 1 | -1;
  key?: string;
}

/** Sidewalk pedestrians, crossings, idle behaviours and colmado scenes (domino, dancing). */
export class Pedestrians {
  private lines: Line[] = [];
  private ends = new Map<number, { line: Line; atStart: boolean }[]>();
  private peds: Ped[] = [];
  private free: number[] = [];
  readonly crowd: Crowd;
  private max: number;
  private rng = mulberry(1492);
  private spawnTimer = 0;
  private staticKeys = new Set<string>();
  private camPos = new THREE.Vector3();
  private camDir = new THREE.Vector3();
  trafficNear?: (x: number, z: number, r: number) => { x: number; z: number; v: number; yaw: number }[];

  constructor(scene: THREE.Scene, private readonly net: RoadNetwork, private readonly world: WorldStreamer, gs: GraphicsSettings, private readonly audio: AudioEngine) {
    const cap = 170;
    this.crowd = new Crowd(cap, gs.shadows === 'high');
    scene.add(this.crowd.mesh);
    for (let i = cap - 1; i >= 0; i--) this.free.push(i);
    this.max = Math.round(110 * gs.pedestrianDensity) + 10;
    for (const e of net.edges) {
      if (!e.walkable) continue;
      const hw = e.width / 2;
      const ra = Math.min(net.nodes[e.a].radius + 1, e.length * 0.4);
      const rb = Math.min(net.nodes[e.b].radius + 1, e.length * 0.4);
      const offs = e.sidewalk > 0.5 ? [hw + e.sidewalk * 0.55, -(hw + e.sidewalk * 0.55)] : e.cls === 'pedestrian' || e.cls === 'footway' ? [0] : [];
      for (const off of offs) {
        const pts = offsetLine(e.pts, off);
        const cum = cumulative(pts);
        const total = cum[cum.length - 1];
        const trimmed = off === 0 ? pts : trimLine(pts, cum, ra, total - rb);
        if (trimmed.length < 4) continue;
        const tc = cumulative(trimmed);
        const line: Line = { pts: new Float32Array(trimmed), cum: tc, len: tc[tc.length - 1], nodeA: e.a, nodeB: e.b };
        if (line.len < 3) continue;
        this.lines.push(line);
        (this.ends.get(e.a) ?? this.ends.set(e.a, []).get(e.a)!).push({ line, atStart: true });
        (this.ends.get(e.b) ?? this.ends.set(e.b, []).get(e.b)!).push({ line, atStart: false });
      }
    }
  }

  get count() {
    return this.peds.length;
  }

  setDensity(d: number) {
    this.max = Math.round(110 * d) + 10;
  }

  private pos(line: Line, s: number, out: THREE.Vector2, dirOut?: THREE.Vector2) {
    const c = line.cum;
    let i = 1;
    while (i < c.length - 1 && c[i] < s) i++;
    const l = c[i] - c[i - 1] || 1;
    const t = Math.max(0, Math.min(1, (s - c[i - 1]) / l));
    const ax = line.pts[i * 2 - 2];
    const az = line.pts[i * 2 - 1];
    out.set(ax + (line.pts[i * 2] - ax) * t, az + (line.pts[i * 2 + 1] - az) * t);
    dirOut?.set((line.pts[i * 2] - ax) / l, (line.pts[i * 2 + 1] - az) / l);
    return out;
  }

  private spawn(player: THREE.Vector3) {
    if (!this.free.length) return;
    const v = new THREE.Vector2();
    for (let tries = 0; tries < 10; tries++) {
      const line = this.lines[Math.floor(this.rng() * this.lines.length)];
      const s = this.rng() * line.len;
      this.pos(line, s, v);
      const d = Math.hypot(v.x - player.x, v.y - player.z);
      if (d < 25 || d > 150 || !this.world.hasPhysicsAt(v.x, v.y)) continue;
      const tx = v.x - this.camPos.x;
      const tz = v.y - this.camPos.z;
      const td = Math.hypot(tx, tz);
      if (td < 60 && (tx * this.camDir.x + tz * this.camDir.z) / td > 0.3) continue;
      const slot = this.free.pop()!;
      this.crowd.setLook(slot, randomLook(this.rng));
      this.peds.push({ slot, line, s, dir: this.rng() < 0.5 ? 1 : -1, speed: 1.05 + this.rng() * 0.55, lat: (this.rng() - 0.5) * 0.8, state: 'walk', anim: ANIM.WALK, timer: 0, x: v.x, z: v.y, yaw: 0, phase: this.rng() * 6 });
      return;
    }
  }

  private spawnStatic(player: THREE.Vector3, night: number) {
    for (const shop of this.world.shops()) {
      if (shop.kind !== 'colmado' && shop.kind !== 'bar') continue;
      const d = Math.hypot(shop.x - player.x, shop.z - player.z);
      const key = `${Math.round(shop.x)}_${Math.round(shop.z)}`;
      if (d > 90 || this.staticKeys.has(key) || this.free.length < 4) continue;
      this.staticKeys.add(key);
      const r = mulberry(Math.abs(Math.round(shop.x * 13 + shop.z * 7)));
      const n = 2 + Math.floor(r() * 3);
      // chair set sits ~1.6 m out from the shop wall; find the wall normal from the nearest sidewalk
      const near = this.net.nearestLane(shop.x, shop.z, 40);
      let nx = 0;
      let nz = 1;
      if (near) {
        const tmp = { x: 0, z: 0, dx: 0, dz: 0 };
        this.net.sample(near.lane, near.s, tmp);
        const l = Math.hypot(tmp.x - shop.x, tmp.z - shop.z) || 1;
        nx = (tmp.x - shop.x) / l;
        nz = (tmp.z - shop.z) / l;
      }
      const cx = shop.x + nx * 1.6;
      const cz = shop.z + nz * 1.6;
      const dancing = shop.kind === 'bar' && night > 0.6;
      for (let i = 0; i < n; i++) {
        const slot = this.free.pop()!;
        this.crowd.setLook(slot, randomLook(r));
        const a = (i / n) * Math.PI * 2 + 0.3;
        const x = cx + Math.cos(a) * (dancing ? 1.3 : 0.85);
        const z = cz + Math.sin(a) * (dancing ? 1.3 : 0.85);
        const yaw = Math.atan2(cx - x, cz - z);
        this.peds.push({ slot, line: null, s: 0, dir: 1, speed: 0, lat: 0, state: 'static', anim: dancing ? ANIM.DANCE : r() < 0.7 ? ANIM.DOMINO : ANIM.TALK, timer: 0, x, z, yaw, phase: r() * 10, key });
      }
    }
  }

  private despawn(p: Ped) {
    this.free.push(p.slot);
    this.peds.splice(this.peds.indexOf(p), 1);
  }

  update(dt: number, player: THREE.Vector3, veh: Vehicle | null, camera: THREE.Camera, night = 0) {
    this.camPos.copy(camera.position);
    camera.getWorldDirection(this.camDir);
    this.camDir.y = 0;
    this.camDir.normalize();
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.3;
      const walking = this.peds.filter((p) => p.state !== 'static').length;
      for (let i = 0; i < 3 && walking + i < this.max; i++) this.spawn(player);
      this.spawnStatic(player, night);
    }
    const v2 = new THREE.Vector2();
    const d2 = new THREE.Vector2();
    const vpos = veh?.position;
    const vspeed = veh ? Math.abs(veh.speed) : 0;
    for (const p of [...this.peds]) {
      const dist = Math.hypot(p.x - player.x, p.z - player.z);
      if (dist > (p.state === 'static' ? 130 : 175)) {
        if (p.key) this.staticKeys.delete(p.key);
        this.despawn(p);
        continue;
      }
      // react to the player's vehicle
      if (vpos && p.state !== 'down') {
        const dv = Math.hypot(p.x - vpos.x, p.z - vpos.z);
        if (dv < 1.4 && vspeed > 4) {
          p.state = 'down';
          p.anim = ANIM.LIE;
          p.timer = 5;
          p.yaw = veh!.yaw;
          this.audio.crash(0.35, new THREE.Vector3(p.x, 0.5, p.z));
          this.audio.shout(p.x, p.z);
        } else if (dv < 9 && vspeed > 5 && p.state !== 'flee' && p.state !== 'static') {
          const f = veh!.forward;
          const rx = p.x - vpos.x;
          const rz = p.z - vpos.z;
          if (rx * f.x + rz * f.z > 0) {
            p.state = 'flee';
            p.timer = 1.6;
            const side = f.x * rz - f.z * rx > 0 ? 1 : -1;
            p.yaw = Math.atan2(-f.z * side, f.x * side);
            if (Math.random() < 0.3) this.audio.shout(p.x, p.z);
          }
        }
      }
      switch (p.state) {
        case 'static':
          break;
        case 'down':
          p.timer -= dt;
          if (p.timer <= 0) {
            p.state = p.line ? 'walk' : 'static';
            p.anim = p.line ? ANIM.WALK : ANIM.TALK;
          }
          break;
        case 'flee':
          p.timer -= dt;
          p.x += Math.sin(p.yaw) * 5.5 * dt;
          p.z += Math.cos(p.yaw) * 5.5 * dt;
          p.anim = ANIM.RUN;
          p.phase += dt * 9;
          if (p.timer <= 0) {
            if (p.line) {
              // snap back onto the nearest point of the sidewalk
              p.state = 'walk';
              p.anim = ANIM.WALK;
            } else p.state = 'static';
          }
          break;
        case 'idle':
          p.timer -= dt;
          if (p.timer <= 0) {
            p.state = 'walk';
            p.anim = ANIM.WALK;
          }
          break;
        case 'cross': {
          const to = p.to!;
          const dx = to.x - p.x;
          const dz = to.y - p.z;
          const l = Math.hypot(dx, dz);
          // wait for traffic before stepping off the curb
          if (p.timer > 0) {
            p.timer -= dt;
            const cars = this.trafficNear?.(p.x, p.z, 16) ?? [];
            const danger = cars.some((c) => c.v > 1 && Math.hypot(c.x - p.x, c.z - p.z) < 14);
            p.anim = ANIM.IDLE;
            if (!danger || p.timer < -8) p.timer = 0;
            else p.timer = Math.max(p.timer, 0.1);
            break;
          }
          if (l < 0.3) {
            p.line = p.target!;
            p.dir = p.targetDir!;
            p.s = p.dir === 1 ? 0 : p.line.len;
            p.state = 'walk';
            break;
          }
          p.x += (dx / l) * p.speed * 1.25 * dt;
          p.z += (dz / l) * p.speed * 1.25 * dt;
          p.yaw = Math.atan2(dx, dz);
          p.anim = ANIM.WALK;
          p.phase += dt * p.speed * 1.25 * 4.2;
          break;
        }
        case 'walk': {
          const line = p.line!;
          p.s += p.dir * p.speed * dt;
          p.phase += dt * p.speed * 4.2;
          p.anim = ANIM.WALK;
          if (p.s < 0 || p.s > line.len) {
            // reached a junction: pick another sidewalk end around the node
            const node = p.dir === 1 ? line.nodeB : line.nodeA;
            const opts = (this.ends.get(node) ?? []).filter((e) => e.line !== line);
            if (!opts.length) {
              p.dir = (-p.dir) as 1 | -1;
              p.s = Math.max(0, Math.min(line.len, p.s));
              break;
            }
            const pick = opts[Math.floor(this.rng() * opts.length)];
            const start = this.pos(pick.line, pick.atStart ? 0 : pick.line.len, new THREE.Vector2());
            const here = new THREE.Vector2(p.x, p.z);
            p.target = pick.line;
            p.targetDir = pick.atStart ? 1 : -1;
            p.to = start;
            p.from = here;
            p.state = 'cross';
            p.timer = here.distanceTo(start) > 5 ? 0.6 : 0;
            break;
          }
          if (this.rng() < dt * 0.02) {
            p.state = 'idle';
            p.timer = 3 + this.rng() * 10;
            p.anim = this.rng() < 0.5 ? ANIM.PHONE : ANIM.TALK;
          }
          this.pos(line, p.s, v2, d2);
          p.x = v2.x - d2.y * p.lat;
          p.z = v2.y + d2.x * p.lat;
          const yaw = Math.atan2(d2.x * p.dir, d2.y * p.dir);
          let dy = yaw - p.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          p.yaw += dy * Math.min(1, dt * 8);
          break;
        }
      }
    }
    // write instances
    let n = 0;
    for (const p of this.peds) {
      this.crowd.set(p.slot, p.x, p.state === 'cross' || p.state === 'flee' || p.state === 'down' ? 0.02 : 0.15, p.z, p.yaw, p.anim, p.phase);
      n = Math.max(n, p.slot + 1);
    }
    // hide unused slots below n
    const used = new Set(this.peds.map((p) => p.slot));
    for (let i = 0; i < n; i++) if (!used.has(i)) this.crowd.set(i, 0, -500, 0, 0, 0, 0);
    this.crowd.commit(n);
  }
}

function offsetLine(pts: number[], off: number): number[] {
  const n = pts.length / 2;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const pi = Math.max(0, i - 1);
    const ni = Math.min(n - 1, i + 1);
    let dx = pts[ni * 2] - pts[pi * 2];
    let dz = pts[ni * 2 + 1] - pts[pi * 2 + 1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    out.push(pts[i * 2] - dz * off, pts[i * 2 + 1] + dx * off);
  }
  return out;
}
function cumulative(p: number[] | Float32Array): Float32Array {
  const n = p.length / 2;
  const c = new Float32Array(n);
  for (let i = 1; i < n; i++) c[i] = c[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
  return c;
}
function trimLine(pts: number[], cum: Float32Array, s0: number, s1: number): number[] {
  if (s1 - s0 < 1) return [];
  const out: number[] = [];
  for (let i = 1; i < pts.length / 2; i++) {
    const a = cum[i - 1];
    const b = cum[i];
    if (b < s0 || a > s1) continue;
    const l = b - a || 1;
    const t0 = Math.max(0, (s0 - a) / l);
    const t1 = Math.min(1, (s1 - a) / l);
    const ax = pts[i * 2 - 2];
    const az = pts[i * 2 - 1];
    const bx = pts[i * 2];
    const bz = pts[i * 2 + 1];
    if (!out.length) out.push(ax + (bx - ax) * t0, az + (bz - az) * t0);
    out.push(ax + (bx - ax) * t1, az + (bz - az) * t1);
  }
  return out;
}
