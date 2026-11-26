import * as THREE from 'three';
import { GeoProjection, WORLD_ORIGIN } from '@sd/shared';
import type { Game } from '../engine/Game.ts';
import type { HudMarker, MissionStats } from '../engine/types.ts';
import { ANIM, Crowd } from '../characters/Humanoid.ts';
import type { Vehicle } from '../vehicles/Vehicle.ts';
import type { Interactable } from './Player.ts';

interface Checkpoint {
  name: string;
  lat: number;
  lon: number;
  pos?: THREE.Vector3;
}

type Step =
  | { kind: 'talk' }
  | { kind: 'mount' }
  | { kind: 'checkpoint'; cp: Checkpoint }
  | { kind: 'dismount' };

interface MissionDef {
  id: string;
  title: string;
  steps: Step[];
  reward: number;
  timeLimit?: number;
}

const DIALOGUE: { speaker: string; text: string }[] = [
  { speaker: 'Don Ramón', text: '¡Klk, mi hermano! Bienvenido a Santo Domingo. Yo soy Ramón, el del colmado.' },
  { speaker: 'Don Ramón', text: 'Hazme un favor: llévale este paquete a mi comadre, que te espera en el Parque Colón, frente a la Catedral.' },
  { speaker: 'Don Ramón', text: 'Llévate mi motor. Pero no te vayas derechito: date la vuelta para que conozcas la ciudad.' },
  { speaker: 'Don Ramón', text: 'Pasa por la Puerta del Conde, baja al Malecón por el Obelisco y sube por la Fortaleza Ozama.' },
  { speaker: 'Don Ramón', text: 'Y pendiente: en la Zona Colonial casi todas las calles son de una sola vía. Sigue el GPS, ¿oíste?' },
  { speaker: 'Tú', text: 'Tranquilo, Don Ramón. Eso es fácil.' },
  { speaker: 'Don Ramón', text: '¡Dale, tíguere! Y ponte el casco, que los agentes de tránsito están en la calle.' },
];

export const MISSIONS: MissionDef[] = [
  {
    id: 'm001_bienvenido',
    title: 'Bienvenido a Santo Domingo',
    reward: 500,
    steps: [
      { kind: 'talk' },
      { kind: 'mount' },
      { kind: 'checkpoint', cp: { name: 'Puerta del Conde', lat: 18.4713, lon: -69.8935 } },
      { kind: 'checkpoint', cp: { name: 'Obelisco del Malecón', lat: 18.4648, lon: -69.8932 } },
      { kind: 'checkpoint', cp: { name: 'Malecón — Obelisco Hembra', lat: 18.4672, lon: -69.8896 } },
      { kind: 'checkpoint', cp: { name: 'Fortaleza Ozama', lat: 18.4709, lon: -69.8822 } },
      { kind: 'checkpoint', cp: { name: 'Parque Colón — Catedral Primada', lat: 18.4737, lon: -69.8838 } },
      { kind: 'dismount' },
    ],
  },
  {
    id: 'reto_malecon',
    title: 'Reto del Malecón',
    reward: 300,
    timeLimit: 75,
    steps: [
      { kind: 'checkpoint', cp: { name: 'Salida: Obelisco del Malecón', lat: 18.4648, lon: -69.8932 } },
      { kind: 'checkpoint', cp: { name: 'Obelisco Hembra', lat: 18.4672, lon: -69.8896 } },
      { kind: 'checkpoint', cp: { name: 'Meta: Fortaleza Ozama', lat: 18.4709, lon: -69.8822 } },
    ],
  },
];

/** Mission framework + Mission 001 "Bienvenido a Santo Domingo" and the Malecón time trial. */
export class MissionSystem {
  active: MissionDef | null = null;
  private stepIdx = 0;
  private completed: Set<string>;
  route: number[] = [];
  subtitle: { speaker: string; text: string } | null = null;
  private routeTimer = 0;
  private proj = new GeoProjection(WORLD_ORIGIN);
  private npcs: Crowd;
  private ramon = new THREE.Vector3();
  private ramonYaw = 0;
  private dialogIdx = -1;
  private dialogTimer = 0;
  private bike: Vehicle | null = null;
  private stats: MissionStats = { timeSec: 0, distanceM: 0, topSpeedKmh: 0, collisions: 0 };
  private startCollisions = 0;
  private beacon: THREE.Mesh;
  private gps: THREE.Mesh;
  private gpsGeo = new THREE.BufferGeometry();
  private trialStart: THREE.Vector3 | null = null;
  private interact: Interactable;
  private timer = 0;
  /** Player-set GPS destination (from the map); guided only while no mission is active. */
  private waypoint: THREE.Vector3 | null = null;

  constructor(private readonly game: Game, completed: string[]) {
    this.completed = new Set(completed);
    this.npcs = new Crowd(2, true);
    game.scene.add(this.npcs.mesh);
    // light pillar for checkpoints
    const bg = new THREE.CylinderGeometry(3.2, 3.2, 60, 32, 1, true);
    bg.translate(0, 30, 0);
    this.beacon = new THREE.Mesh(
      bg,
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'varying float vY; uniform float uTime; void main(){ float a = (1.0 - vY/60.0) * 0.45 * (0.75 + 0.25*sin(uTime*3.0 - vY*0.2)); gl_FragColor = vec4(vec3(1.0,0.82,0.2)*2.0*a, a); }',
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.beacon.visible = false;
    game.scene.add(this.beacon);
    this.gps = new THREE.Mesh(
      this.gpsGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.15, 0.25), transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -10 }),
    );
    this.gps.frustumCulled = false;
    game.scene.add(this.gps);
    this.interact = {
      id: 'ramon',
      position: this.ramon,
      radius: 3,
      label: 'Hablar con Don Ramón',
      enabled: () => this.active?.id === 'm001_bienvenido' && this.current?.kind === 'talk' && this.dialogIdx < 0,
      action: () => this.startDialogue(),
    };
    game.player.interactables.push(this.interact);
    game.player.onDrown = () => game.emit({ type: 'notification', kind: 'warning', title: '¡Al agua!', text: 'Te sacaron del mar. Ten cuidado con el muro del Malecón.' });
  }

  get current(): Step | null {
    return this.active ? this.active.steps[this.stepIdx] ?? null : null;
  }

  setWaypoint(x: number, z: number) {
    this.waypoint = new THREE.Vector3(x, 0, z);
    this.routeTimer = 0;
  }

  clearWaypoint() {
    this.waypoint = null;
    if (!this.active) {
      this.route = [];
      this.gps.visible = false;
    }
  }

  get waypointPos() {
    return this.waypoint;
  }

  isCompleted(id: string) {
    return this.completed.has(id);
  }

  start() {
    const g = this.game;
    // Don Ramón stands on the sidewalk near the spawn point, beside a colmado if one is close.
    const sp = g.world.manifest.spawn;
    const shop = g.world.shops().filter((s) => s.kind === 'colmado').sort((a, b) => Math.hypot(a.x - sp.x, a.z - sp.z) - Math.hypot(b.x - sp.x, b.z - sp.z))[0];
    const base = shop && Math.hypot(shop.x - sp.x, shop.z - sp.z) < 60 ? shop : { x: sp.x + 3, z: sp.z + 3 };
    const lane = g.network.nearestLane(base.x, base.z, 60);
    let px = base.x;
    let pz = base.z;
    if (lane) {
      const tmp = { x: 0, z: 0, dx: 0, dz: 0 };
      g.network.sample(lane.lane, lane.s, tmp);
      const dx = base.x - tmp.x;
      const dz = base.z - tmp.z;
      const l = Math.hypot(dx, dz) || 1;
      const side = Math.min(l, lane.lane.edge ? lane.lane.edge.width / 2 + lane.lane.edge.sidewalk * 0.6 + 1.2 : 4);
      px = tmp.x + (dx / l) * side;
      pz = tmp.z + (dz / l) * side;
    }
    this.ramon.set(px, 0.15, pz);
    this.npcs.setLook(0, { skin: new THREE.Color('#8d5524'), hairDark: 0.2, shirt: new THREE.Color('#f5f5f5'), pants: new THREE.Color('#5a4a3a'), shorts: 0, height: 0.98, girth: 1.25, female: 0, longHair: 0 });
    if (!this.completed.has('m001_bienvenido')) this.begin(MISSIONS[0]);
    else this.offerTrial();
  }

  private begin(m: MissionDef) {
    this.active = m;
    this.stepIdx = 0;
    this.stats = { timeSec: 0, distanceM: 0, topSpeedKmh: 0, collisions: 0 };
    this.startCollisions = this.game.vehicles.active?.collisions ?? 0;
    this.timer = 0;
    this.game.emit({ type: 'missionStarted', missionId: m.id, title: m.title });
    this.enterStep();
  }

  private offerTrial() {
    const t = MISSIONS[1].steps[0];
    if (t.kind === 'checkpoint') this.trialStart = this.cpPos(t.cp);
  }

  private cpPos(cp: Checkpoint): THREE.Vector3 {
    if (!cp.pos) {
      const w = this.proj.toWorld(cp.lat, cp.lon);
      const n = this.game.network.nearestLane(w.x, w.z, 150);
      const tmp = { x: w.x, z: w.z, dx: 0, dz: 0 };
      if (n) this.game.network.sample(n.lane, n.s, tmp);
      cp.pos = new THREE.Vector3(tmp.x, 0, tmp.z);
    }
    return cp.pos;
  }

  private startDialogue() {
    this.dialogIdx = 0;
    this.dialogTimer = 4.2;
    this.subtitle = DIALOGUE[0];
    this.game.audio.notify();
  }

  private enterStep() {
    const s = this.current;
    this.route = [];
    this.routeTimer = 0;
    if (!s) return;
    if (s.kind === 'mount' && !this.bike) {
      // Don Ramón's 150cc parked at the curb next to him
      const lane = this.game.network.nearestLane(this.ramon.x, this.ramon.z, 40);
      const tmp = { x: this.ramon.x + 2, z: this.ramon.z, dx: 1, dz: 0 };
      if (lane) this.game.network.sample(lane.lane, Math.min(lane.s + 4, lane.lane.length - 1), tmp);
      this.bike = this.game.vehicles.spawn('moto', tmp.x, 0.4, tmp.z, Math.atan2(tmp.dx, tmp.dz), 0xb3261e);
      this.bike.userDataPinned = true;
    }
  }

  private advance() {
    this.stepIdx++;
    this.game.audio.chime();
    if (!this.current) return this.complete();
    this.enterStep();
  }

  debugAdvance() {
    if (this.current?.kind === 'talk') {
      this.dialogIdx = DIALOGUE.length;
      this.subtitle = null;
      this.advance();
    } else if (this.current) this.advance();
  }

  private complete() {
    const m = this.active!;
    const g = this.game;
    this.stats.collisions = Math.max(0, (this.bike?.collisions ?? 0) - this.startCollisions);
    let reward = m.reward;
    if (m.id === 'm001_bienvenido' && this.stats.timeSec < 360) reward += 250;
    g.money += reward;
    this.completed.add(m.id);
    g.emit({ type: 'missionComplete', missionId: m.id, title: m.title, stats: { ...this.stats, timeSec: Math.round(this.stats.timeSec), distanceM: Math.round(this.stats.distanceM), topSpeedKmh: Math.round(this.stats.topSpeedKmh) }, reward, landmarks: g.landmarks.discovered().length });
    g.emit({ type: 'save', data: g.snapshot() });
    g.audio.success();
    this.active = null;
    this.route = [];
    this.beacon.visible = false;
    if (m.id === 'm001_bienvenido') this.offerTrial();
  }

  private fail(reason: string) {
    const m = this.active!;
    this.game.emit({ type: 'missionFailed', missionId: m.id, reason });
    this.active = null;
    this.route = [];
    this.beacon.visible = false;
    this.offerTrial();
  }

  update(dt: number) {
    const g = this.game;
    const p = g.player.position;
    (this.beacon.material as THREE.ShaderMaterial).uniforms.uTime.value += dt;
    // NPC Don Ramón
    const toPlayer = Math.atan2(p.x - this.ramon.x, p.z - this.ramon.z);
    this.ramonYaw += Math.atan2(Math.sin(toPlayer - this.ramonYaw), Math.cos(toPlayer - this.ramonYaw)) * Math.min(1, dt * 3);
    const dR = p.distanceTo(this.ramon);
    const anim = this.dialogIdx >= 0 && this.dialogIdx < DIALOGUE.length ? ANIM.TALK : dR < 14 && this.current?.kind === 'talk' ? ANIM.WAVE : ANIM.IDLE;
    this.npcs.set(0, this.ramon.x, this.ramon.y, this.ramon.z, this.ramonYaw, anim, 0);
    this.npcs.commit(1);
    // dialogue playback (E skips a line)
    if (this.dialogIdx >= 0 && this.dialogIdx < DIALOGUE.length) {
      this.dialogTimer -= dt;
      if (this.dialogTimer <= 0 || g.input.hit('interact')) {
        this.dialogIdx++;
        if (this.dialogIdx >= DIALOGUE.length) {
          this.subtitle = null;
          this.advance();
        } else {
          this.subtitle = DIALOGUE[this.dialogIdx];
          this.dialogTimer = 3.2 + this.subtitle.text.length * 0.03;
        }
      }
    }
    // optional time trial start marker
    if (!this.active && this.trialStart && g.vehicles.active && p.distanceTo(this.trialStart) < 8) {
      this.begin(MISSIONS[1]);
      this.stepIdx = 1;
      this.enterStep();
      g.emit({ type: 'notification', kind: 'info', title: 'Reto del Malecón', text: '¡Llega a la Fortaleza Ozama en menos de 75 segundos!' });
    }
    if (!this.active) {
      this.beacon.visible = false;
      const w = this.waypoint;
      if (w) {
        if (Math.hypot(p.x - w.x, p.z - w.z) < 14) {
          this.clearWaypoint();
          g.emit({ type: 'notification', kind: 'success', title: 'GPS', text: 'Llegaste a tu destino.' });
          g.audio.chime();
          return;
        }
        this.routeTimer -= dt;
        if (this.routeTimer <= 0) {
          this.routeTimer = 1.5;
          this.route = g.network.route(p.x, p.z, w.x, w.z);
          if (!this.route.length) this.route = [p.x, p.z, w.x, w.z];
          this.buildGpsRibbon();
        }
        return;
      }
      this.route = [];
      this.gps.visible = false;
      return;
    }
    const m = this.active;
    const s = this.current!;
    this.timer += dt;
    if (s.kind !== 'talk') {
      this.stats.timeSec += dt;
      const v = g.vehicles.active;
      if (v) {
        this.stats.distanceM += Math.abs(v.speed) * dt;
        this.stats.topSpeedKmh = Math.max(this.stats.topSpeedKmh, Math.abs(v.speed) * 3.6);
      }
    }
    if (m.timeLimit && this.timer > m.timeLimit) return this.fail('Se acabó el tiempo.');
    let target: THREE.Vector3 | null = null;
    if (s.kind === 'talk') target = this.ramon;
    else if (s.kind === 'mount') {
      if (!this.bike || !g.vehicles.list.includes(this.bike)) {
        this.bike = null;
        this.enterStep();
      }
      target = this.bike?.position ?? null;
      if (g.vehicles.active && g.vehicles.active === this.bike) this.advance();
    } else if (s.kind === 'checkpoint') {
      target = this.cpPos(s.cp);
      if (m.id === 'm001_bienvenido' && !g.vehicles.active && this.bike && g.vehicles.list.includes(this.bike) && p.distanceTo(this.bike.position) > 6) {
        target = this.bike.position;
      } else if (p.distanceTo(target) < 10 && (g.vehicles.active || m.id !== 'm001_bienvenido')) {
        g.emit({ type: 'notification', kind: 'success', title: 'Punto de control', text: s.cp.name });
        this.advance();
        return;
      }
      if (m.id === 'm001_bienvenido' && this.bike && !g.vehicles.list.includes(this.bike)) {
        // the bike was lost (e.g. fell in the sea): Don Ramón sends another one
        const f = g.player.forward;
        this.bike = g.vehicles.spawn('moto', p.x + f.x * 3, p.y + 0.4, p.z + f.z * 3, g.player.heading, 0xb3261e);
        g.emit({ type: 'notification', kind: 'info', title: 'Otro motor', text: 'Don Ramón te mandó otro motor con su sobrino.' });
      }
    } else if (s.kind === 'dismount') {
      target = this.cpPos((m.steps[m.steps.length - 2] as { cp: Checkpoint }).cp);
      if (!g.vehicles.active) this.advance();
      return;
    }
    // beacon + GPS route
    if (target && s.kind === 'checkpoint') {
      this.beacon.visible = true;
      this.beacon.position.set(target.x, 0, target.z);
    } else this.beacon.visible = false;
    this.routeTimer -= dt;
    if (target && this.routeTimer <= 0) {
      this.routeTimer = 1.5;
      this.route = s.kind === 'checkpoint' || s.kind === 'mount' ? g.network.route(p.x, p.z, target.x, target.z) : [];
      if (!this.route.length && target) this.route = [p.x, p.z, target.x, target.z];
      this.buildGpsRibbon();
    }
  }

  private buildGpsRibbon() {
    const r = this.route;
    const pos: number[] = [];
    const idx: number[] = [];
    let total = 0;
    for (let i = 0; i + 3 < r.length && total < 220; i += 2) {
      const ax = r[i];
      const az = r[i + 1];
      const bx = r[i + 2];
      const bz = r[i + 3];
      const l = Math.hypot(bx - ax, bz - az);
      if (l < 0.01) continue;
      total += l;
      const nx = (-(bz - az) / l) * 0.45;
      const nz = ((bx - ax) / l) * 0.45;
      const b = pos.length / 3;
      pos.push(ax + nx, 0.06, az + nz, ax - nx, 0.06, az - nz, bx + nx, 0.06, bz + nz, bx - nx, 0.06, bz - nz);
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    this.gpsGeo.dispose();
    this.gpsGeo = new THREE.BufferGeometry();
    this.gpsGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.gpsGeo.setIndex(idx);
    this.gps.geometry = this.gpsGeo;
    this.gps.visible = pos.length > 0;
  }

  hudInfo() {
    if (!this.active) return null;
    const s = this.current;
    const objective =
      !s ? '' : s.kind === 'talk' ? (this.dialogIdx >= 0 ? 'Escucha a Don Ramón' : 'Habla con Don Ramón en el colmado')
      : s.kind === 'mount' ? 'Súbete al motor de Don Ramón'
      : s.kind === 'checkpoint' ? (this.active.id === 'm001_bienvenido' && !this.game.vehicles.active ? `Vuelve al motor — luego ve a: ${s.cp.name}` : `Ve a: ${s.cp.name}`)
      : 'Bájate del motor y entrega el paquete';
    return { id: this.active.id, title: this.active.title, objective, step: this.stepIdx + 1, steps: this.active.steps.length, timer: this.active.timeLimit ? Math.max(0, Math.ceil(this.active.timeLimit - this.timer)) : undefined };
  }

  markers(): HudMarker[] {
    const out: HudMarker[] = [];
    const s = this.current;
    if (s?.kind === 'talk') out.push({ x: this.ramon.x, z: this.ramon.z, kind: 'npc', label: 'Don Ramón' });
    if (s?.kind === 'mount' && this.bike) out.push({ x: this.bike.position.x, z: this.bike.position.z, kind: 'vehicle', label: 'Motor' });
    if (s?.kind === 'checkpoint' && s.cp.pos) out.push({ x: s.cp.pos.x, z: s.cp.pos.z, kind: 'checkpoint', label: s.cp.name });
    if (!this.active && this.trialStart) out.push({ x: this.trialStart.x, z: this.trialStart.z, kind: 'activity', label: 'Reto del Malecón' });
    if (this.waypoint) out.push({ x: this.waypoint.x, z: this.waypoint.z, kind: 'objective', label: 'Destino' });
    return out;
  }
}
