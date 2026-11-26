import type { Sprite } from '../art/kit.ts';
import { LANES, LIVES, PLAYER_X, PX, VIEW_H, VIEW_W, stageName } from '../config.ts';
import type { Entity, World } from '../sim/world.ts';
import type { SpriteCache } from './images.ts';
import { LAYER, Street } from './street.ts';

type Ctx = CanvasRenderingContext2D;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const laneY = (lp: number) => {
  const i = Math.max(0, Math.min(1, Math.floor(lp)));
  return lerp(LANES[i].y, LANES[i + 1].y, clamp01(lp - i));
};
export const laneS = (lp: number) => {
  const i = Math.max(0, Math.min(1, Math.floor(lp)));
  return lerp(LANES[i].s, LANES[i + 1].s, clamp01(lp - i));
};

export const FONT_NUM = "'Anton', Impact, 'Arial Black', sans-serif";
export const FONT_TXT = "'Inter Variable', 'Inter', 'Segoe UI', Arial, sans-serif";

interface Popup {
  text: string;
  x: number;
  y: number;
  t: number;
  color: string;
  big?: boolean;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  color: string;
  size: number;
}

/** Sky colours by hour (top, horizon). */
const SKY: [number, string, string][] = [
  [16.5, '#4f9fe8', '#cfe8f7'],
  [17.6, '#5a8fd6', '#ffd9a0'],
  [18.4, '#5a5fa8', '#ff9a6b'],
  [19.0, '#2f3570', '#d96a6a'],
  [19.8, '#141b3d', '#41406e'],
  [21.5, '#0b1027', '#1d2347'],
];
function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, t));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
function skyAt(h: number): [string, string] {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [h0, t0, b0] = SKY[i];
    const [h1, t1, b1] = SKY[i + 1];
    if (h <= h1) {
      const t = clamp01((h - h0) / (h1 - h0));
      return [mix(t0, t1, t), mix(b0, b1, t)];
    }
  }
  return [SKY[SKY.length - 1][1], SKY[SKY.length - 1][2]];
}

export interface HudExtra {
  best: number;
  paused: boolean;
  /** Draw the score/avenue/cascos HUD (off in the attract-mode menu). */
  hud?: boolean;
  fps?: number;
  muted?: boolean;
}

/**
 * Draws El Tapón on a 2D canvas at the 1920×1080 reference size (the canvas backing store can be any 16:9 size).
 */
export class Renderer {
  private popups: Popup[] = [];
  private particles: Particle[] = [];
  private shake = 0;
  private flash = 0;
  private banner: { text: string; t: number } | null = null;
  scale = 1;

  constructor(
    private readonly g: Ctx,
    private readonly cache: SpriteCache,
    private readonly sprites: Map<string, Sprite>,
    private readonly street: Street,
  ) {}

  /** Hour of the day for a distance: 17:00 at the start, night after ≈3.5 km. */
  static hour(dist: number) {
    return Math.min(21.5, 17 + dist / 1400);
  }

  // ───────────────────────── effects API ─────────────────────────
  popup(text: string, x: number, y: number, color = '#ffffff', big = false) {
    this.popups.push({ text, x, y, t: 0, color, big });
  }
  burst(x: number, y: number, colors: string[], n = 14, speed = 260) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, t: 0, life: 0.5 + Math.random() * 0.5, color: colors[i % colors.length], size: 4 + Math.random() * 6 });
    }
  }
  shakeBy(a: number) {
    this.shake = Math.min(1, this.shake + a);
  }
  hit() {
    this.flash = 1;
    this.shakeBy(0.8);
  }
  stage(stage: number) {
    this.banner = { text: stageName(stage), t: 0 };
  }

  // ───────────────────────── frame ─────────────────────────
  draw(w: World, extra: HudExtra, dt: number) {
    const g = this.g;
    const t = w.t;
    g.save();
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    if (this.shake > 0) {
      g.translate((Math.random() - 0.5) * 22 * this.shake, (Math.random() - 0.5) * 16 * this.shake);
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }
    const hour = Renderer.hour(w.dist);
    const night = smooth(18.7, 19.7, hour);
    this.sky(hour, t);
    this.layers(w.dist, night, t);
    this.road(w.dist);
    this.traffic(w, t);
    this.foreground(w, t);
    if (night > 0.01) this.night(w, night);
    this.fx(dt);
    g.restore();
    if (extra.hud !== false) {
      g.save();
      g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      this.hud(w, extra, dt);
      g.restore();
    }
  }

  private img(id: string) {
    return this.cache.get(id);
  }

  private sky(hour: number, t: number) {
    const g = this.g;
    const [top, bottom] = skyAt(hour);
    const grad = g.createLinearGradient(0, 0, 0, 620);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, VIEW_W, 640);
    // sun going down behind the city
    const sunY = lerp(120, 640, smooth(16.5, 19, hour));
    const sunX = 1500;
    const halo = g.createRadialGradient(sunX, sunY, 10, sunX, sunY, 220);
    halo.addColorStop(0, 'rgba(255,236,180,0.85)');
    halo.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = halo;
    g.fillRect(sunX - 240, sunY - 240, 480, 480);
    g.fillStyle = hour < 18.5 ? '#fff3c4' : '#ffb26b';
    g.beginPath();
    g.arc(sunX, sunY, 42, 0, Math.PI * 2);
    g.fill();
    // a few soft clouds drifting
    g.fillStyle = `rgba(255,255,255,${0.55 * (1 - smooth(19, 20, hour))})`;
    for (let i = 0; i < 5; i++) {
      const x = ((i * 470 - t * 12) % 2400) - 200 + (i % 2) * 120;
      const y = 90 + (i % 3) * 70;
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.ellipse(x + k * 46, y + (k % 2) * 10, 70, 26, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    // stars at night
    if (hour > 19.4) {
      g.fillStyle = `rgba(255,255,255,${smooth(19.4, 20.2, hour) * 0.8})`;
      for (let i = 0; i < 60; i++) g.fillRect((i * 331) % VIEW_W, (i * 97) % 420, 2, 2);
    }
  }

  private layers(dist: number, night: number, t: number) {
    const g = this.g;
    // distant towers
    const sky = this.img('skyline');
    if (sky) {
      const art = this.street.skyline();
      const sw = art.w * LAYER.skyline.s;
      const off = (((dist * PX * LAYER.skyline.parallax) % sw) + sw) % sw;
      g.globalAlpha = 0.75;
      for (let x = -off; x < VIEW_W; x += sw) g.drawImage(sky, x, LAYER.skyline.y - art.h * LAYER.skyline.s, sw, art.h * LAYER.skyline.s);
      g.globalAlpha = 1;
    }
    // buildings
    const sb = LAYER.buildings.s;
    for (const b of this.street.buildings) {
      const x = Street.sx(b.x, dist, sb);
      const bw = b.w * sb;
      if (x > VIEW_W || x + bw < 0) continue;
      const bmp = this.img(b.id);
      if (bmp) g.drawImage(bmp, x, LAYER.buildings.y - b.h * sb, bw, b.h * sb);
      else {
        g.fillStyle = '#c9b8a6';
        g.fillRect(x, LAYER.buildings.y - b.h * sb, bw, b.h * sb);
      }
      if (night > 0.01 && b.windows) {
        g.globalCompositeOperation = 'lighter';
        for (const [wx, wy, ww, wh] of b.windows) {
          const on = Math.sin(b.x * 13.1 + wx * 0.7) > -0.2;
          if (!on) continue;
          g.fillStyle = `rgba(255,190,110,${0.35 * night})`;
          g.fillRect(x + wx * sb, LAYER.buildings.y - (b.h - wy) * sb, ww * sb, wh * sb);
        }
        g.globalCompositeOperation = 'source-over';
      }
    }
    // upper sidewalk + curb
    g.fillStyle = '#b9b2a7';
    g.fillRect(0, LAYER.buildings.y - 2, VIEW_W, 44);
    g.fillStyle = '#a39b8e';
    const tile = 60 * LAYER.upper.s;
    const off = (dist * PX * LAYER.upper.s) % tile;
    for (let x = -off; x < VIEW_W; x += tile) g.fillRect(x, LAYER.buildings.y + 2, 2, 38);
    this.curb(650, dist, LAYER.upper.s, 12);
    // poles, trees, bus stops, vendors, people
    const su = LAYER.upper.s;
    const poles: [number, number][] = [];
    for (const p of this.street.upper) {
      const x = Street.sx(p.x, dist, su);
      if (x > VIEW_W + 300 || x + p.w * su < -300) continue;
      if (p.kind === 'pole' && p.top) poles.push([x + p.top.x * su, LAYER.upper.y - (p.h - p.top.y) * su]);
      const bmp = this.img(p.id);
      if (!bmp) continue;
      const bob = p.kind === 'person' ? Math.abs(Math.sin(t * 6 + p.x)) * 3 : 0;
      g.drawImage(bmp, x, LAYER.upper.y - p.h * su - bob, p.w * su, p.h * su);
    }
    // the cables: several sagging lines between poles, and some running off to the buildings
    g.strokeStyle = '#15171a';
    g.lineWidth = 2;
    for (let i = 0; i < poles.length; i++) {
      const [x0, y0] = poles[i];
      const [x1, y1] = poles[i + 1] ?? [x0 + 900, y0 - 30];
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.moveTo(x0, y0 + k * 7);
        g.quadraticCurveTo((x0 + x1) / 2, Math.max(y0, y1) + 50 + k * 16, x1, y1 + k * 7);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(x0, y0 + 20);
      g.quadraticCurveTo(x0 - 140, y0 + 70, x0 - 260, y0 + 140);
      g.stroke();
    }
  }

  private curb(y: number, dist: number, s: number, h: number) {
    const g = this.g;
    g.fillStyle = '#d8d2c4';
    g.fillRect(0, y, VIEW_W, h);
    // painted yellow / black blocks
    const block = 90 * s;
    const off = (dist * PX * s) % (block * 2);
    g.fillStyle = '#e8b923';
    for (let x = -off; x < VIEW_W; x += block * 2) g.fillRect(x, y + 2, block, h - 4);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, y + h - 2, VIEW_W, 2);
  }

  private road(dist: number) {
    const g = this.g;
    const top = 660;
    const bottom = 1004;
    const grad = g.createLinearGradient(0, top, 0, bottom);
    grad.addColorStop(0, '#5b5d60');
    grad.addColorStop(1, '#46484b');
    g.fillStyle = grad;
    g.fillRect(0, top, VIEW_W, bottom - top);
    // patches, cracks and manholes (deterministic along the road)
    for (let lane = 0; lane < 3; lane++) {
      const s = LANES[lane].s;
      const y = LANES[lane].y;
      const span = (VIEW_W / (PX * s)) | 0;
      const start = Math.floor((dist - 6) / 9);
      for (let k = start; k < start + span / 9 + 3; k++) {
        const r = Math.abs(Math.sin(k * 12.9898 + lane * 78.233) * 43758.5453) % 1;
        const x = PLAYER_X + (k * 9 - dist) * PX * s;
        if (r < 0.22) {
          g.fillStyle = 'rgba(30,30,32,0.35)';
          g.beginPath();
          g.ellipse(x, y - 24 * s, 70 * s * (0.6 + r), 14 * s, 0, 0, Math.PI * 2);
          g.fill();
        } else if (r < 0.28) {
          g.fillStyle = '#3a3b3d';
          g.beginPath();
          g.ellipse(x, y - 20 * s, 34 * s, 9 * s, 0, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = '#2a2b2d';
          g.lineWidth = 2;
          g.stroke();
        } else if (r < 0.4) {
          g.strokeStyle = 'rgba(25,25,27,0.6)';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(x, y - 30 * s);
          g.lineTo(x + 30 * s, y - 22 * s);
          g.lineTo(x + 46 * s, y - 34 * s);
          g.stroke();
        }
      }
    }
    // worn lane markings between lanes
    for (const [y, s] of [
      [(LANES[0].y + LANES[1].y) / 2 - 8, (LANES[0].s + LANES[1].s) / 2],
      [(LANES[1].y + LANES[2].y) / 2 - 8, (LANES[1].s + LANES[2].s) / 2],
    ]) {
      const dash = 3 * PX * s;
      const off = (dist * PX * s) % (dash * 2);
      g.fillStyle = 'rgba(236,236,226,0.75)';
      for (let x = -off; x < VIEW_W; x += dash * 2) g.fillRect(x, y, dash, 6 * s);
    }
  }

  private traffic(w: World, t: number) {
    const all: { lp: number; draw: () => void }[] = [];
    for (const e of w.entities) all.push({ lp: e.lanePos + (e.cat === 'obstacle' ? -0.001 : 0), draw: () => this.entity(e, w, t) });
    all.push({ lp: w.lanePos + 0.0005, draw: () => this.player(w, t) });
    all.sort((a, b) => a.lp - b.lp);
    for (const d of all) d.draw();
    // passengers waiting on the sidewalks
    for (const c of w.clients) {
      if (c.picked) continue;
      const lower = c.side === 2;
      const s = lower ? 1.0 : LAYER.upper.s;
      const x = Street.sx(c.x - 0.6, w.dist, s);
      if (x > VIEW_W || x < -100) continue;
      const sp = this.sprites.get(`cliente-${c.look}`);
      const bmp = this.img(`cliente-${c.look}`);
      if (!sp || !bmp) continue;
      const base = lower ? 1046 : 652;
      const bob = Math.abs(Math.sin(t * 5)) * 6;
      this.g.drawImage(bmp, x, base - sp.h * s - bob, sp.w * s, sp.h * s);
      // a bouncing marker so it reads as a pickup
      this.g.fillStyle = '#ffd23f';
      this.g.beginPath();
      const my = base - sp.h * s - 30 - bob * 2;
      this.g.moveTo(x + 30 * s, my);
      this.g.lineTo(x + 46 * s, my - 18);
      this.g.lineTo(x + 14 * s, my - 18);
      this.g.fill();
    }
  }

  private entity(e: Entity, w: World, t: number) {
    const g = this.g;
    const sp = this.sprites.get(e.sprite);
    const bmp = this.img(e.sprite);
    if (!sp || !bmp) return;
    const s = laneS(e.lanePos);
    const x = PLAYER_X + (e.x - w.dist) * PX * s;
    if (x > VIEW_W + 50 || x + sp.w * s < -50) return;
    let base = laneY(e.lanePos);
    let rot = 0;
    if (e.fall) {
      const k = e.fall.t;
      base -= e.fall.h * s * (1 - k) * (1 - k) - Math.sin(k * Math.PI) * 30 * s;
      rot = (1 - k) * 2.4;
    }
    const moving = e.cat === 'vehicle';
    const bob = moving ? Math.sin(t * (e.v > 0.3 ? 9 : 2) + e.bob) * (e.v > 0.3 ? 1.6 : 0.6) * s : 0;
    if (moving) {
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.beginPath();
      g.ellipse(x + sp.w * s * 0.5, base, sp.w * s * 0.47, 9 * s, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.save();
    if (rot) {
      g.translate(x + (sp.w * s) / 2, base - (sp.h * s) / 2);
      g.rotate(rot);
      g.translate(-(x + (sp.w * s) / 2), -(base - (sp.h * s) / 2));
    }
    g.drawImage(bmp, x, base - sp.ground * s + bob, sp.w * s, sp.h * s);
    for (const o of e.overlays) {
      const os = this.sprites.get(o);
      const ob = this.img(o);
      if (os && ob) g.drawImage(ob, x, base - os.ground * s + bob, os.w * s, os.h * s);
    }
    for (const wh of sp.wheels) {
      const wb = this.img(wh.sprite);
      const ws = this.sprites.get(wh.sprite);
      if (!wb || !ws) continue;
      const cx = x + wh.x * s;
      const cy = base - (sp.ground - wh.y) * s;
      g.save();
      g.translate(cx, cy);
      g.rotate(e.wheel);
      g.drawImage(wb, (-ws.w / 2) * s, (-ws.h / 2) * s, ws.w * s, ws.h * s);
      g.restore();
    }
    g.restore();
    const bodyTop = base - (sp.ground - sp.hitbox.y) * s;
    const lowY = lerp(bodyTop, base, 0.62);
    // blinkers before / during a lane change
    if ((e.blinkT > 0 || e.changeT >= 0) && Math.floor(t * 4) % 2 === 0) {
      g.fillStyle = '#ffab00';
      for (const bx of [x + 8 * s, x + (sp.w - 8) * s]) {
        g.beginPath();
        g.arc(bx, lowY, 7 * s, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgba(255,171,0,0.35)';
      g.beginPath();
      g.arc(x + (sp.w - 8) * s, lowY, 18 * s, 0, Math.PI * 2);
      g.fill();
    }
    // brake lights when stopping
    if (moving && (e.stopT > 0 || e.v < e.vCruise - 0.6)) {
      const grd = g.createRadialGradient(x + 6 * s, lowY, 1, x + 6 * s, lowY, 26 * s);
      grd.addColorStop(0, 'rgba(255,40,40,0.95)');
      grd.addColorStop(1, 'rgba(255,40,40,0)');
      g.fillStyle = grd;
      g.fillRect(x - 24 * s, lowY - 26 * s, 60 * s, 52 * s);
    }
    // sirens
    if (e.siren) {
      const red = Math.floor(t * 6) % 2 === 0;
      const sx = x + sp.w * s * (e.kind === 'policia' || e.kind === 'policia-parada' ? 0.6 : 0.2);
      const sy = base - sp.ground * s + 30 * s;
      const grd = g.createRadialGradient(sx, sy, 1, sx, sy, 70 * s);
      grd.addColorStop(0, red ? 'rgba(255,50,50,0.9)' : 'rgba(60,110,255,0.9)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(sx - 70 * s, sy - 70 * s, 140 * s, 140 * s);
    }
    const say = e.say?.text ?? (e.pare !== undefined && e.pare > 0 ? '¡PARE!' : null);
    if (say) this.bubble(x + sp.w * s * (e.kind === 'guagua' ? 0.86 : 0.5), base - sp.h * s - 12, say);
    if (e.kind === 'casco') {
      const k = 0.5 + 0.5 * Math.sin(t * 6);
      g.strokeStyle = `rgba(255,220,80,${0.4 + 0.4 * k})`;
      g.lineWidth = 4;
      g.beginPath();
      g.arc(x + (sp.w * s) / 2, base - (sp.h * s) / 2, 44 * s, 0, Math.PI * 2);
      g.stroke();
    }
  }

  private bubble(x: number, y: number, text: string) {
    const g = this.g;
    g.font = `800 26px ${FONT_TXT}`;
    const w = g.measureText(text).width + 30;
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#1b1e23';
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(x - w / 2, y - 52, w, 44, 14);
    g.moveTo(x - 10, y - 9);
    g.lineTo(x, y + 6);
    g.lineTo(x + 10, y - 9);
    g.fill();
    g.stroke();
    g.fillStyle = '#c62828';
    g.textAlign = 'center';
    g.fillText(text, x, y - 21);
  }

  private player(w: World, t: number) {
    const g = this.g;
    const s = laneS(w.lanePos);
    const base = laneY(w.lanePos);
    const moto = this.sprites.get('moto-jugador')!;
    const x = PLAYER_X;
    const lean = (w.laneTarget - w.lanePos) * -0.16;
    const bob = Math.sin(t * 14) * 1.4 * s;
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.ellipse(x + moto.w * s * 0.52, base, moto.w * s * 0.48, 8 * s, 0, 0, Math.PI * 2);
    g.fill();
    g.save();
    if (w.invuln > 0 && Math.floor(t * 12) % 2 === 0) g.globalAlpha = 0.35;
    g.translate(x + moto.w * s * 0.5, base);
    g.rotate(lean);
    g.translate(-(x + moto.w * s * 0.5), -base);
    const layer = (id: string, dy = 0) => {
      const sp = this.sprites.get(id);
      const b = this.img(id);
      if (sp && b) g.drawImage(b, x, base - sp.ground * s + dy, sp.w * s, sp.h * s);
    };
    layer('moto-jugador', bob * 0.4);
    for (const wh of moto.wheels) {
      const wb = this.img(wh.sprite);
      const ws = this.sprites.get(wh.sprite);
      if (!wb || !ws) continue;
      g.save();
      g.translate(x + wh.x * s, base - (moto.ground - wh.y) * s);
      g.rotate(w.dist / 0.31);
      g.drawImage(wb, (-ws.w / 2) * s, (-ws.h / 2) * s, ws.w * s, ws.h * s);
      g.restore();
    }
    if (w.passenger) layer(`pasajero-${w.passenger.kind}`, bob);
    layer('motoconchista', bob);
    g.restore();
  }

  private foreground(w: World, t: number) {
    const g = this.g;
    this.curb(1000, w.dist, 1.0, 14);
    g.fillStyle = '#c4bdb1';
    g.fillRect(0, 1014, VIEW_W, VIEW_H - 1014);
    const tile = 66 * LAYER.lower.s;
    const off = (w.dist * PX * LAYER.lower.s) % tile;
    g.fillStyle = '#b3ab9d';
    for (let x = -off; x < VIEW_W; x += tile) g.fillRect(x, 1016, 3, VIEW_H);
    const s = LAYER.lower.s;
    for (const p of this.street.lower) {
      const x = Street.sx(p.x, w.dist, s);
      if (x > VIEW_W + 100 || x + p.w * s < -100) continue;
      const bmp = this.img(p.id);
      if (!bmp) continue;
      // foreground items are kept short (scaled down) so they never hide the near lane
      const k = p.kind === 'person' ? 0.62 : 0.5;
      const bob = p.kind === 'person' ? Math.abs(Math.sin(t * 6 + p.x)) * 3 : 0;
      g.drawImage(bmp, x, LAYER.lower.y - p.h * s * k - bob, p.w * s * k, p.h * s * k);
    }
  }

  private night(w: World, n: number) {
    const g = this.g;
    g.fillStyle = `rgba(12,18,48,${0.5 * n})`;
    g.globalCompositeOperation = 'multiply';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    g.globalCompositeOperation = 'lighter';
    // street lamps on the poles
    const su = LAYER.upper.s;
    for (const p of this.street.upper) {
      if (p.kind !== 'pole' || !p.top) continue;
      const x = Street.sx(p.x, w.dist, su) + p.top.x * su;
      const y = LAYER.upper.y - (p.h - p.top.y) * su;
      if (x < -200 || x > VIEW_W + 200) continue;
      const grd = g.createRadialGradient(x, y + 40, 4, x, y + 220, 380);
      grd.addColorStop(0, `rgba(255,200,120,${0.45 * n})`);
      grd.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = grd;
      g.fillRect(x - 380, y - 60, 760, 700);
    }
    // headlights and tail lights
    for (const e of w.entities) {
      if (e.cat !== 'vehicle') continue;
      const sp = this.sprites.get(e.sprite)!;
      const s = laneS(e.lanePos);
      const x = PLAYER_X + (e.x - w.dist) * PX * s;
      if (x > VIEW_W + 400 || x + sp.w * s < -100) continue;
      const base = laneY(e.lanePos);
      const y = base - (sp.ground - sp.hitbox.y) * s * 0.45;
      const fx = x + sp.w * s;
      const beam = g.createLinearGradient(fx, y, fx + 260 * s, y);
      beam.addColorStop(0, `rgba(255,244,200,${0.45 * n})`);
      beam.addColorStop(1, 'rgba(255,244,200,0)');
      g.fillStyle = beam;
      g.beginPath();
      g.moveTo(fx, y - 6 * s);
      g.lineTo(fx + 260 * s, y - 40 * s);
      g.lineTo(fx + 260 * s, y + 50 * s);
      g.lineTo(fx, y + 10 * s);
      g.fill();
      const tl = g.createRadialGradient(x + 6 * s, y, 1, x + 6 * s, y, 24 * s);
      tl.addColorStop(0, `rgba(255,40,40,${0.7 * n})`);
      tl.addColorStop(1, 'rgba(255,40,40,0)');
      g.fillStyle = tl;
      g.fillRect(x - 20 * s, y - 24 * s, 50 * s, 48 * s);
    }
    // the moto's own headlight
    const s = laneS(w.lanePos);
    const py = laneY(w.lanePos) - 90 * s;
    const px = PLAYER_X + 150 * s;
    const beam = g.createLinearGradient(px, py, px + 420, py);
    beam.addColorStop(0, `rgba(255,248,215,${0.55 * n})`);
    beam.addColorStop(1, 'rgba(255,248,215,0)');
    g.fillStyle = beam;
    g.beginPath();
    g.moveTo(px, py - 6);
    g.lineTo(px + 420, py - 50);
    g.lineTo(px + 420, py + 90);
    g.lineTo(px, py + 8);
    g.fill();
    g.globalCompositeOperation = 'source-over';
  }

  private fx(dt: number) {
    const g = this.g;
    for (const p of this.particles) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 900 * dt;
      g.globalAlpha = clamp01(1 - p.t / p.life);
      g.fillStyle = p.color;
      g.fillRect(p.x, p.y, p.size, p.size);
    }
    g.globalAlpha = 1;
    this.particles = this.particles.filter((p) => p.t < p.life);
    for (const p of this.popups) {
      p.t += dt;
      const a = clamp01(1.4 - p.t);
      g.globalAlpha = a;
      g.font = `${p.big ? 64 : 38}px ${FONT_NUM}`;
      g.textAlign = 'center';
      g.lineWidth = 7;
      g.strokeStyle = 'rgba(15,17,22,0.85)';
      const y = p.y - p.t * 90;
      g.strokeText(p.text, p.x, y);
      g.fillStyle = p.color;
      g.fillText(p.text, p.x, y);
    }
    g.globalAlpha = 1;
    this.popups = this.popups.filter((p) => p.t < 1.4);
    if (this.flash > 0) {
      const grd = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 300, VIEW_W / 2, VIEW_H / 2, 1100);
      grd.addColorStop(0, 'rgba(255,0,0,0)');
      grd.addColorStop(1, `rgba(220,20,20,${0.5 * this.flash})`);
      g.fillStyle = grd;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      this.flash = Math.max(0, this.flash - dt * 2.5);
    }
  }

  // ───────────────────────── HUD ─────────────────────────
  private hud(w: World, x: HudExtra, dt: number) {
    const g = this.g;
    g.textBaseline = 'alphabetic';
    // score
    g.textAlign = 'left';
    g.fillStyle = 'rgba(10,12,20,0.55)';
    g.beginPath();
    g.roundRect(28, 24, 380, 128, 22);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = `64px ${FONT_NUM}`;
    g.fillText(w.score.toLocaleString('es-DO'), 52, 98);
    g.font = `600 22px ${FONT_TXT}`;
    g.fillStyle = '#c9d2e3';
    g.fillText(`Récord ${Math.max(x.best, w.score).toLocaleString('es-DO')}`, 54, 134);
    if (w.multiplier > 1) {
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.roundRect(300, 46, 92, 46, 14);
      g.fill();
      g.fillStyle = '#1b1e23';
      g.font = `34px ${FONT_NUM}`;
      g.textAlign = 'center';
      g.fillText(`×${w.multiplier.toFixed(1).replace('.0', '')}`, 346, 82);
      // combo timer
      g.fillStyle = 'rgba(255,210,63,0.6)';
      g.fillRect(300, 98, 92 * clamp01(w.comboT / 4), 6);
    }
    // avenue, distance, speed
    g.textAlign = 'center';
    g.fillStyle = 'rgba(10,12,20,0.55)';
    g.beginPath();
    g.roundRect(VIEW_W / 2 - 260, 24, 520, 92, 22);
    g.fill();
    g.fillStyle = '#ffd23f';
    g.font = `800 20px ${FONT_TXT}`;
    g.fillText(stageName(w.stage).toUpperCase(), VIEW_W / 2, 56);
    g.fillStyle = '#ffffff';
    g.font = `40px ${FONT_NUM}`;
    g.fillText(`${(w.dist / 1000).toFixed(2)} km  ·  ${Math.round(w.v * 3.6)} km/h`, VIEW_W / 2, 100);
    // cascos
    const casco = this.img('casco');
    for (let i = 0; i < LIVES; i++) {
      const cx = VIEW_W - 92 - i * 78;
      g.globalAlpha = i < w.lives ? 1 : 0.22;
      if (casco) g.drawImage(casco, cx - 34, 30, 76, 76);
      g.globalAlpha = 1;
    }
    // passenger on board
    if (w.passenger) {
      const left = Math.max(0, w.passenger.until - w.dist);
      g.fillStyle = 'rgba(10,12,20,0.55)';
      g.beginPath();
      g.roundRect(VIEW_W - 420, 124, 392, 58, 16);
      g.fill();
      g.fillStyle = '#ffffff';
      g.textAlign = 'left';
      g.font = `700 22px ${FONT_TXT}`;
      g.fillText(`Pasajero a bordo · faltan ${Math.ceil(left)} m`, VIEW_W - 402, 160);
    }
    // warnings: an arrow at the edge of the threatened lane
    for (const warn of w.warnings) {
      const y = laneY(warn.lane) - 70;
      const pulse = 0.6 + 0.4 * Math.sin(w.t * 10);
      const left = !!warn.behind;
      const x0 = left ? 20 : VIEW_W - 20;
      g.globalAlpha = pulse;
      g.fillStyle = warn.kind === 'sirena' || warn.kind === 'chequeo' ? '#3d6bff' : '#ff7a1a';
      g.beginPath();
      if (left) {
        g.moveTo(x0, y);
        g.lineTo(x0 + 44, y - 34);
        g.lineTo(x0 + 44, y + 34);
      } else {
        g.moveTo(x0, y);
        g.lineTo(x0 - 44, y - 34);
        g.lineTo(x0 - 44, y + 34);
      }
      g.fill();
      g.globalAlpha = 1;
      g.font = `800 24px ${FONT_TXT}`;
      const tw = g.measureText(warn.text).width + 34;
      const bx = left ? x0 + 56 : x0 - 56 - tw;
      g.fillStyle = 'rgba(10,12,20,0.72)';
      g.beginPath();
      g.roundRect(bx, y - 24, tw, 48, 14);
      g.fill();
      g.fillStyle = '#ffffff';
      g.textAlign = 'left';
      g.fillText(warn.text, bx + 17, y + 9);
    }
    // avenue banner
    if (this.banner) {
      this.banner.t += dt;
      const a = clamp01(Math.min(this.banner.t * 3, 3 - this.banner.t));
      g.globalAlpha = a;
      g.textAlign = 'center';
      g.font = `86px ${FONT_NUM}`;
      g.lineWidth = 10;
      g.strokeStyle = 'rgba(10,12,20,0.8)';
      g.strokeText(this.banner.text.toUpperCase(), VIEW_W / 2, 330);
      g.fillStyle = '#ffd23f';
      g.fillText(this.banner.text.toUpperCase(), VIEW_W / 2, 330);
      g.globalAlpha = 1;
      if (this.banner.t > 3) this.banner = null;
    }
    if (x.fps !== undefined) {
      g.textAlign = 'right';
      g.font = `600 16px ${FONT_TXT}`;
      g.fillStyle = '#ffffff';
      g.fillText(`${x.fps} fps`, VIEW_W - 24, VIEW_H - 20);
    }
  }
}
