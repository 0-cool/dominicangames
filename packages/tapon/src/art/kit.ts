/**
 * Art kit for El Tapón's sprites: original side-view illustrations generated as SVG (no photos, no copied
 * artwork). Style guide (docs/EL_TAPON.md §3): light from the upper left, dark outlines, painted gradients,
 * glass with reflection streaks, separate wheels so they can turn. 75 px = 1 m.
 */

export const PX_PER_M = 75;
export const OUTLINE = '#1b1e23';
export const FONT = "'Arial Black', 'Arial Bold', Arial, Helvetica, sans-serif";

export interface WheelSpec {
  /** Wheel sprite id (see `wheelSprite`). */
  sprite: string;
  /** Centre in sprite coordinates. */
  x: number;
  y: number;
  r: number;
}

export interface Sprite {
  id: string;
  /** Spanish display name. */
  name: string;
  /** Size in px at scale 1 (near lane). */
  w: number;
  h: number;
  /** Complete standalone SVG document (wheels not included, see `wheels`). */
  svg: string;
  wheels: WheelSpec[];
  /** Collision box in sprite px. Lane collisions use its horizontal extent. */
  hitbox: { x: number; y: number; w: number; h: number };
  /** y of the ground contact line in sprite px. */
  ground: number;
  /** Extra animation anchors (e.g. where plantains fall from). */
  anchors?: Record<string, { x: number; y: number }>;
}

// ───────────────────────── colour ─────────────────────────
function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
/** Lighten (amt > 0) or darken (amt < 0) a hex colour in HSL lightness. */
export function shade(hex: string, amt: number): string {
  const [h, s, l] = hexToHsl(hex);
  const nl = amt >= 0 ? l + (1 - l) * amt : l * (1 + amt);
  return hslToHex(h, s, Math.max(0, Math.min(1, nl)));
}

// ───────────────────────── svg building ─────────────────────────
export const r1 = (n: number) => Math.round(n * 10) / 10;

export function svgDoc(w: number, h: number, defs: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>`;
}

/** Vertical paint gradient: lit top, base colour, dark lower body. */
export function paintGrad(id: string, base: string, strength = 1): string {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(base, 0.22 * strength)}"/><stop offset="0.38" stop-color="${shade(base, 0.05 * strength)}"/><stop offset="0.72" stop-color="${base}"/><stop offset="1" stop-color="${shade(base, -0.3 * strength)}"/></linearGradient>`;
}
export function glassGrad(id: string, tint = '#2c3e50'): string {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${shade(tint, 0.25)}"/><stop offset="0.55" stop-color="${tint}"/><stop offset="1" stop-color="${shade(tint, -0.45)}"/></linearGradient>`;
}
export function chromeGrad(id: string): string {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7f8fa"/><stop offset="0.45" stop-color="#b8bfc7"/><stop offset="0.55" stop-color="#7f8790"/><stop offset="1" stop-color="#d9dde2"/></linearGradient>`;
}
export function radial(id: string, inner: string, outer: string, cx = 0.4, cy = 0.35): string {
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="0.75"><stop offset="0" stop-color="${inner}"/><stop offset="1" stop-color="${outer}"/></radialGradient>`;
}

export type Pt = [number, number];

/** Closed path through `pts` with rounded corners (radius per point, or a single radius). */
export function roundedPath(pts: Pt[], radius: number | number[]): string {
  const n = pts.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const rad = Array.isArray(radius) ? radius[i] : radius;
    const v1 = [prev[0] - p[0], prev[1] - p[1]];
    const v2 = [next[0] - p[0], next[1] - p[1]];
    const l1 = Math.hypot(v1[0], v1[1]) || 1;
    const l2 = Math.hypot(v2[0], v2[1]) || 1;
    const k1 = Math.min(rad, l1 / 2) / l1;
    const k2 = Math.min(rad, l2 / 2) / l2;
    const a: Pt = [p[0] + v1[0] * k1, p[1] + v1[1] * k1];
    const b: Pt = [p[0] + v2[0] * k2, p[1] + v2[1] * k2];
    d += `${i === 0 ? 'M' : 'L'}${r1(a[0])},${r1(a[1])} Q${r1(p[0])},${r1(p[1])} ${r1(b[0])},${r1(b[1])} `;
  }
  return `${d}Z`;
}

export const poly = (pts: Pt[]) => `M${pts.map((p) => `${r1(p[0])},${r1(p[1])}`).join(' L')} Z`;

/** Text with a contrasting outline, for painted signs and decals. */
export function label(x: number, y: number, text: string, size: number, fill: string, opts: { stroke?: string; sw?: number; anchor?: 'start' | 'middle' | 'end'; weight?: number; family?: string; italic?: boolean; spacing?: number; rotate?: number } = {}): string {
  const tr = opts.rotate ? ` transform="rotate(${opts.rotate} ${x} ${y})"` : '';
  const st = opts.stroke ? ` stroke="${opts.stroke}" stroke-width="${opts.sw ?? 2}" paint-order="stroke" stroke-linejoin="round"` : '';
  return `<text x="${x}" y="${y}" font-family="${opts.family ?? FONT}" font-size="${size}" font-weight="${opts.weight ?? 900}"${opts.italic ? ' font-style="italic"' : ''} fill="${fill}" text-anchor="${opts.anchor ?? 'middle'}"${opts.spacing ? ` letter-spacing="${opts.spacing}"` : ''}${st}${tr}>${escapeXml(text)}</text>`;
}
export const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Diagonal reflection streaks clipped to a window path. */
export function glassStreaks(clipId: string, x: number, y: number, w: number, h: number): string {
  const s1 = poly([
    [x + w * 0.18, y + h],
    [x + w * 0.38, y],
    [x + w * 0.5, y],
    [x + w * 0.3, y + h],
  ]);
  const s2 = poly([
    [x + w * 0.56, y + h],
    [x + w * 0.72, y],
    [x + w * 0.76, y],
    [x + w * 0.6, y + h],
  ]);
  return `<g clip-path="url(#${clipId})"><path d="${s1}" fill="#ffffff" opacity="0.16"/><path d="${s2}" fill="#ffffff" opacity="0.1"/></g>`;
}

/** Head-and-shoulders silhouette seen through a window (passengers). */
export function person(x: number, base: number, s: number, skin: string, shirt: string, hair = '#1c1410', hat?: string): string {
  const head = `<ellipse cx="${r1(x)}" cy="${r1(base - 26 * s)}" rx="${r1(7 * s)}" ry="${r1(8.5 * s)}" fill="${skin}"/>`;
  const hairP = hat
    ? `<path d="M${r1(x - 8.5 * s)},${r1(base - 28 * s)} Q${r1(x)},${r1(base - 42 * s)} ${r1(x + 8.5 * s)},${r1(base - 28 * s)} L${r1(x + 12 * s)},${r1(base - 27 * s)} L${r1(x - 9 * s)},${r1(base - 26 * s)} Z" fill="${hat}"/>`
    : `<path d="M${r1(x - 7.5 * s)},${r1(base - 26 * s)} Q${r1(x - 7 * s)},${r1(base - 37 * s)} ${r1(x + 1 * s)},${r1(base - 35.5 * s)} Q${r1(x + 8 * s)},${r1(base - 34 * s)} ${r1(x + 7 * s)},${r1(base - 28 * s)} Q${r1(x)},${r1(base - 31 * s)} ${r1(x - 7.5 * s)},${r1(base - 26 * s)} Z" fill="${hair}"/>`;
  const body = `<path d="M${r1(x - 13 * s)},${r1(base)} Q${r1(x - 13 * s)},${r1(base - 16 * s)} ${r1(x)},${r1(base - 17 * s)} Q${r1(x + 13 * s)},${r1(base - 16 * s)} ${r1(x + 13 * s)},${r1(base)} Z" fill="${shirt}"/>`;
  return body + head + hairP;
}

export const SKINS = ['#8d5a3b', '#6b4329', '#b47b54', '#a0694a', '#5a3824', '#c58c62'];
export const SHIRTS = ['#c0392b', '#2e86c1', '#f1c40f', '#27ae60', '#8e44ad', '#ecf0f1', '#e67e22', '#34495e', '#e84393'];

// ───────────────────────── wheels ─────────────────────────
export type WheelStyle = 'alloy' | 'hubcap' | 'steel' | 'rusty' | 'bus' | 'spoke' | 'truck';

/** A wheel sprite: square, centred, so the renderer can rotate it. */
export function wheelSprite(style: WheelStyle, r: number): Sprite {
  const id = `wheel-${style}-${Math.round(r)}`;
  const s = r * 2 + 4;
  const c = s / 2;
  const tire = `<circle cx="${c}" cy="${c}" r="${r}" fill="url(#tire)" stroke="${OUTLINE}" stroke-width="1.6"/><circle cx="${c}" cy="${c}" r="${r1(r * 0.93)}" fill="none" stroke="#3a3d42" stroke-width="${r1(r * 0.05)}" opacity="0.7"/>`;
  const rimR = style === 'spoke' ? r * 0.84 : style === 'bus' || style === 'truck' ? r * 0.6 : r * 0.64;
  let rim = '';
  const spokes = (n: number, w: number, color: string, inner = 0.25) => {
    let out = '';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x1 = c + Math.cos(a) * rimR * inner;
      const y1 = c + Math.sin(a) * rimR * inner;
      const x2 = c + Math.cos(a) * rimR * 0.92;
      const y2 = c + Math.sin(a) * rimR * 0.92;
      out += `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
    }
    return out;
  };
  switch (style) {
    case 'alloy':
      rim = `<circle cx="${c}" cy="${c}" r="${r1(rimR)}" fill="#3c4046"/>${spokes(5, r1(r * 0.17), '#c9ced4', 0.2)}<circle cx="${c}" cy="${c}" r="${r1(rimR)}" fill="none" stroke="#e3e6ea" stroke-width="${r1(r * 0.07)}"/><circle cx="${c}" cy="${c}" r="${r1(r * 0.15)}" fill="#9aa1a9" stroke="#5c6168" stroke-width="1"/>`;
      break;
    case 'hubcap':
      rim = `<circle cx="${c}" cy="${c}" r="${r1(rimR)}" fill="url(#cap)" stroke="#6d737a" stroke-width="1.2"/>${spokes(8, r1(r * 0.06), '#7c838b', 0.35)}<circle cx="${c}" cy="${c}" r="${r1(r * 0.17)}" fill="#c3c8ce" stroke="#6d737a" stroke-width="1"/>`;
      break;
    case 'steel':
      rim = `<circle cx="${c}" cy="${c}" r="${r1(rimR)}" fill="#2f3237"/>${[0, 1, 2, 3, 4, 5].map((i) => `<circle cx="${r1(c + Math.cos(i * 1.047) * rimR * 0.62)}" cy="${r1(c + Math.sin(i * 1.047) * rimR * 0.62)}" r="${r1(r * 0.08)}" fill="#151618"/>`).join('')}<circle cx="${c}" cy="${c}" r="${r1(r * 0.2)}" fill="#55595f"/>`;
      break;
    case 'rusty':
      rim = `<circle cx="${c}" cy="${c}" r="${r1(rimR)}" fill="#5b4636"/><circle cx="${c}" cy="${c}" r="${r1(rimR * 0.85)}" fill="none" stroke="#8a5a36" stroke-width="${r1(r * 0.08)}" stroke-dasharray="4 3 9 2"/>${[0, 1, 2, 3].map((i) => `<circle cx="${r1(c + Math.cos(i * 1.571 + 0.4) * rimR * 0.55)}" cy="${r1(c + Math.sin(i * 1.571 + 0.4) * rimR * 0.55)}" r="${r1(r * 0.07)}" fill="#1a1512"/>`).join('')}<circle cx="${c}" cy="${c}" r="${r1(r * 0.18)}" fill="#76563c"/>`;
      break;
    case 'bus':
    case 'truck':
      rim = `<circle cx="${c}" cy="${c}" r="${r1(rimR)}" fill="${style === 'bus' ? '#c9ced4' : '#8f969e'}" stroke="#4d5258" stroke-width="1.5"/><circle cx="${c}" cy="${c}" r="${r1(rimR * 0.62)}" fill="#6d737a"/>${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<circle cx="${r1(c + Math.cos(i * 0.785) * rimR * 0.45)}" cy="${r1(c + Math.sin(i * 0.785) * rimR * 0.45)}" r="${r1(r * 0.045)}" fill="#e9ecef"/>`).join('')}<circle cx="${c}" cy="${c}" r="${r1(r * 0.16)}" fill="#3b3f44"/>`;
      break;
    case 'spoke':
      rim = `<circle cx="${c}" cy="${c}" r="${r1(rimR)}" fill="none" stroke="#cfd4da" stroke-width="${r1(r * 0.09)}"/>${spokes(18, 0.9, '#b7bdc4', 0.16)}<circle cx="${c}" cy="${c}" r="${r1(r * 0.17)}" fill="#8b9199" stroke="#4d5258" stroke-width="1"/><circle cx="${c}" cy="${c}" r="${r1(r * 0.3)}" fill="none" stroke="#5b6066" stroke-width="2"/>`;
      break;
  }
  // a bright sector on the rim makes rotation readable at speed
  const tick = `<path d="M${c},${c} L${r1(c + rimR)},${c} A${r1(rimR)},${r1(rimR)} 0 0 0 ${r1(c + Math.cos(-0.5) * rimR)},${r1(c + Math.sin(-0.5) * rimR)} Z" fill="#ffffff" opacity="0.08"/>`;
  const defs = `${radial('tire', '#3a3c40', '#141517', 0.42, 0.4)}${radial('cap', '#eef1f4', '#9aa2ab', 0.38, 0.3)}`;
  return { id, name: `Rueda (${style})`, w: s, h: s, svg: svgDoc(s, s, defs, tire + rim + tick), wheels: [], hitbox: { x: 0, y: 0, w: s, h: s }, ground: s };
}

/** Dark wheel wells clipped to the body outline (`clipId` must contain the body path). */
export function wheelWells(clipId: string, wheels: { x: number; y: number; r: number }[], color = '#111215'): string {
  return `<g clip-path="url(#${clipId})">${wheels.map((w) => `<circle cx="${r1(w.x)}" cy="${r1(w.y)}" r="${r1(w.r + 5)}" fill="${color}"/>`).join('')}</g>`;
}

/** Thin bevelled panel line (door gaps etc.). */
export function panelLine(d: string, light = 'rgba(255,255,255,0.22)'): string {
  return `<path d="${d}" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="1.4"/><path d="${d}" fill="none" stroke="${light}" stroke-width="0.8" transform="translate(1,0.6)"/>`;
}

export function plate(x: number, y: number, text: string, w = 30, h = 11): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="#f4f1e6" stroke="#2b2f36" stroke-width="0.8"/><rect x="${x + 0.8}" y="${y + 0.8}" width="${w - 1.6}" height="2.4" fill="#2f5fa8"/>${label(x + w / 2, y + h - 1.8, text, 5.8, '#1d2a3a', { weight: 700 })}`;
}

export function finish(id: string, name: string, w: number, h: number, defs: string, body: string, wheels: WheelSpec[], hitbox: Sprite['hitbox'], anchors?: Sprite['anchors']): Sprite {
  return { id, name, w, h, svg: svgDoc(w, h, defs, body), wheels, hitbox, ground: h, anchors };
}
