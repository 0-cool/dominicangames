import * as THREE from 'three';
import type { GameSettings, SaveData } from '@sd/shared';
import { Atmosphere, type Weather } from '../render/Atmosphere.ts';
import { CityLights } from '../render/Lights.ts';
import { Headlights } from '../render/Headlights.ts';
import { G, detailMaterial, facadeMaterial, markingsMaterial, muralMaterial, propMaterial, surfaceMaterial, swayDepthMaterial, waterMaterial } from '../render/materials.ts';
import { TextureBaker } from '../render/textures.ts';
import { Physics } from '../physics/Physics.ts';
import { WorldStreamer } from '../world/WorldStreamer.ts';
import { SignAtlas } from '../world/signs.ts';
import { makeFoliageAtlas } from '../world/foliage.ts';
import { type VehicleModel, buildInstanced, vehicleMaterial, SPECS } from '../vehicles/vehicleMeshes.ts';
import { Input } from './Input.ts';
import { RenderPipeline } from './Renderer.ts';
import { detectCapabilities, type Capabilities } from './capabilities.ts';
import { CameraRig } from '../camera/CameraRig.ts';
import { Player } from '../gameplay/Player.ts';
import { VehicleManager } from '../vehicles/VehicleManager.ts';
import { RoadNetwork } from '../ai/RoadNetwork.ts';
import { Traffic } from '../ai/Traffic.ts';
import { Pedestrians } from '../ai/Pedestrians.ts';
import { AudioEngine } from '../audio/Audio.ts';
import { MissionSystem } from '../gameplay/Missions.ts';
import { Landmarks } from '../gameplay/Landmarks.ts';
import type { GameEvent, HudState } from './types.ts';

export interface GameOptions {
  canvas: HTMLCanvasElement;
  fetchAsset(path: string): Promise<Response>;
  settings: GameSettings;
  save?: SaveData | null;
  completedMissions?: string[];
  onHud?(s: HudState): void;
  onEvent?(e: GameEvent): void;
  onProgress?(p: number, label: string): void;
  /** Exposes window.__SD_DEBUG__ for automated tests (never enable in production builds). */
  debug?: boolean;
  /** Photo/harness mode: free camera, no player systems. */
  photo?: { x: number; y: number; z: number; tx: number; ty: number; tz: number; time?: number; weather?: Weather };
}

export class Game {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.25, 2500);
  caps!: Capabilities;
  pipeline!: RenderPipeline;
  atmosphere!: Atmosphere;
  lights!: CityLights;
  headlights!: Headlights;
  /** In-game photo mode: time frozen, free camera, HUD hidden by the web client. */
  photoMode = false;
  private pendingPhoto = false;
  private lastVehicle: unknown = null;
  physics!: Physics;
  world!: WorldStreamer;
  input!: Input;
  rig!: CameraRig;
  player!: Player;
  vehicles!: VehicleManager;
  network!: RoadNetwork;
  traffic!: Traffic;
  peds!: Pedestrians;
  audio!: AudioEngine;
  missions!: MissionSystem;
  landmarks!: Landmarks;
  private water!: THREE.Mesh;
  private baker!: TextureBaker;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private hudTimer = 0;
  private fps = 60;
  private fpsAcc = { t: 0, n: 0 };
  private realDt = 0;
  paused = false;
  private disposed = false;
  money = 0;
  stats = { distanceWalked: 0, distanceDriven: 0, playTimeSec: 0, topSpeedKmh: 0 };
  private autosave = 60;
  settings: GameSettings;
  private resizeObs: ResizeObserver | null = null;

  constructor(readonly opts: GameOptions) {
    this.settings = opts.settings;
  }

  async init() {
    const P = (p: number, l: string) => this.opts.onProgress?.(p, l);
    this.caps = detectCapabilities();
    if (!this.caps.supported) throw new Error(this.caps.reasons.join(' '));
    const gs = this.settings.graphics;
    P(0.02, 'Preparando el motor gráfico');
    this.pipeline = new RenderPipeline(this.opts.canvas, this.scene, this.camera);
    const renderer = this.pipeline.renderer;
    this.baker = new TextureBaker(renderer, gs.preset === 'low' ? 512 : 1024);
    const t = (n: string, s = 6) => this.baker.bake(n, s);
    G.tMacro.value = this.baker.bakeData('macro');
    const maps = {
      asphalt: t('asphalt', 4), pavers: t('pavers', 9), sidewalk: t('sidewalk', 6), plaza: t('plaza', 6), ground: t('ground', 5), grass: t('grass', 4), sand: t('sand', 3), stone: t('stone', 8), plaster: t('plaster', 4), roof: t('roof', 4), rock: t('rock', 9), water: t('water', 2.2),
    };
    P(0.12, 'Mezclando materiales');
    const sea = this.atmosphereSeaLevel;
    const byLayer: Record<string, THREE.Material> = {
      ground: surfaceMaterial(maps.ground, { key: 'ground', tile: 6, vertexColors: true, porosity: 0.6, puddles: true }),
      grass: surfaceMaterial(maps.grass, { key: 'grass', tile: 4, porosity: 0.3 }),
      plaza: surfaceMaterial(maps.plaza, { key: 'plaza', tile: 4, puddles: true, porosity: 0.45 }),
      sand: surfaceMaterial(maps.sand, { key: 'sand', tile: 4, porosity: 0.5 }),
      asphalt: surfaceMaterial(maps.asphalt, { key: 'asphalt', tile: 4, puddles: true, porosity: 0.7, normalScale: 1.2 }),
      pavers: surfaceMaterial(maps.pavers, { key: 'pavers', tile: 2.2, puddles: true, porosity: 0.55, normalScale: 1.4 }),
      concrete: surfaceMaterial(maps.sidewalk, { key: 'concrete', tile: 3, porosity: 0.5 }),
      sidewalk: surfaceMaterial(maps.sidewalk, { key: 'sidewalk', tile: 2, curb: true, puddles: true, porosity: 0.5 }),
      markings: markingsMaterial(),
      walls: facadeMaterial(maps.plaster, maps.stone),
      roofs: detailMaterial(maps.roof, 'roofs', { tile: 4, vertexColors: true, porosity: 0.5 }),
      stone: detailMaterial(maps.stone, 'stone', { tile: 3, vertexColors: true, triplanar: true, normalScale: 1.2, porosity: 0.5 }),
      mural: muralMaterial(),
      bronze: detailMaterial(null, 'bronze', { roughness: 0.42, metalness: 0.85, vertexColors: true }),
      detail: detailMaterial(null, 'detailvc', { roughness: 0.55, vertexColors: true }),
      coast: surfaceMaterial(maps.rock, { key: 'coast', tile: 3, porosity: 0.6, wetBottom: sea + 0.6, normalScale: 1.5 }),
    };
    const wiresMat = new THREE.LineBasicMaterial({ color: 0x0b0b0b });
    const foliage = makeFoliageAtlas();
    const sway = propMaterial('veg', { sway: true, foliage: true, roughness: 0.85, side: THREE.DoubleSide, alphaTest: 0.42 });
    sway.map = foliage;
    const swayDepth = swayDepthMaterial(0.42);
    swayDepth.map = foliage;
    const props = propMaterial('props', { roughness: 0.7 });
    const vehicleInstanced = vehicleMaterial(true);
    const vgeo = { instanced: Object.fromEntries((Object.keys(SPECS) as VehicleModel[]).map((m) => [m, buildInstanced(m)])) as Record<VehicleModel, THREE.BufferGeometry> };

    P(0.18, 'Cielo y clima caribeño');
    this.atmosphere = new Atmosphere(renderer, this.scene, gs.preset === 'low' ? 1500 : gs.preset === 'medium' ? 3000 : 6000);
    this.lights = new CityLights(gs.preset === 'low' ? 0 : gs.preset === 'medium' ? 4 : gs.preset === 'high' ? 8 : 12);
    this.scene.add(this.lights.group);
    this.headlights = new Headlights();
    this.scene.add(this.headlights.group);
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), waterMaterial(maps.water));
    this.water.rotation.x = -Math.PI / 2;
    this.water.receiveShadow = gs.shadows === 'high';
    this.scene.add(this.water);
    this.pipeline.apply(gs, this.atmosphere.sun);

    P(0.22, 'Física');
    this.physics = await Physics.create();
    const signs = new SignAtlas();
    this.world = new WorldStreamer(this.scene, this.physics, { byLayer, props, sway, swayDepth, vehicleInstanced, wires: wiresMat }, signs, vgeo, this.opts.fetchAsset);
    this.world.drawDistance = gs.drawDistance;
    this.world.shadows = gs.shadows !== 'off';
    P(0.26, 'Descargando Santo Domingo');
    await this.world.init();
    this.water.position.y = this.world.manifest.seaLevel;
    this.world.onChunksChanged = () => {
      this.lights.setSources(this.world.allLights());
      this.traffic?.onChunksChanged();
    };

    this.input = new Input(this.opts.canvas);
    this.input.sensitivity = this.settings.controls.mouseSensitivity;
    this.input.invertY = this.settings.controls.invertY;
    this.input.setBindings(this.settings.controls.bindings);
    this.rig = new CameraRig(this.camera, this.physics);
    this.rig.baseFov = this.settings.graphics.fov;

    const photo = this.opts.photo;
    const save = this.opts.save;
    const spawn = save ? { x: save.player.x, z: save.player.z } : this.world.manifest.spawn;
    const focus = photo ? { x: photo.tx, z: photo.tz } : spawn;
    await this.world.preload(focus.x, focus.z, Math.min(gs.drawDistance, 450), (p) => P(0.3 + p * 0.45, 'Construyendo la ciudad'));

    P(0.78, 'Calles, semáforos y tráfico');
    this.network = new RoadNetwork(this.world.roads, this.world.manifest);
    this.audio = new AudioEngine(this.settings.audio);
    this.atmosphere.onThunder = (i) => this.audio.thunder(i);
    if (photo) {
      this.atmosphere.timeOfDay = photo.time ?? 17.3;
      this.atmosphere.autoWeather = false;
      this.atmosphere.setWeather(photo.weather ?? 'clear', true);
      this.rig.setPhoto(new THREE.Vector3(photo.x, photo.y, photo.z), new THREE.Vector3(photo.tx, photo.ty, photo.tz));
    }
    this.vehicles = new VehicleManager(this.scene, this.physics, this.audio, this.world);
    this.player = new Player(this.scene, this.physics, this.input, this.rig, this.vehicles, this.world, this.audio, gs.shadows !== 'off');
    this.traffic = new Traffic(this.scene, this.network, this.physics, vgeo.instanced, vehicleInstanced, this.audio, gs);
    this.peds = new Pedestrians(this.scene, this.network, this.world, gs, this.audio);
    this.peds.trafficNear = (x, z, r) => this.traffic.agentsNear(x, z, r);
    this.scene.userData.signalSource = () => this.world.allSignals();
    this.landmarks = new Landmarks(this.world.manifest.landmarks, (e) => this.emit(e));
    this.missions = new MissionSystem(this, this.opts.completedMissions ?? []);

    P(0.9, 'Último toque');
    if (!photo) {
      // saves and the manifest store compass headings (0° = north); internal yaw: facing (sin h, cos h)
      const sp = save?.player ?? { x: spawn.x, y: 0.2, z: spawn.z, heading: this.world.manifest.spawn.heading };
      this.player.spawn(sp.x, sp.y + 0.2, sp.z, Math.PI - ((sp.heading ?? 0) * Math.PI) / 180);
      if (save) {
        this.money = save.money;
        this.atmosphere.timeOfDay = save.timeOfDay;
        this.atmosphere.setWeather(save.weather, true);
        this.stats = { ...save.stats };
        this.landmarks.restore(save.discoveredLandmarks);
        if (save.vehicle && save.vehicle.model in SPECS) this.vehicles.spawn(save.vehicle.model as VehicleModel, save.vehicle.x, save.vehicle.y + 0.3, save.vehicle.z, Math.PI - (save.vehicle.heading * Math.PI) / 180);
      } else this.atmosphere.timeOfDay = 16.6;
      this.missions.start();
    }
    this.atmosphere.update(0, new THREE.Vector3(focus.x, 0, focus.z), this.camera, this.pipeline.shadowExtent);
    this.atmosphere.refreshEnvironment();
    this.lights.setSources(this.world.allLights());
    this.resizeObs = new ResizeObserver(() => this.pipeline.resize());
    this.resizeObs.observe(this.opts.canvas);
    this.pipeline.resize();
    if (this.opts.debug) this.installDebug();
    // warm up shader compilation to avoid hitches on first frames
    this.pipeline.renderer.compile(this.scene, this.camera);
    P(1, 'Listo');
  }

  private get atmosphereSeaLevel() {
    return -2;
  }

  start() {
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      // rAF timestamps mark the frame start and can precede `last` after a long task → never negative.
      const real = Math.max(0, (now - this.last) / 1000);
      const dt = Math.min(0.1, real);
      this.last = now;
      this.realDt = real;
      this.frame(dt, now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** One frame: fixed-step simulation (60 Hz) + variable-rate rendering. */
  frame(dt: number, now = performance.now()) {
    const t0 = performance.now();
    if (this.photoMode && !this.paused) this.updatePhotoMode(dt);
    else if (!this.paused) {
      G.uTime.value += dt;
      this.acc += dt;
      let steps = 0;
      const h = this.physics.step_;
      while (this.acc >= h && steps < 4) {
        this.fixedUpdate(h);
        this.acc -= h;
        steps++;
      }
      if (steps === 4) this.acc = 0;
      this.update(dt);
    } else if (this.input.hit('pause')) this.emit({ type: 'pauseRequest' });
    const focus = this.opts.photo || this.photoMode ? this.rig.target : this.player.position;
    this.atmosphere.update(this.paused || this.photoMode ? 0 : dt, focus, this.camera, this.pipeline.shadowExtent);
    this.lights.update(dt, this.camera.position, G.uNight.value);
    this.water.position.x = this.camera.position.x;
    this.water.position.z = this.camera.position.z;
    this.world.update(focus.x, focus.z, this.camera);
    this.pipeline.speed = this.photoMode ? 0 : Math.abs(this.vehicles?.active?.speed ?? 0);
    this.pipeline.render(G.uNight.value);
    if (this.pendingPhoto) {
      // read the frame right after rendering it (the drawing buffer is not preserved between frames)
      this.pendingPhoto = false;
      try {
        this.emit({ type: 'photoTaken', dataUrl: this.opts.canvas.toDataURL('image/png') });
      } catch {
        this.emit({ type: 'notification', title: 'No se pudo guardar la foto', text: 'Inténtalo de nuevo.', kind: 'warning' });
      }
    }
    this.input.endFrame();
    const ms = performance.now() - t0;
    this.pipeline.adapt(ms);
    this.fpsAcc.t += this.realDt || dt;
    this.fpsAcc.n++;
    if (this.fpsAcc.t >= 0.5) {
      this.fps = Math.round(this.fpsAcc.n / this.fpsAcc.t);
      this.fpsAcc = { t: 0, n: 0 };
    }
    void now;
  }

  private fixedUpdate(h: number) {
    if (this.opts.photo) return;
    this.player.fixedUpdate(h);
    this.vehicles.fixedUpdate(h);
    this.traffic.fixedUpdate(h, this.player.position, this.vehicles.active);
    this.physics.step();
    this.vehicles.afterStep(h);
    this.physics.events.drainContactForceEvents((e) => this.vehicles.onContactForce(e.collider1(), e.collider2(), e.totalForceMagnitude()));
  }

  private update(dt: number) {
    if (this.opts.photo) {
      this.rig.updatePhoto(dt, this.input);
      return;
    }
    if (this.input.hit('pause')) {
      this.emit({ type: 'pauseRequest' });
    }
    if (this.input.hit('map')) this.emit({ type: 'toggleMap' });
    if (this.input.hit('photo')) {
      this.setPhotoMode(true);
      return;
    }
    this.player.update(dt);
    this.vehicles.update(dt, this.camera);
    const veh = this.vehicles.active;
    if (veh && this.input.hit('lights')) {
      this.headlights.toggle(G.uNight.value, this.atmosphere.rainAmt);
      this.audio.click();
    }
    if (veh && this.input.hit('radio')) {
      const st = this.audio.radioNext();
      this.emit({ type: 'radio', station: st?.name ?? null });
    } else if (veh && veh !== this.lastVehicle) this.emit({ type: 'radio', station: this.audio.radioStation?.name ?? null });
    this.lastVehicle = veh;
    this.headlights.update(dt, veh, G.uNight.value, this.atmosphere.rainAmt);
    this.audio.duckRadio(!!this.missions.subtitle);
    this.traffic.update(dt, this.camera);
    this.peds.update(dt, this.player.position, this.vehicles.active, this.camera, G.uNight.value);
    this.rig.update(dt, this.input, this.player, this.vehicles.active);
    this.missions.update(dt);
    this.landmarks.update(this.player.position, (amount) => (this.money += amount));
    this.audio.update(dt, this.camera, this.player.position, this.vehicles.active, this.traffic, this.world, G.uNight.value, this.atmosphere.rainAmt);
    // stats
    this.stats.playTimeSec += dt;
    const v = this.vehicles.active;
    if (v) {
      this.stats.distanceDriven += v.speed * dt;
      this.stats.topSpeedKmh = Math.max(this.stats.topSpeedKmh, v.speed * 3.6);
    } else this.stats.distanceWalked += this.player.speed * dt;
    this.autosave -= dt;
    if (this.autosave <= 0) {
      this.autosave = 60;
      this.emit({ type: 'save', data: this.snapshot() });
    }
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 1 / 15;
      this.opts.onHud?.(this.hud());
    }
  }

  hud(): HudState {
    const v = this.vehicles.active;
    const h = this.atmosphere.timeOfDay;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    const prompt = this.player.prompt();
    return {
      mode: v ? 'vehicle' : 'foot',
      speedKmh: v ? Math.round(v.speed * 3.6) : 0,
      gear: v ? v.gearLabel : '',
      rpm: v ? v.rpm : 0,
      rpmMax: v ? v.rpmMax : 1,
      damage: v ? v.damage : 0,
      vehicleName: v ? SPECS[v.model].label : '',
      prompt,
      money: this.money,
      clock: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
      weather: this.atmosphere.weather,
      fps: this.fps,
      resolutionScale: this.pipeline.resolutionScale,
      player: { x: this.player.position.x, z: this.player.position.z, heading: compass(this.player.heading) },
      mission: this.missions.hudInfo(),
      subtitle: this.missions.subtitle,
      route: this.missions.route,
      markers: [...this.missions.markers(), ...this.landmarks.markers()],
      lights: !!v && this.headlights.on,
      radio: v ? (this.audio.radioStation?.name ?? null) : null,
      photo: this.photoMode,
    };
  }

  /** Enter/leave photo mode (P). Time stops, the camera flies freely and Enter saves a PNG. */
  setPhotoMode(on: boolean) {
    if (on === this.photoMode || this.opts.photo) return;
    this.photoMode = on;
    if (on) {
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      this.rig.setPhoto(this.camera.position.clone(), this.camera.position.clone().addScaledVector(dir, 10));
      this.audio.setPaused(true);
    } else this.audio.setPaused(false);
    this.emit({ type: 'photoMode', active: on });
    this.opts.onHud?.(this.hud());
  }

  /** Save the next rendered frame as a PNG (photo mode). */
  takePhoto() {
    if (this.photoMode) this.pendingPhoto = true;
  }

  private updatePhotoMode(dt: number) {
    if (this.input.hit('photo') || this.input.hit('pause')) {
      this.setPhotoMode(false);
      return;
    }
    if (this.input.hitCode('Enter')) this.takePhoto();
    this.rig.updatePhoto(this.realDt || dt, this.input);
  }

  snapshot(): SaveData {
    const v = this.vehicles.active ?? this.vehicles.lastUsed;
    return {
      version: 1,
      player: { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z, heading: compass(this.player.heading) },
      vehicle: v ? { model: v.model, x: v.position.x, y: v.position.y, z: v.position.z, heading: compass(v.yaw) } : null,
      money: Math.floor(this.money),
      timeOfDay: Math.round(this.atmosphere.timeOfDay * 100) / 100,
      weather: this.atmosphere.weather,
      discoveredLandmarks: this.landmarks.discovered(),
      stats: { ...this.stats },
      savedAt: new Date().toISOString(),
    };
  }

  emit(e: GameEvent) {
    this.opts.onEvent?.(e);
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.input.enabled = !p;
    if (p) this.input.unlock();
    this.audio.setPaused(p);
  }

  applySettings(s: GameSettings) {
    this.settings = s;
    this.pipeline.apply(s.graphics, this.atmosphere.sun);
    this.rig.baseFov = s.graphics.fov;
    this.world.drawDistance = s.graphics.drawDistance;
    this.traffic.setDensity(s.graphics.trafficDensity);
    this.peds.setDensity(s.graphics.pedestrianDensity);
    this.input.sensitivity = s.controls.mouseSensitivity;
    this.input.invertY = s.controls.invertY;
    this.input.setBindings(s.controls.bindings);
    this.audio.setVolumes(s.audio);
  }

  /** GPS destination chosen on the full-screen map (world metres). */
  setWaypoint(x: number, z: number) {
    this.missions.setWaypoint(x, z);
  }

  clearWaypoint() {
    this.missions.clearWaypoint();
  }

  /** Called from a user gesture (click "Jugar"): audio + pointer lock. */
  activate() {
    this.audio.resume();
    this.input.lock();
  }

  private installDebug() {
    const dbg = {
      game: this,
      state: () => ({
        player: this.player.position.toArray(),
        grounded: this.player.grounded,
        inVehicle: !!this.vehicles.active,
        vehicle: this.vehicles.active ? { model: this.vehicles.active.model, speed: this.vehicles.active.speed, pos: this.vehicles.active.position.toArray(), up: this.vehicles.active.upY } : null,
        chunks: this.world.loaded.size,
        traffic: this.traffic.count,
        stuckTraffic: this.traffic.stuckCount,
        peds: this.peds.count,
        mission: this.missions.hudInfo(),
        fps: this.fps,
        drawCalls: this.pipeline.renderer.info.render.calls,
        triangles: this.pipeline.renderer.info.render.triangles,
        time: this.atmosphere.timeOfDay,
      }),
      key: (code: string, down: boolean) => this.input.simulate(code, down),
      look: (dx: number, dy: number) => {
        this.input.mouseDX += dx;
        this.input.mouseDY += dy;
      },
      teleport: (x: number, z: number) => this.player.teleport(x, 1, z),
      setTime: (h: number) => (this.atmosphere.timeOfDay = h),
      setWeather: (w: Weather) => this.atmosphere.setWeather(w, true),
      spawnVehicle: (model: VehicleModel) => {
        const p = this.player.position;
        const f = this.player.forward;
        return this.vehicles.spawn(model, p.x + f.x * 4, p.y + 0.5, p.z + f.z * 4, this.player.heading);
      },
      completeMissionStep: () => this.missions.debugAdvance(),
      /** Advance the simulation deterministically (no rendering) — used by automated tests. */
      simulate: (seconds: number) => {
        const h = this.physics.step_;
        for (let i = 0; i < Math.round(seconds / h); i++) {
          G.uTime.value += h;
          this.fixedUpdate(h);
          this.update(h);
          this.world.update(this.player.position.x, this.player.position.z, this.camera);
          this.input.endFrameKeepHeld();
        }
        return dbg.state();
      },
      /** Spawn a vehicle on the nearest lane (aligned with traffic) and put the player in it. */
      spawnOnRoad: (model: VehicleModel, x?: number, z?: number) => {
        const p = this.player.position;
        const n = this.network.nearestLane(x ?? p.x, z ?? p.z, 300);
        if (!n) return null;
        const t = { x: 0, z: 0, dx: 0, dz: 1 };
        this.network.sample(n.lane, Math.min(n.lane.length * 0.5, n.s + 5), t);
        const v = this.vehicles.spawn(model, t.x, 0.3, t.z, Math.atan2(t.dx, t.dz));
        this.player.enterVehicle(v);
        return { x: t.x, z: t.z, lane: n.lane.edge?.name ?? null, length: n.lane.length };
      },
    };
    (window as unknown as { __SD_DEBUG__: typeof dbg }).__SD_DEBUG__ = dbg;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    this.input?.dispose();
    this.audio?.dispose();
    this.world?.dispose();
    this.atmosphere?.dispose();
    this.baker?.dispose();
    this.pipeline?.dispose();
  }
}

/** Internal yaw (facing = (sin h, 0, cos h)) → compass degrees (0 = north, 90 = east). */
function compass(h: number): number {
  return Math.round((((Math.PI - h) * 180) / Math.PI + 720) % 360);
}
