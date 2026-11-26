import { OUTLINE, type Pt, label, poly, r1, roundedPath, shade, svgDoc } from './kit.ts';
import { artRng } from './props.ts';

/**
 * Santo Domingo street front, generated: 1–4-storey buildings in Caribbean colours with iron *rejas*,
 * balconies with clothes hanging, roll-up shutters, painted shop signs (invented names), black water tanks and
 * rebar on the roofs. Plus street furniture for the sidewalks. All original, procedural SVG.
 */

export const WALLS = ['#f4a261', '#5bc0be', '#f28482', '#f6d365', '#b39ddb', '#4fc3f7', '#9ccc65', '#ffb74d', '#e0e0d1', '#ff8a65', '#81c784', '#f48fb1', '#fff1b5', '#80cbc4'];
const SHOPS: [string, string, string][] = [
  ['COLMADO LA BENDICIÓN', '#c62828', '#fff59d'],
  ['COLMADO EL TAPÓN', '#1565c0', '#ffffff'],
  ['BANCA LA SUERTE', '#2e7d32', '#ffeb3b'],
  ['FARMACIA SAN JUAN', '#00897b', '#ffffff'],
  ['PICA POLLO EL GORDO', '#e65100', '#fff3e0'],
  ['FERRETERÍA DOÑA ROSA', '#37474f', '#ffca28'],
  ['SALÓN YANET', '#ad1457', '#ffffff'],
  ['REPUESTOS EL GALLO', '#b71c1c', '#ffffff'],
  ['BARBERÍA LOS PANAS', '#283593', '#ffffff'],
  ['COMEDOR MAMÁ TINA', '#6d4c41', '#ffe0b2'],
  ['LAVANDERÍA LA ESPUMA', '#0277bd', '#e1f5fe'],
  ['CAFETERÍA EL PASO', '#5d4037', '#ffcc80'],
  ['CENTRO DE INTERNET', '#4527a0', '#ffffff'],
  ['TIENDA LA ECONÓMICA', '#f9a825', '#3e2723'],
  ['FRITURA DOÑA CHAVE', '#d84315', '#fff8e1'],
];
const SMALL_SIGNS = ['SE VENDE HIELO', 'HAY MANGÚ', 'RECARGAS', 'SE ALQUILA', 'HAY AGUA', 'SE VENDE', 'DELIVERY', 'CERRADO'];

export interface BuildingArt {
  svg: string;
  w: number;
  h: number;
  /** Window rectangles (sprite px) that light up at night. */
  windows: [number, number, number, number][];
}

const FLOOR = 214;

/** One building, `wM` metres wide. Coordinates: x right, y down, ground at h. */
export function buildingArt(seed: number, wM: number): BuildingArt {
  const rnd = artRng(seed * 7 + 13);
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  const w = Math.round(wM * 75);
  const floors = Math.min(4, 1 + Math.floor(rnd() * 3) + (rnd() < 0.3 ? 1 : 0));
  const roofExtra = 70;
  const h = floors * FLOOR + roofExtra;
  const G = h;
  const wall = pick(WALLS);
  const trim = shade(wall, 0.35);
  const parts: string[] = [];
  const windows: BuildingArt['windows'] = [];
  const defs = `<linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(wall, 0.12)}"/><stop offset="0.85" stop-color="${wall}"/><stop offset="1" stop-color="${shade(wall, -0.25)}"/></linearGradient><linearGradient id="shut" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa3ad"/><stop offset="1" stop-color="#6b737c"/></linearGradient>`;
  const top = G - floors * FLOOR;
  // body
  parts.push(`<rect x="0" y="${top}" width="${w}" height="${floors * FLOOR}" fill="url(#wall)" stroke="${OUTLINE}" stroke-width="3"/>`);
  // weathering: damp stains at the bottom, streaks below the roof
  parts.push(`<rect x="0" y="${G - 40}" width="${w}" height="40" fill="#000000" opacity="0.08"/>`);
  for (let i = 0; i < 3; i++) {
    const sx = rnd() * w;
    parts.push(`<path d="M${r1(sx)},${top + 8} q${r1(6 + rnd() * 8)},${r1(40 + rnd() * 60)} 0,${r1(90 + rnd() * 80)}" stroke="#000000" stroke-width="${r1(6 + rnd() * 10)}" opacity="0.06" fill="none"/>`);
  }
  // floor bands
  for (let f = 1; f < floors; f++) parts.push(`<rect x="-2" y="${G - f * FLOOR - 8}" width="${w + 4}" height="12" fill="${trim}" stroke="${OUTLINE}" stroke-width="2"/>`);
  // ── ground floor ──
  const shop = rnd() < 0.72;
  if (shop) {
    const [name, bg, fg] = pick(SHOPS);
    const bays = Math.max(1, Math.round(w / 260));
    const bw = (w - 30) / bays;
    for (let b = 0; b < bays; b++) {
      const x0 = 15 + b * bw + 8;
      const ow = bw - 16;
      const oy = G - 170;
      // interior: shelves with colourful products (colmado)
      parts.push(`<rect x="${r1(x0)}" y="${oy}" width="${r1(ow)}" height="170" fill="#2a2420"/>`);
      for (let sh = 0; sh < 3; sh++) {
        const y = oy + 40 + sh * 40;
        parts.push(`<rect x="${r1(x0 + 6)}" y="${y}" width="${r1(ow - 12)}" height="4" fill="#5d4037"/>`);
        for (let k = 0; k < ow / 16 - 1; k++) parts.push(`<rect x="${r1(x0 + 10 + k * 16)}" y="${y - 14}" width="11" height="14" rx="2" fill="${pick(['#e53935', '#fdd835', '#43a047', '#1e88e5', '#fb8c00', '#ffffff', '#8e24aa'])}" opacity="0.85"/>`);
      }
      // roll-up shutter (santamaría), partly up
      const up = 50 + rnd() * 70;
      parts.push(`<rect x="${r1(x0)}" y="${oy}" width="${r1(ow)}" height="${r1(170 - up - 60)}" fill="url(#shut)" stroke="${OUTLINE}" stroke-width="2"/>`);
      for (let y = oy + 6; y < oy + 170 - up - 60; y += 7) parts.push(`<path d="M${r1(x0)},${y} L${r1(x0 + ow)},${y}" stroke="#5a6168" stroke-width="1.4"/>`);
      windows.push([x0, oy + 110 - up, ow, 60]);
    }
    // painted sign band
    parts.push(`<rect x="8" y="${G - 214 + 8}" width="${w - 16}" height="40" rx="4" fill="${bg}" stroke="${OUTLINE}" stroke-width="2.5"/>`);
    const size = Math.min(26, ((w - 40) / name.length) * 1.65);
    parts.push(label(w / 2, G - 214 + 37, name, size, fg, { stroke: shade(bg, -0.4), sw: 2 }));
    // awning (toldo) for some shops
    if (rnd() < 0.45) {
      const stripes = Math.ceil(w / 40);
      for (let i = 0; i < stripes; i++) parts.push(`<path d="${poly([[i * 40, G - 160], [i * 40 + 40, G - 160], [i * 40 + 46, G - 132], [i * 40 + 6, G - 132]])}" fill="${i % 2 ? '#ffffff' : pick(['#d32f2f', '#1976d2', '#388e3c'])}" stroke="${OUTLINE}" stroke-width="1.2"/>`);
    }
    // plastic chairs / beer crates outside a colmado
    if (name.startsWith('COLMADO') || rnd() < 0.25) {
      const cx = w * (0.15 + rnd() * 0.6);
      parts.push(`<path d="M${r1(cx)},${G} L${r1(cx + 4)},${G - 34} L${r1(cx + 30)},${G - 34} L${r1(cx + 34)},${G} M${r1(cx + 4)},${G - 34} L${r1(cx + 2)},${G - 62} L${r1(cx + 30)},${G - 62}" stroke="#f5f5f5" stroke-width="5" fill="none"/>`);
      parts.push(`<rect x="${r1(cx + 50)}" y="${G - 30}" width="40" height="30" fill="#ffca28" stroke="${OUTLINE}" stroke-width="2"/><rect x="${r1(cx + 54)}" y="${G - 26}" width="32" height="10" fill="#6d4c41" opacity="0.5"/>`);
    }
    if (rnd() < 0.5) {
      const s = pick(SMALL_SIGNS);
      parts.push(`<rect x="${r1(w - 120)}" y="${G - 120}" width="100" height="26" fill="#fffde7" stroke="${OUTLINE}" stroke-width="1.5" transform="rotate(${r1(-4 + rnd() * 8)} ${r1(w - 70)} ${G - 107})"/>${label(w - 70, G - 102, s, 10, '#c62828', { weight: 900 })}`);
    }
  } else {
    // residential front: iron gate, door, barred window, plant
    const gx = w * 0.12;
    parts.push(`<rect x="${r1(gx)}" y="${G - 170}" width="90" height="170" fill="#5d4037" stroke="${OUTLINE}" stroke-width="2"/>`);
    parts.push(rejas(gx - 6, G - 178, 102, 178, '#263238'));
    const wx = w * 0.5;
    parts.push(`<rect x="${r1(wx)}" y="${G - 150}" width="110" height="80" fill="#1d2a36" stroke="${OUTLINE}" stroke-width="2"/>`);
    windows.push([wx, G - 150, 110, 80]);
    parts.push(rejas(wx - 4, G - 154, 118, 88, '#263238'));
    parts.push(`<path d="M${r1(wx + 130)},${G} l6,-34 l30,0 l6,34 Z" fill="#a1887f" stroke="${OUTLINE}" stroke-width="2"/><circle cx="${r1(wx + 151)}" cy="${G - 46}" r="20" fill="#43a047" stroke="${OUTLINE}" stroke-width="2"/>`);
    parts.push(`<rect x="${r1(w - 60)}" y="${G - 140}" width="26" height="34" fill="#9e9e9e" stroke="${OUTLINE}" stroke-width="1.5"/><circle cx="${r1(w - 47)}" cy="${G - 126}" r="7" fill="#e0e0e0"/>`);
  }
  // ── upper floors ──
  for (let f = 1; f < floors; f++) {
    const fy = G - (f + 1) * FLOOR;
    const n = Math.max(1, Math.round(w / 230));
    const sp = w / n;
    const balcony = rnd() < 0.6;
    for (let i = 0; i < n; i++) {
      const x = i * sp + sp * 0.22;
      const ww = sp * 0.56;
      parts.push(`<rect x="${r1(x - 8)}" y="${fy + 48}" width="${r1(ww + 16)}" height="122" fill="${trim}" stroke="${OUTLINE}" stroke-width="2"/>`);
      parts.push(`<rect x="${r1(x)}" y="${fy + 56}" width="${r1(ww)}" height="106" fill="#1d2a36"/>`);
      windows.push([x, fy + 56, ww, 106]);
      // jalousie glass or wooden shutters
      if (rnd() < 0.55) for (let y = fy + 62; y < fy + 158; y += 10) parts.push(`<path d="M${r1(x + 3)},${y} L${r1(x + ww - 3)},${y}" stroke="#90a4ae" stroke-width="4"/>`);
      parts.push(rejas(x - 4, fy + 52, ww + 8, 114, '#212121'));
      if (rnd() < 0.3) parts.push(`<rect x="${r1(x + ww + 14)}" y="${fy + 70}" width="52" height="38" rx="3" fill="#eceff1" stroke="${OUTLINE}" stroke-width="2"/><path d="M${r1(x + ww + 20)},${fy + 78} L${r1(x + ww + 60)},${fy + 78} M${r1(x + ww + 20)},${fy + 86} L${r1(x + ww + 60)},${fy + 86} M${r1(x + ww + 20)},${fy + 94} L${r1(x + ww + 60)},${fy + 94}" stroke="#90a4ae" stroke-width="2"/>`);
    }
    if (balcony) {
      parts.push(`<rect x="-6" y="${fy + 176}" width="${w + 12}" height="14" fill="${shade(trim, -0.1)}" stroke="${OUTLINE}" stroke-width="2"/>`);
      parts.push(railing(-6, fy + 128, w + 12, 48));
      if (rnd() < 0.7) parts.push(clothesLine(rnd, 20, w - 20, fy + 98));
    }
  }
  // ── roof ──
  parts.push(`<rect x="-4" y="${top - 14}" width="${w + 8}" height="16" fill="${trim}" stroke="${OUTLINE}" stroke-width="2.5"/>`);
  const tanks = 1 + Math.floor(rnd() * 2);
  for (let i = 0; i < tanks; i++) {
    const tx = w * (0.2 + rnd() * 0.6);
    parts.push(`<path d="M${r1(tx)},${top - 14} L${r1(tx + 4)},${top - 62} Q${r1(tx + 26)},${top - 70} ${r1(tx + 48)},${top - 62} L${r1(tx + 52)},${top - 14} Z" fill="#212121" stroke="${OUTLINE}" stroke-width="2"/><path d="M${r1(tx + 8)},${top - 50} L${r1(tx + 44)},${top - 50} M${r1(tx + 7)},${top - 34} L${r1(tx + 45)},${top - 34}" stroke="#424242" stroke-width="3"/>`);
  }
  if (rnd() < 0.4) for (let i = 0; i < 5; i++) parts.push(`<path d="M${r1(w * 0.1 + i * 14)},${top - 14} L${r1(w * 0.1 + i * 14 + rnd() * 6)},${top - 56 - rnd() * 14}" stroke="#6d4c41" stroke-width="3"/>`);
  if (rnd() < 0.35) parts.push(`<path d="M${r1(w * 0.8)},${top - 14} L${r1(w * 0.8)},${top - 40}" stroke="#616161" stroke-width="3"/><ellipse cx="${r1(w * 0.8 - 8)}" cy="${top - 50}" rx="16" ry="20" fill="#eceff1" stroke="${OUTLINE}" stroke-width="2" transform="rotate(-25 ${r1(w * 0.8 - 8)} ${top - 50})"/>`);
  return { svg: svgDoc(w, h, defs, parts.join('')), w, h, windows };
}

/** Iron bars over a window or gate (very Dominican). */
export function rejas(x: number, y: number, w: number, h: number, color: string): string {
  let out = `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" fill="none" stroke="${color}" stroke-width="4"/>`;
  for (let bx = x + 12; bx < x + w - 4; bx += 14) out += `<path d="M${r1(bx)},${r1(y)} L${r1(bx)},${r1(y + h)}" stroke="${color}" stroke-width="2.5"/>`;
  const mid = y + h * 0.5;
  out += `<path d="M${r1(x)},${r1(mid)} L${r1(x + w)},${r1(mid)}" stroke="${color}" stroke-width="3"/>`;
  for (let bx = x + 10; bx < x + w - 10; bx += 28) out += `<circle cx="${r1(bx + 7)}" cy="${r1(mid)}" r="6" fill="none" stroke="${color}" stroke-width="2"/>`;
  return out;
}

function railing(x: number, y: number, w: number, h: number): string {
  let out = `<path d="M${r1(x)},${r1(y)} L${r1(x + w)},${r1(y)}" stroke="#212121" stroke-width="5"/>`;
  for (let bx = x + 6; bx < x + w; bx += 12) out += `<path d="M${r1(bx)},${r1(y)} L${r1(bx)},${r1(y + h)}" stroke="#212121" stroke-width="2.5"/>`;
  return out;
}

function clothesLine(rnd: () => number, x0: number, x1: number, y: number): string {
  let out = `<path d="M${r1(x0)},${r1(y)} Q${r1((x0 + x1) / 2)},${r1(y + 18)} ${r1(x1)},${r1(y)}" stroke="#eeeeee" stroke-width="2" fill="none"/>`;
  const colors = ['#e53935', '#1e88e5', '#fdd835', '#ffffff', '#8e24aa', '#43a047', '#fb8c00', '#ec407a'];
  for (let x = x0 + 20; x < x1 - 30; x += 34 + rnd() * 26) {
    const t = (x - x0) / (x1 - x0);
    const yy = y + 18 * 4 * t * (1 - t);
    const c = colors[Math.floor(rnd() * colors.length)];
    out += rnd() < 0.5
      ? `<path d="M${r1(x)},${r1(yy)} l26,0 l4,12 l-6,2 l0,30 l-22,0 l0,-30 l-6,-2 Z" fill="${c}" stroke="${OUTLINE}" stroke-width="1.5"/>`
      : `<path d="M${r1(x)},${r1(yy)} l22,0 l0,36 l-9,0 l-2,-18 l-2,18 l-9,0 Z" fill="${c}" stroke="${OUTLINE}" stroke-width="1.5"/>`;
  }
  return out;
}

// ───────────────────────── street furniture ─────────────────────────
export interface PropArt {
  id: string;
  svg: string;
  w: number;
  h: number;
  /** Where cables attach (poles). */
  top?: { x: number; y: number };
}

export function poleArt(): PropArt {
  const w = 120;
  const h = 560;
  const body =
    `<path d="M52,${h} L56,30 L68,30 L72,${h} Z" fill="#b0b5b9" stroke="${OUTLINE}" stroke-width="3"/>` +
    `<rect x="14" y="40" width="96" height="10" rx="3" fill="#8d9296" stroke="${OUTLINE}" stroke-width="2"/>` +
    `<rect x="74" y="70" width="34" height="56" rx="6" fill="#6d7378" stroke="${OUTLINE}" stroke-width="2"/><path d="M78,80 L104,80 M78,92 L104,92 M78,104 L104,104" stroke="#4d5358" stroke-width="2"/>` +
    `<circle cx="20" cy="36" r="5" fill="#e0e0e0" stroke="${OUTLINE}" stroke-width="1.5"/><circle cx="104" cy="36" r="5" fill="#e0e0e0" stroke="${OUTLINE}" stroke-width="1.5"/>` +
    // the famous tangle of cables around the pole
    [0, 1, 2, 3, 4, 5].map((i) => `<path d="M${30 + i * 6},${150 + i * 10} q${20 + i * 3},${30 + i * 4} ${48 - i * 2},${-6 + i * 3} q-20,${26 + i * 2} -34,${40 - i}" stroke="#1b1e23" stroke-width="2.2" fill="none"/>`).join('') +
    `<ellipse cx="60" cy="210" rx="34" ry="16" fill="none" stroke="#1b1e23" stroke-width="2.5"/>` +
    `<rect x="44" y="300" width="36" height="22" rx="2" fill="#fff59d" stroke="${OUTLINE}" stroke-width="1.5"/>${label(62, 315, 'SE VENDE', 7, '#c62828')}`;
  return { id: 'poste', svg: svgDoc(w, h, '', body), w, h, top: { x: 62, y: 44 } };
}

export function palmArt(seed: number): PropArt {
  const rnd = artRng(seed);
  const w = 360;
  const h = 640;
  const tx = 180 + (rnd() - 0.5) * 40;
  let fronds = '';
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI + (i / 8) * Math.PI + (rnd() - 0.5) * 0.3;
    const len = 130 + rnd() * 50;
    const ex = tx + Math.cos(a) * len;
    const ey = 120 + Math.sin(a) * len * 0.55 + len * 0.45;
    const cx = tx + Math.cos(a) * len * 0.5;
    const cy = 90 + Math.sin(a) * len * 0.5;
    fronds += `<path d="M${r1(tx)},120 Q${r1(cx)},${r1(cy)} ${r1(ex)},${r1(ey)}" stroke="#2e7d32" stroke-width="16" fill="none" stroke-linecap="round"/><path d="M${r1(tx)},120 Q${r1(cx)},${r1(cy)} ${r1(ex)},${r1(ey)}" stroke="#66bb6a" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.7"/>`;
  }
  const trunk = `<path d="M${r1(tx - 8)},120 Q${r1(tx - 30)},380 ${r1(tx - 14)},${h} L${r1(tx + 14)},${h} Q${r1(tx - 2)},380 ${r1(tx + 10)},120 Z" fill="#8d6e63" stroke="${OUTLINE}" stroke-width="3"/>` + [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<path d="M${r1(tx - 16)},${150 + i * 54} q14,8 26,0" stroke="#5d4037" stroke-width="3" fill="none"/>`).join('');
  return { id: `palma-${seed}`, svg: svgDoc(w, h, '', trunk + fronds + `<circle cx="${r1(tx - 6)}" cy="128" r="10" fill="#6d4c41"/><circle cx="${r1(tx + 8)}" cy="132" r="9" fill="#795548"/>`), w, h };
}

export function almendroArt(seed: number): PropArt {
  const rnd = artRng(seed + 5);
  const w = 420;
  const h = 520;
  let crown = '';
  const blobs: [number, number, number][] = [];
  for (let i = 0; i < 9; i++) blobs.push([80 + rnd() * 260, 70 + rnd() * 160, 60 + rnd() * 40]);
  for (const [x, y, r] of blobs) crown += `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" fill="#2e7d32" stroke="${OUTLINE}" stroke-width="3"/>`;
  for (const [x, y, r] of blobs) crown += `<circle cx="${r1(x - r * 0.25)}" cy="${r1(y - r * 0.3)}" r="${r1(r * 0.55)}" fill="#43a047"/>`;
  for (let i = 0; i < 6; i++) crown += `<ellipse cx="${r1(90 + rnd() * 240)}" cy="${r1(80 + rnd() * 150)}" rx="14" ry="9" fill="${rnd() < 0.5 ? '#c62828' : '#ef6c00'}" stroke="${OUTLINE}" stroke-width="1.5"/>`;
  const trunk = `<path d="M196,${h} Q200,380 186,250 L214,250 Q224,380 226,${h} Z" fill="#6d4c41" stroke="${OUTLINE}" stroke-width="3"/><path d="M200,300 Q150,250 120,200 M214,290 Q270,240 300,200" stroke="#6d4c41" stroke-width="14" fill="none" stroke-linecap="round"/>`;
  return { id: `almendro-${seed}`, svg: svgDoc(w, h, '', trunk + crown), w, h };
}

/** Street vendor's cart: fruits under an umbrella, or *frío frío* (shaved ice). */
export function carritoArt(kind: 'frutas' | 'friofrio'): PropArt {
  const w = 220;
  const h = 250;
  const umbrella = `<path d="M110,40 L110,170" stroke="#5d4037" stroke-width="5"/><path d="M14,80 Q110,-10 206,80 Z" fill="${kind === 'frutas' ? '#ff7043' : '#29b6f6'}" stroke="${OUTLINE}" stroke-width="3"/><path d="M62,72 Q110,8 158,72" stroke="#ffffff" stroke-width="8" fill="none" opacity="0.6"/>`;
  const cart = `<rect x="20" y="160" width="180" height="56" rx="6" fill="${kind === 'frutas' ? '#8d6e63' : '#eceff1'}" stroke="${OUTLINE}" stroke-width="3"/><circle cx="60" cy="226" r="20" fill="#37474f" stroke="${OUTLINE}" stroke-width="3"/><circle cx="160" cy="226" r="20" fill="#37474f" stroke="${OUTLINE}" stroke-width="3"/><circle cx="60" cy="226" r="7" fill="#b0bec5"/><circle cx="160" cy="226" r="7" fill="#b0bec5"/>`;
  let goods = '';
  if (kind === 'frutas') {
    const colors = ['#ffeb3b', '#ff9800', '#4caf50', '#e53935', '#ffc107'];
    for (let i = 0; i < 14; i++) goods += `<circle cx="${34 + (i % 7) * 25}" cy="${148 - Math.floor(i / 7) * 16}" r="11" fill="${colors[i % colors.length]}" stroke="${OUTLINE}" stroke-width="1.5"/>`;
    goods += label(110, 200, 'FRUTAS', 18, '#fff8e1', { stroke: OUTLINE, sw: 2 });
  } else {
    goods = `<rect x="44" y="120" width="54" height="40" rx="4" fill="#b3e5fc" stroke="${OUTLINE}" stroke-width="2"/>${[0, 1, 2, 3].map((i) => `<rect x="${112 + i * 18}" y="132" width="12" height="28" rx="3" fill="${['#e53935', '#fdd835', '#43a047', '#8e24aa'][i]}" stroke="${OUTLINE}" stroke-width="1.5"/>`).join('')}${label(110, 200, 'FRÍO FRÍO', 18, '#0277bd', { stroke: '#ffffff', sw: 2 })}`;
  }
  return { id: `carrito-${kind}`, svg: svgDoc(w, h, '', umbrella + cart + goods), w, h };
}

/** Bus stop shelter. */
export function paradaArt(): PropArt {
  const w = 380;
  const h = 300;
  const body =
    `<rect x="20" y="40" width="340" height="22" rx="4" fill="#2e7d32" stroke="${OUTLINE}" stroke-width="3"/>` +
    `<path d="M40,62 L40,${h} M340,62 L340,${h}" stroke="#9e9e9e" stroke-width="8"/>` +
    `<rect x="60" y="80" width="160" height="150" fill="#b3e5fc" opacity="0.35" stroke="${OUTLINE}" stroke-width="2"/>` +
    `<rect x="240" y="90" width="80" height="110" fill="#fff8e1" stroke="${OUTLINE}" stroke-width="2"/>${label(280, 120, 'RUTA', 12, '#2e7d32')}${label(280, 140, '27 FEB', 12, '#1b1e23')}${label(280, 160, 'LINCOLN', 10, '#1b1e23')}` +
    `<rect x="70" y="240" width="190" height="12" fill="#795548" stroke="${OUTLINE}" stroke-width="2"/><path d="M84,252 L84,${h} M246,252 L246,${h}" stroke="#5d4037" stroke-width="5"/>` +
    label(190, 57, 'PARADA', 15, '#ffffff');
  return { id: 'parada', svg: svgDoc(w, h, '', body), w, h };
}

/** Pedestrian walking or standing (side view). */
export function peatonArt(seed: number): PropArt {
  const rnd = artRng(seed + 31);
  const w = 70;
  const h = 170;
  const skin = ['#8d5a3b', '#6b4329', '#b47b54', '#a0694a', '#5a3824'][Math.floor(rnd() * 5)];
  const shirt = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#8e24aa', '#ffffff', '#fb8c00', '#00acc1'][Math.floor(rnd() * 8)];
  const pants = ['#263238', '#1565c0', '#6d4c41', '#37474f'][Math.floor(rnd() * 4)];
  const step = rnd() < 0.5;
  const legs = step ? `M30,104 L20,162 M40,104 L50,162` : `M30,104 L28,164 M40,104 L42,164`;
  const body =
    `<path d="${legs}" stroke="${OUTLINE}" stroke-width="13" stroke-linecap="round"/><path d="${legs}" stroke="${pants}" stroke-width="9" stroke-linecap="round"/>` +
    `<path d="M18,106 Q16,66 35,60 Q54,66 52,106 Z" fill="${shirt}" stroke="${OUTLINE}" stroke-width="2"/>` +
    `<path d="M24,70 L${step ? 14 : 20},100 M46,70 L${step ? 56 : 50},98" stroke="${OUTLINE}" stroke-width="9" stroke-linecap="round"/><path d="M24,70 L${step ? 14 : 20},100 M46,70 L${step ? 56 : 50},98" stroke="${skin}" stroke-width="5" stroke-linecap="round"/>` +
    `<ellipse cx="35" cy="44" rx="11" ry="12" fill="${skin}" stroke="${OUTLINE}" stroke-width="2"/><path d="M24,42 Q25,30 36,30 Q47,30 46,40 Q38,36 24,42 Z" fill="#1c1410"/>` +
    (rnd() < 0.3 ? `<rect x="50" y="92" width="16" height="22" rx="3" fill="#ffffff" stroke="${OUTLINE}" stroke-width="1.5"/>` : '');
  return { id: `peaton-${seed}`, svg: svgDoc(w, h, '', body), w, h };
}

export function skylineArt(seed: number): PropArt {
  const rnd = artRng(seed + 101);
  const w = 2400;
  const h = 420;
  let out = '';
  let x = 0;
  while (x < w) {
    const bw = 80 + rnd() * 160;
    const bh = 120 + rnd() * 280;
    out += `<rect x="${r1(x)}" y="${r1(h - bh)}" width="${r1(bw)}" height="${r1(bh)}" fill="#8fa3b8"/>`;
    for (let wy = h - bh + 14; wy < h - 10; wy += 22) for (let wx = x + 10; wx < x + bw - 10; wx += 18) if (rnd() < 0.5) out += `<rect x="${r1(wx)}" y="${r1(wy)}" width="8" height="10" fill="#a9bacb"/>`;
    if (rnd() < 0.25) out += `<path d="M${r1(x + bw / 2)},${r1(h - bh)} L${r1(x + bw / 2)},${r1(h - bh - 50)}" stroke="#8fa3b8" stroke-width="4"/>`;
    x += bw + rnd() * 30;
  }
  return { id: `skyline-${seed}`, svg: svgDoc(w, h, '', out), w, h };
}

export const _unused: Pt[] = [];
export const _rp = roundedPath;
