import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { ChunkInfo, ChunkProps, PropType, RoadGraphData, WorldManifest } from '@sd/shared';
import { type Physics, LAYER } from '../physics/Physics.ts';
import { PROP_FACTORIES } from './propGeometries.ts';
import type { SignAtlas } from './signs.ts';
import { type VehicleModel, PAINTS, SPECS } from '../vehicles/vehicleMeshes.ts';

export interface WorldMaterials {
  byLayer: Record<string, THREE.Material>;
  props: THREE.Material;
  sway: THREE.Material;
  swayDepth: THREE.Material;
  vehicleInstanced: THREE.Material;
  wires: THREE.Material;
}

export interface VehicleGeos {
  instanced: Record<VehicleModel, THREE.BufferGeometry>;
}

interface LoadedChunk {
  info: ChunkInfo;
  group: THREE.Group;
  props: ChunkProps;
  colliders: RAPIER.Collider[];
  hasPhysics: boolean;
  collisionGeo: { pos: Float32Array; idx: Uint32Array } | null;
  disposables: { dispose(): void }[];
  propMeshes: { mesh: THREE.InstancedMesh; maxDist: number }[];
}

const PARKED_MODELS: VehicleModel[] = ['compact', 'sedan', 'sedan', 'suv', 'bigsuv', 'pickup', 'concho', 'compact'];
const PARKED_MOTOS: VehicleModel[] = ['moto', 'moto', 'motoconcho', 'delivery'];
const NO_SHADOW_LAYERS = new Set(['markings', 'ground', 'grass', 'plaza', 'sand', 'asphalt', 'pavers', 'concrete', 'sidewalk', 'coast']);

function h01(x: number, z: number, k = 0) {
  const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/** Streams city chunks (render meshes, instanced props, colliders) around the player. */
export class WorldStreamer {
  manifest!: WorldManifest;
  roads!: RoadGraphData;
  map!: { water: number[][][][]; parks: number[][][][]; plazas: number[][][][]; buildings: number[][] };
  readonly root = new THREE.Group();
  readonly loaded = new Map<string, LoadedChunk>();
  private loading = new Set<string>();
  private loader = new GLTFLoader();
  private propGeo = new Map<string, THREE.BufferGeometry>();
  drawDistance = 600;
  physicsRadius = 320;
  shadows = true;
  onChunksChanged?: () => void;
  readonly stats = { loads: 0, unloads: 0, failures: 0 };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: Physics,
    private readonly mats: WorldMaterials,
    private readonly signs: SignAtlas,
    private readonly vgeo: VehicleGeos,
    private readonly fetchAsset: (path: string) => Promise<Response>,
  ) {
    scene.add(this.root);
  }

  async init(onProgress?: (p: number) => void) {
    const [m, r, map] = await Promise.all(['manifest.json', 'roads.json', 'map.json'].map(async (f) => {
      const res = await this.fetchAsset(`world/${f}`);
      if (!res.ok) throw new Error(`No se pudo cargar ${f} (${res.status})`);
      return res.json();
    }));
    this.manifest = m;
    this.roads = r;
    this.map = map;
    onProgress?.(1);
    // world-edge colliders: sea floor and invisible walls at the play bounds
    const b = this.manifest.playBounds;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const hx = (b.maxX - b.minX) / 2;
    const hz = (b.maxZ - b.minZ) / 2;
    this.physics.addCuboid(cx, this.manifest.seaLevel - 6, cz, hx + 400, 1, hz + 400, 0, LAYER.WATER_FLOOR);
    this.physics.addCuboid(b.minX - 1, 20, cz, 1, 40, hz + 2);
    this.physics.addCuboid(b.maxX + 1, 20, cz, 1, 40, hz + 2);
    this.physics.addCuboid(cx, 20, b.minZ - 1, hx + 2, 40, 1);
    this.physics.addCuboid(cx, 20, b.maxZ + 1, hx + 2, 40, 1);
  }

  private chunkDist(c: ChunkInfo, x: number, z: number) {
    const dx = Math.max(c.minX - x, 0, x - c.maxX);
    const dz = Math.max(c.minZ - z, 0, z - c.maxZ);
    return Math.hypot(dx, dz);
  }

  /** Load everything needed around a point (used at spawn / teleport). */
  async preload(x: number, z: number, radius: number, onProgress?: (p: number) => void) {
    const want = this.manifest.chunks.filter((c) => this.chunkDist(c, x, z) < radius).sort((a, b) => this.chunkDist(a, x, z) - this.chunkDist(b, x, z));
    let done = 0;
    const queue = [...want];
    const worker = async () => {
      while (queue.length) {
        const c = queue.shift()!;
        await this.loadChunk(c, this.chunkDist(c, x, z) < this.physicsRadius);
        onProgress?.(++done / want.length);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    this.onChunksChanged?.();
  }

  update(x: number, z: number, camera: THREE.Camera) {
    let changed = false;
    for (const c of this.manifest.chunks) {
      const d = this.chunkDist(c, x, z);
      const l = this.loaded.get(c.id);
      if (!l && d < this.drawDistance && !this.loading.has(c.id) && this.loading.size < 2) {
        void this.loadChunk(c, d < this.physicsRadius).then(() => this.onChunksChanged?.());
      } else if (l && d > this.drawDistance + 150) {
        this.unload(l);
        changed = true;
      } else if (l) {
        const needPhys = d < this.physicsRadius;
        if (needPhys && !l.hasPhysics) this.addPhysics(l);
        else if (!needPhys && l.hasPhysics && d > this.physicsRadius + 100) this.removePhysics(l);
      }
    }
    // per-prop-type distance culling (small props disappear far away)
    const cp = camera.position;
    for (const l of this.loaded.values()) {
      const d = this.chunkDist(l.info, cp.x, cp.z);
      for (const pm of l.propMeshes) pm.mesh.visible = d < pm.maxDist;
    }
    if (changed) this.onChunksChanged?.();
  }

  private async loadChunk(info: ChunkInfo, withPhysics: boolean) {
    if (this.loaded.has(info.id) || this.loading.has(info.id)) return;
    this.loading.add(info.id);
    try {
      const [glbRes, propsRes] = await Promise.all([this.fetchAsset(`world/${info.glb}`), this.fetchAsset(`world/${info.props}`)]);
      if (!glbRes.ok || !propsRes.ok) throw new Error(`chunk ${info.id}: HTTP ${glbRes.status}/${propsRes.status}`);
      const [buf, props] = await Promise.all([glbRes.arrayBuffer(), propsRes.json() as Promise<ChunkProps>]);
      const gltf = await this.loader.parseAsync(buf, '');
      const group = new THREE.Group();
      group.name = `chunk_${info.id}`;
      const chunk: LoadedChunk = { info, group, props, colliders: [], hasPhysics: false, collisionGeo: null, disposables: [], propMeshes: [] };
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const geo = mesh.geometry as THREE.BufferGeometry;
        if (mesh.name === 'collision') {
          const pos = geo.attributes.position.array as Float32Array;
          const idx = geo.index ? Uint32Array.from(geo.index.array as ArrayLike<number>) : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
          chunk.collisionGeo = { pos: new Float32Array(pos), idx };
          geo.dispose();
          return;
        }
        const mat = this.mats.byLayer[mesh.name];
        if (!mat) return;
        const m = new THREE.Mesh(geo, mat);
        m.name = mesh.name;
        m.matrixAutoUpdate = false;
        m.receiveShadow = true;
        m.castShadow = this.shadows && !NO_SHADOW_LAYERS.has(mesh.name);
        group.add(m);
        chunk.disposables.push(geo);
      });
      this.buildProps(chunk);
      this.root.add(group);
      this.loaded.set(info.id, chunk);
      if (withPhysics) this.addPhysics(chunk);
      this.stats.loads++;
    } catch (e) {
      this.stats.failures++;
      console.error('[world] chunk load failed', info.id, e);
    } finally {
      this.loading.delete(info.id);
    }
  }

  private geoFor(type: string, variant: number): THREE.BufferGeometry | null {
    const key = `${type}:${variant}`;
    let g = this.propGeo.get(key);
    if (!g) {
      const f = PROP_FACTORIES[type as PropType];
      if (!f) return null;
      g = f.make(variant % f.variants);
      this.propGeo.set(key, g);
    }
    return g;
  }

  private buildProps(chunk: LoadedChunk) {
    const { props, group } = chunk;
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const m = new THREE.Matrix4();
    const add = (mesh: THREE.InstancedMesh, maxDist: number, shadow: boolean) => {
      mesh.castShadow = this.shadows && shadow;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
      chunk.propMeshes.push({ mesh, maxDist });
    };
    for (const [type, arr] of Object.entries(props.props) as [PropType, number[]][]) {
      if (type === 'parked_car' || type === 'parked_moto') continue;
      const f = PROP_FACTORIES[type];
      if (!f || !arr.length) continue;
      const byVar = new Map<number, number[]>();
      for (let i = 0; i < arr.length; i += 5) {
        const v = arr[i + 4] % f.variants;
        (byVar.get(v) ?? byVar.set(v, []).get(v)!).push(i);
      }
      for (const [v, idxs] of byVar) {
        const geo = this.geoFor(type, v);
        if (!geo) continue;
        const mesh = new THREE.InstancedMesh(geo, f.sway ? this.mats.sway : this.mats.props, idxs.length);
        if (f.sway) {
          mesh.customDepthMaterial = this.mats.swayDepth as THREE.MeshDepthMaterial;
          mesh.userData.noAO = true; // leaf cards are alpha-tested: AO would see whole rectangles
        }
        idxs.forEach((i, k) => {
          const [x, y, z, rot] = [arr[i], arr[i + 1], arr[i + 2], arr[i + 3]];
          const isTree = type.startsWith('tree');
          const s = isTree ? 0.82 + h01(x, z) * 0.4 : type === 'rock' ? 0.6 + h01(x, z) * 1.1 : 1;
          q.setFromAxisAngle(up, rot);
          m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
          mesh.setMatrixAt(k, m);
        });
        add(mesh, f.maxDist, !!f.shadow);
      }
    }
    // traffic-signal poles
    if (props.signals.length) {
      const geo = this.geoFor('signal', 0)!;
      const n = props.signals.length / 5;
      const mesh = new THREE.InstancedMesh(geo, this.mats.props, n);
      for (let i = 0; i < n; i++) {
        const [x, z, rot] = props.signals.slice(i * 5, i * 5 + 3);
        q.setFromAxisAngle(up, rot);
        m.compose(new THREE.Vector3(x, 0.15, z), q, new THREE.Vector3(1, 1, 1));
        mesh.setMatrixAt(i, m);
      }
      add(mesh, 500, true);
    }
    // parked vehicles (instanced vehicle meshes with random paint)
    for (const [type, models] of [['parked_car', PARKED_MODELS], ['parked_moto', PARKED_MOTOS]] as const) {
      const arr = props.props[type];
      if (!arr?.length) continue;
      const byModel = new Map<VehicleModel, number[]>();
      for (let i = 0; i < arr.length; i += 5) {
        const model = models[arr[i + 4] % models.length];
        (byModel.get(model) ?? byModel.set(model, []).get(model)!).push(i);
      }
      for (const [model, idxs] of byModel) {
        const geo = this.vgeo.instanced[model].clone();
        geo.setAttribute('aState', new THREE.InstancedBufferAttribute(new Float32Array(idxs.length * 4), 4));
        const mesh = new THREE.InstancedMesh(geo, this.mats.vehicleInstanced, idxs.length);
        const col = new THREE.Color();
        idxs.forEach((i, k) => {
          const [x, y, z, rot] = [arr[i], arr[i + 1], arr[i + 2], arr[i + 3]];
          q.setFromAxisAngle(up, rot);
          m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
          mesh.setMatrixAt(k, m);
          const p = PAINTS[Math.floor(h01(x, z, 3) * PAINTS.length)];
          mesh.setColorAt(k, col.setRGB(p[0], p[1], p[2]));
        });
        mesh.userData.parked = { type, model, idxs: idxs.map((i) => [arr[i], arr[i + 1], arr[i + 2], arr[i + 3]]) };
        chunk.disposables.push(geo);
        add(mesh, type === 'parked_moto' ? 250 : 450, true);
      }
    }
    // power lines: sagging catenaries between pole tops (3 conductors + a messy service drop)
    if (props.wires.length) {
      const pos: number[] = [];
      for (let i = 0; i < props.wires.length; i += 6) {
        const [x1, y1, z1, x2, y2, z2] = props.wires.slice(i, i + 6);
        const dx = x2 - x1;
        const dz = z2 - z1;
        const L = Math.hypot(dx, dz) || 1;
        const nx = -dz / L;
        const nz = dx / L;
        const lines = [[-0.8, 0.45], [0.3, 0.5], [0.8, 0.42], [0.05, 1.1 + h01(x1, z1) * 0.8]];
        for (const [off, sag] of lines) {
          const seg = 8;
          for (let s = 0; s < seg; s++) {
            const t0 = s / seg;
            const t1 = (s + 1) / seg;
            const yy = (t: number) => y1 + (y2 - y1) * t - sag * 4 * t * (1 - t) - (off === 0.05 ? 0.7 : 0);
            pos.push(x1 + dx * t0 + nx * off, yy(t0), z1 + dz * t0 + nz * off, x1 + dx * t1 + nx * off, yy(t1), z1 + dz * t1 + nz * off);
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const lines = new THREE.LineSegments(g, this.mats.wires);
      group.add(lines);
      chunk.disposables.push(g);
    }
    const signs = this.signs.buildMesh(props.shops);
    if (signs) {
      signs.receiveShadow = true;
      group.add(signs);
      chunk.propMeshes.push({ mesh: signs, maxDist: 400 });
      chunk.disposables.push(signs.geometry);
    }
  }

  private addPhysics(chunk: LoadedChunk) {
    if (chunk.hasPhysics) return;
    chunk.hasPhysics = true;
    if (chunk.collisionGeo) chunk.colliders.push(this.physics.addTrimesh(chunk.collisionGeo.pos, chunk.collisionGeo.idx));
    for (const [type, arr] of Object.entries(chunk.props.props) as [PropType, number[]][]) {
      if (type === 'parked_car' || type === 'parked_moto') {
        const models = type === 'parked_car' ? PARKED_MODELS : PARKED_MOTOS;
        for (let i = 0; i < arr.length; i += 5) {
          const s = SPECS[models[arr[i + 4] % models.length]];
          chunk.colliders.push(this.physics.addCuboid(arr[i], arr[i + 1] + s.H / 2, arr[i + 2], s.W / 2, s.H / 2, s.L / 2, arr[i + 3], LAYER.PROP));
        }
        continue;
      }
      const c = PROP_FACTORIES[type]?.collider;
      if (!c) continue;
      for (let i = 0; i < arr.length; i += 5) {
        if ('r' in c) chunk.colliders.push(this.physics.addCylinder(arr[i], arr[i + 1], arr[i + 2], c.r, c.h));
        else chunk.colliders.push(this.physics.addCuboid(arr[i], arr[i + 1] + c.hy, arr[i + 2], c.hx, c.hy, c.hz, arr[i + 3], LAYER.PROP));
      }
    }
    for (let i = 0; i < chunk.props.signals.length; i += 5) chunk.colliders.push(this.physics.addCylinder(chunk.props.signals[i], 0.15, chunk.props.signals[i + 1], 0.12, 2.6));
  }

  private removePhysics(chunk: LoadedChunk) {
    this.physics.remove(chunk.colliders);
    chunk.colliders = [];
    chunk.hasPhysics = false;
  }

  private unload(chunk: LoadedChunk) {
    this.removePhysics(chunk);
    this.root.remove(chunk.group);
    for (const d of chunk.disposables) d.dispose();
    for (const pm of chunk.propMeshes) pm.mesh.dispose();
    this.loaded.delete(chunk.info.id);
    this.stats.unloads++;
  }

  /** Is there loaded collision under this point? (used to delay spawning until ready) */
  hasPhysicsAt(x: number, z: number): boolean {
    for (const l of this.loaded.values()) if (l.hasPhysics && x >= l.info.minX && x <= l.info.maxX && z >= l.info.minZ && z <= l.info.maxZ) return true;
    return false;
  }

  /** Parked vehicles near a point (for "steal a parked car" interaction). */
  parkedNear(x: number, z: number, r: number): { model: VehicleModel; x: number; y: number; z: number; rot: number; mesh: THREE.InstancedMesh; index: number; dist: number } | null {
    let best: ReturnType<WorldStreamer['parkedNear']> = null;
    for (const l of this.loaded.values())
      for (const pm of l.propMeshes) {
        const pd = pm.mesh.userData.parked as { model: VehicleModel; idxs: number[][] } | undefined;
        if (!pd) continue;
        pd.idxs.forEach(([px, py, pz, rot], index) => {
          const d = Math.hypot(px - x, pz - z);
          if (d < r && (!best || d < best.dist) && !(pm.mesh.userData.hidden as Set<number> | undefined)?.has(index)) best = { model: pd.model, x: px, y: py, z: pz, rot, mesh: pm.mesh, index, dist: d };
        });
      }
    return best;
  }

  /** Hide a parked instance (it became a drivable vehicle). Its collider is removed lazily. */
  hideParked(mesh: THREE.InstancedMesh, index: number) {
    const hidden: Set<number> = mesh.userData.hidden ?? (mesh.userData.hidden = new Set<number>());
    hidden.add(index);
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(index, m);
    m.scale(new THREE.Vector3(0, 0, 0));
    mesh.setMatrixAt(index, m);
    mesh.instanceMatrix.needsUpdate = true;
    // remove the matching static collider (closest cuboid)
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    for (const l of this.loaded.values()) {
      const idx = l.colliders.findIndex((c) => {
        const t = c.translation();
        return Math.hypot(t.x - p.x, t.z - p.z) < 0.3 && c.shape.type === this.physics.R.ShapeType.Cuboid;
      });
      if (idx >= 0) {
        this.physics.remove([l.colliders[idx]]);
        l.colliders.splice(idx, 1);
        return;
      }
    }
  }

  allLights(): number[] {
    const out: number[] = [];
    for (const l of this.loaded.values()) for (const v of l.props.lights) out.push(v);
    return out;
  }

  allSignals(): number[] {
    const out: number[] = [];
    for (const l of this.loaded.values()) for (const v of l.props.signals) out.push(v);
    return out;
  }

  shops(): { x: number; z: number; kind: string }[] {
    const out: { x: number; z: number; kind: string }[] = [];
    for (const l of this.loaded.values()) for (const s of l.props.shops) out.push({ x: s.x, z: s.z, kind: s.kind });
    return out;
  }

  dispose() {
    for (const l of [...this.loaded.values()]) this.unload(l);
    for (const g of this.propGeo.values()) g.dispose();
  }
}
