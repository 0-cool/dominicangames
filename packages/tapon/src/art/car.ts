import { OUTLINE, type Pt, type Sprite, type WheelStyle, chromeGrad, finish, glassGrad, glassStreaks, paintGrad, panelLine, person, plate, poly, r1, roundedPath, shade, SHIRTS, SKINS, wheelWells } from './kit.ts';

/** Passenger seen through a window: x, seat base y, scale. */
export interface Rider {
  x: number;
  base: number;
  s?: number;
  skin?: string;
  shirt?: string;
  hat?: string;
}

/**
 * Generic side-view vehicle: a rounded body silhouette with wheels, windows (with passengers behind the glass),
 * panel lines, lights, bumpers and free-form extras. All coordinates are in sprite px (ground at `h`).
 */
export interface VehicleSpec {
  id: string;
  name: string;
  w: number;
  h: number;
  paint: string;
  paintStrength?: number;
  body: Pt[];
  radius: number | number[];
  wheels: { x: number; r: number; style: WheelStyle }[];
  windows: Pt[][];
  windowRadius?: number;
  glass?: string;
  /** Opacity of the glass over passengers (0.55 = tinted but see-through). */
  glassAlpha?: number;
  riders?: Rider[];
  /** Window index each rider is clipped to (default: the window that contains rider.x). */
  shoulder?: { from: number; to: number; y: number; y2?: number };
  head?: Pt[];
  tail?: Pt[];
  bumpers?: { pts: Pt[]; color?: string }[];
  doorLines?: string[];
  handles?: Pt[];
  mirror?: Pt;
  plate?: { x: number; y: number; text: string };
  /** SVG drawn before the body (behind it). */
  under?: string;
  /** SVG drawn on the paint, under the windows (decals, stripes, rust). Clipped to the body. */
  decals?: string;
  /** SVG drawn last (roof signs, cargo, people outside…). */
  over?: string;
  defs?: string;
  hitbox?: Sprite['hitbox'];
  anchors?: Sprite['anchors'];
}

export function vehicle(v: VehicleSpec): Sprite {
  const wheels = v.wheels.map((w) => ({ sprite: `wheel-${w.style}-${w.r}`, x: w.x, y: v.h - w.r, r: w.r }));
  const bodyD = roundedPath(v.body, v.radius);
  const defs = `${paintGrad('paint', v.paint, v.paintStrength ?? 1)}${glassGrad('glass', v.glass ?? '#2a3b4c')}${chromeGrad('chrome')}<clipPath id="bodyclip"><path d="${bodyD}"/></clipPath>${v.windows.map((w, i) => `<clipPath id="win${i}"><path d="${roundedPath(w, v.windowRadius ?? 4)}"/></clipPath>`).join('')}${v.defs ?? ''}`;
  const parts: string[] = [];
  if (v.under) parts.push(v.under);
  parts.push(`<path d="${bodyD}" fill="url(#paint)"/>`);
  if (v.decals) parts.push(`<g clip-path="url(#bodyclip)">${v.decals}</g>`);
  parts.push(wheelWells('bodyclip', wheels));
  // arch lips
  for (const w of wheels) parts.push(`<path d="M${r1(w.x - w.r - 6)},${r1(Math.min(v.h - 2, w.y + 6))} A${w.r + 6},${w.r + 6} 0 0 1 ${r1(w.x + w.r + 6)},${r1(Math.min(v.h - 2, w.y + 6))}" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="2.5" clip-path="url(#bodyclip)"/>`);
  // shoulder highlight (light from above)
  if (v.shoulder) {
    const s = v.shoulder;
    parts.push(`<path d="M${s.from},${s.y} L${s.to},${s.y2 ?? s.y}" stroke="#ffffff" stroke-width="2.4" opacity="0.38" stroke-linecap="round"/><path d="M${s.from},${s.y + 3} L${s.to},${(s.y2 ?? s.y) + 3}" stroke="#000000" stroke-width="1.2" opacity="0.18"/>`);
  }
  // windows: passengers, tinted glass, reflections, frames
  v.windows.forEach((w, i) => {
    const d = roundedPath(w, v.windowRadius ?? 4);
    const xs = w.map((p) => p[0]);
    const ys = w.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    parts.push(`<path d="${d}" fill="#16202b"/>`);
    const inside = (v.riders ?? []).filter((r) => r.x >= x0 - 4 && r.x <= x1 + 4);
    if (inside.length) parts.push(`<g clip-path="url(#win${i})">${inside.map((r, k) => person(r.x, r.base, r.s ?? 1, r.skin ?? SKINS[(i * 3 + k) % SKINS.length], r.shirt ?? SHIRTS[(i * 5 + k * 2) % SHIRTS.length], undefined, r.hat)).join('')}</g>`);
    parts.push(`<path d="${d}" fill="url(#glass)" opacity="${v.glassAlpha ?? 0.62}"/>`);
    parts.push(glassStreaks(`win${i}`, x0, y0, x1 - x0, y1 - y0));
    parts.push(`<path d="${d}" fill="none" stroke="${OUTLINE}" stroke-width="2.2"/>`);
  });
  for (const d of v.doorLines ?? []) parts.push(panelLine(d));
  for (const [x, y] of v.handles ?? []) parts.push(`<rect x="${x - 7}" y="${y - 2}" width="14" height="4" rx="2" fill="${shade(v.paint, -0.35)}" stroke="rgba(0,0,0,0.5)" stroke-width="0.8"/><rect x="${x - 6}" y="${y - 1.6}" width="12" height="1.2" rx="0.6" fill="#ffffff" opacity="0.35"/>`);
  for (const b of v.bumpers ?? []) parts.push(`<path d="${roundedPath(b.pts, 3)}" fill="${b.color ?? '#2a2d32'}" stroke="${OUTLINE}" stroke-width="1.6"/><path d="${poly([b.pts[0], b.pts[1]])}" stroke="#ffffff" stroke-width="1" opacity="0.18"/>`);
  if (v.head) parts.push(`<path d="${roundedPath(v.head, 3)}" fill="#fff8dc" stroke="${OUTLINE}" stroke-width="1.6"/><path d="${roundedPath(v.head, 3)}" fill="url(#chrome)" opacity="0.35"/><circle cx="${r1((v.head[0][0] + v.head[2][0]) / 2)}" cy="${r1((v.head[0][1] + v.head[2][1]) / 2)}" r="2" fill="#ffffff"/>`);
  if (v.tail) parts.push(`<path d="${roundedPath(v.tail, 3)}" fill="#d32f2f" stroke="${OUTLINE}" stroke-width="1.6"/><path d="${roundedPath(v.tail, 3)}" fill="#ff8a80" opacity="0.25" transform="translate(0.8,-1)"/>`);
  if (v.mirror) {
    const [x, y] = v.mirror;
    parts.push(`<path d="M${x},${y} L${x + 3},${y - 10} L${x + 12},${y - 11} L${x + 13},${y - 3} Z" fill="${shade(v.paint, -0.15)}" stroke="${OUTLINE}" stroke-width="1.5" stroke-linejoin="round"/>`);
  }
  if (v.plate) parts.push(plate(v.plate.x, v.plate.y, v.plate.text));
  // body outline last so every edge reads clearly
  parts.push(`<path d="${bodyD}" fill="none" stroke="${OUTLINE}" stroke-width="2.6" stroke-linejoin="round"/>`);
  if (v.over) parts.push(v.over);
  const hb = v.hitbox ?? { x: Math.min(...v.body.map((p) => p[0])) + 4, y: Math.min(...v.body.map((p) => p[1])), w: Math.max(...v.body.map((p) => p[0])) - Math.min(...v.body.map((p) => p[0])) - 8, h: v.h - Math.min(...v.body.map((p) => p[1])) };
  return finish(v.id, v.name, v.w, v.h, defs, parts.join(''), wheels, hb, v.anchors);
}

/** Irregular rust patch (deterministic). */
export function rust(x: number, y: number, s: number, seed: number): string {
  const pts: Pt[] = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 0.6 + 0.4 * Math.abs(Math.sin(seed * 12.9898 + i * 78.233));
    pts.push([x + Math.cos(a) * s * k * 1.4, y + Math.sin(a) * s * k * 0.8]);
  }
  return `<path d="${roundedPath(pts, s * 0.3)}" fill="#7a4a2a" opacity="0.55"/><path d="${roundedPath(pts.map(([px, py]) => [x + (px - x) * 0.55, y + (py - y) * 0.55] as Pt), s * 0.2)}" fill="#4e2e1a" opacity="0.5"/>`;
}

/** A dent: a short dark crease with a highlight. */
export function dent(x: number, y: number, len: number): string {
  return `<path d="M${x},${y} q${len / 2},${len * 0.25} ${len},0" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.6"/><path d="M${x + 1},${y + 2} q${len / 2},${len * 0.25} ${len - 2},0" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>`;
}
