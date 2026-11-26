import { OUTLINE, type Pt, type Sprite, label, r1, shade } from './kit.ts';
import { vehicle } from './car.ts';
import { bikeSprite, riderSprite } from './moto.ts';
import { artRng } from './props.ts';

/**
 * Everyday traffic of Santo Domingo beyond the signature vehicles (docs/EL_TAPON.md §3.9): private sedans, yipetas,
 * delivery motos, the water truck with its botellones, the garbage truck and a moving truck loaded to the sky.
 * Original side-view illustrations, invented names and phone numbers (555), no real brands.
 */

const SHADE_OV = `<linearGradient id="shadeov" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.2"/><stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.3"/></linearGradient>`;
const sw = (w = 2) => `stroke="${OUTLINE}" stroke-width="${w}" stroke-linejoin="round"`;

/** Thick limb with an outline (arms and legs of the full-body figures). */
const limb = (d: string, color: string, w: number) =>
  `<path d="${d}" fill="none" stroke="${OUTLINE}" stroke-width="${w + 4}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** Head with short hair or a cap, facing right (+1) or left (−1). */
function head(x: number, y: number, skin: string, dir: 1 | -1, cap?: string): string {
  const hair = cap
    ? `<path d="M${x - 10},${y - 2} Q${x - 9},${y - 15} ${x + 1},${y - 15} Q${x + 11},${y - 14} ${x + 10},${y - 2} Z" fill="${cap}" ${sw(1.6)}/><path d="M${x + 9 * dir},${y - 3} L${x + 19 * dir},${y - 1} L${x + 8 * dir},${y + 1} Z" fill="${shade(cap, -0.3)}" ${sw(1.2)}/>`
    : `<path d="M${x - 9},${y - 1} Q${x - 8},${y - 13} ${x + 1},${y - 13} Q${x + 10},${y - 12} ${x + 9},${y - 3} Q${x},${y - 7} ${x - 9},${y - 1} Z" fill="#1c1410"/>`;
  return `<ellipse cx="${x}" cy="${y}" rx="9" ry="10" fill="${skin}" ${sw(1.8)}/>${hair}<circle cx="${x + 4 * dir}" cy="${y}" r="1.3" fill="#111"/>`;
}

// ───────────────────────── private sedan ─────────────────────────
/** A modern compact sedan: the most common private car on the avenues (three paint colours). */
export function sedanPrivado(id: string, name: string, paint: string): Sprite {
  const h = 112;
  return vehicle({
    id,
    name,
    w: 336,
    h,
    paint,
    body: [
      [6, 96],
      [4, 70],
      [8, 55],
      [72, 50],
      [120, 17],
      [204, 14],
      [256, 46],
      [318, 55],
      [330, 64],
      [332, 92],
      [312, 100],
      [22, 100],
    ],
    radius: [6, 8, 8, 14, 22, 18, 10, 14, 6, 6, 4, 4],
    wheels: [
      { x: 80, r: 23, style: 'alloy' },
      { x: 262, r: 23, style: 'alloy' },
    ],
    windows: [
      [
        [126, 22],
        [166, 19],
        [166, 47],
        [98, 48],
      ],
      [
        [174, 19],
        [200, 18],
        [246, 46],
        [174, 47],
      ],
    ],
    windowRadius: 6,
    glass: '#24313f',
    glassAlpha: 0.7,
    riders: [{ x: 196, base: 48, s: 1.05 }],
    shoulder: { from: 10, to: 326, y: 58, y2: 57 },
    doorLines: ['M102,50 L104,98', 'M170,49 L170,98', 'M248,48 L242,96'],
    handles: [
      [154, 61],
      [232, 60],
    ],
    mirror: [250, 43],
    head: [
      [312, 58],
      [330, 64],
      [329, 72],
      [310, 67],
    ],
    tail: [
      [5, 58],
      [26, 56],
      [27, 66],
      [5, 69],
    ],
    bumpers: [
      {
        pts: [
          [3, 84],
          [28, 85],
          [28, 95],
          [5, 95],
        ],
        color: shade(paint, -0.25),
      },
      {
        pts: [
          [306, 86],
          [334, 84],
          [333, 94],
          [308, 96],
        ],
        color: shade(paint, -0.25),
      },
    ],
    decals: `<path d="M96,49 L250,47" stroke="url(#chrome)" stroke-width="2"/><path d="M14,76 L326,74" stroke="rgba(0,0,0,0.18)" stroke-width="1.6"/>`,
    hitbox: { x: 4, y: 14, w: 328, h: 98 },
  });
}

// ───────────────────────── yipeta ─────────────────────────
/** The yipeta (SUV): tall, tinted windows, roof rails, big wheels — and lane changes without warning. */
export function yipeta(id: string, name: string, paint: string): Sprite {
  const h = 140;
  const rails = `<path d="M26,16 L224,12" stroke="#1d2025" stroke-width="5" stroke-linecap="round"/><path d="M40,16 L40,22 M120,14 L120,20 M206,12 L208,19" stroke="#1d2025" stroke-width="4"/><path d="M28,14 L222,10" stroke="#ffffff" stroke-width="1.2" opacity="0.35"/>`;
  return vehicle({
    id,
    name,
    w: 364,
    h,
    paint,
    paintStrength: 1.1,
    body: [
      [6, 120],
      [4, 44],
      [12, 22],
      [234, 18],
      [266, 54],
      [340, 62],
      [356, 74],
      [358, 116],
      [338, 126],
      [22, 126],
    ],
    radius: [6, 10, 14, 16, 14, 16, 8, 6, 4, 4],
    wheels: [
      { x: 86, r: 28, style: 'alloy' },
      { x: 288, r: 28, style: 'alloy' },
    ],
    windows: [
      [
        [20, 30],
        [72, 28],
        [72, 60],
        [18, 62],
      ],
      [
        [82, 28],
        [150, 26],
        [150, 60],
        [82, 60],
      ],
      [
        [160, 26],
        [228, 24],
        [256, 58],
        [160, 60],
      ],
    ],
    windowRadius: 5,
    glass: '#0e1621',
    glassAlpha: 0.86,
    riders: [
      { x: 204, base: 61, s: 1.1 },
      { x: 118, base: 61, s: 1.05 },
    ],
    shoulder: { from: 10, to: 352, y: 68, y2: 66 },
    doorLines: ['M78,62 L80,122', 'M156,62 L156,122', 'M260,60 L252,120'],
    handles: [
      [134, 74],
      [234, 73],
    ],
    mirror: [258, 52],
    head: [
      [336, 66],
      [356, 74],
      [355, 84],
      [334, 78],
    ],
    tail: [
      [5, 50],
      [16, 48],
      [17, 76],
      [5, 78],
    ],
    bumpers: [
      {
        pts: [
          [2, 104],
          [30, 104],
          [30, 120],
          [4, 120],
        ],
        color: '#2b2e33',
      },
      {
        pts: [
          [330, 104],
          [360, 102],
          [360, 118],
          [332, 120],
        ],
        color: '#2b2e33',
      },
    ],
    defs: SHADE_OV,
    decals: `<path d="M6,96 L356,94 L356,124 L6,126 Z" fill="#2a2d33" opacity="0.55"/><path d="M16,62 L258,58" stroke="url(#chrome)" stroke-width="2"/>`,
    over: rails,
    hitbox: { x: 4, y: 18, w: 354, h: 122 },
  });
}

// ───────────────────────── delivery moto ─────────────────────────
export const deliveryBike = () => bikeSprite({ id: 'moto-delivery', name: 'Motor de delivery', paint: '#1e5aa8', stripe: '#ffb300', box: { color: '#ff6f00', text: 'DELIVERY', textColor: '#ffffff' } });
export const repartidor = () => riderSprite('repartidor', 'Repartidor', { helmet: '#ff6f00', helmetStripe: '#ffffff', vest: '#263238', shirt: '#ff6f00', pants: '#37474f', skin: '#a06a42' });

// ───────────────────────── water truck ─────────────────────────
/** Upright 5-gallon jug (botellón) of purified water. */
function botellon(x: number, y: number, full: boolean): string {
  const w = 30;
  const h = 34;
  const fill = full ? '#4fc3f7' : '#b3e5fc';
  return (
    `<path d="M${x},${y + h} L${x},${y + 9} Q${x},${y + 3} ${x + 7},${y + 2} L${x + w - 7},${y + 2} Q${x + w},${y + 3} ${x + w},${y + 9} L${x + w},${y + h} Z" fill="${fill}" fill-opacity="0.85" stroke="#1565c0" stroke-width="1.6"/>` +
    `<rect x="${x + 10}" y="${y - 5}" width="10" height="8" rx="1.5" fill="${full ? '#1e88e5' : '#90a4ae'}" stroke="${OUTLINE}" stroke-width="1.2"/>` +
    `<path d="M${x + 1},${y + 16} L${x + w - 1},${y + 16} M${x + 1},${y + 25} L${x + w - 1},${y + 25}" stroke="#1565c0" stroke-width="1.2" opacity="0.55"/>` +
    `<path d="M${x + 5},${y + 8} L${x + 5},${y + h - 3}" stroke="#ffffff" stroke-width="2.4" opacity="0.6" stroke-linecap="round"/>`
  );
}

/** Small cab-over truck with a steel cage of botellones: it stops anywhere to deliver ("¡Agua!"). */
export function camionAgua(): Sprite {
  const h = 236;
  const paint = '#f2f4f6';
  const rnd = artRng(404);
  let cage = '';
  // two levels of jugs on the bed
  for (let level = 0; level < 2; level++) for (let i = 0; i < 9; i++) cage += botellon(14 + i * 37 + rnd() * 2, 144 - level * 44, rnd() > 0.15);
  // cage: posts, rails, corner braces
  let posts = '';
  for (let x = 8; x <= 344; x += 56) posts += `<path d="M${x},${94} L${x},${184}" stroke="#596068" stroke-width="4"/>`;
  posts += `<path d="M6,96 L348,96 M6,140 L348,140" stroke="#596068" stroke-width="4"/><path d="M6,96 L348,96" stroke="#c3c9cf" stroke-width="1.4"/>`;
  const sign = `<rect x="96" y="66" width="164" height="26" rx="4" fill="#1565c0" ${sw(2)}/>${label(178, 85, 'AGUA PURIFICADA', 14, '#ffffff')}<path d="M130,92 L130,96 M226,92 L226,96" stroke="#596068" stroke-width="3"/>`;
  return vehicle({
    id: 'camion-agua',
    name: 'Camión de botellones',
    w: 470,
    h,
    paint,
    body: [
      [6, 206],
      [6, 184],
      [352, 184],
      [354, 94],
      [366, 80],
      [440, 80],
      [458, 98],
      [464, 150],
      [466, 206],
      [448, 214],
      [22, 214],
    ],
    radius: [4, 3, 2, 4, 10, 12, 10, 6, 4, 4, 4],
    wheels: [
      { x: 98, r: 26, style: 'truck' },
      { x: 412, r: 26, style: 'truck' },
    ],
    windows: [
      [
        [372, 90],
        [438, 90],
        [452, 128],
        [372, 128],
      ],
    ],
    riders: [{ x: 412, base: 129, s: 1.1, hat: '#1565c0' }],
    shoulder: { from: 358, to: 460, y: 140 },
    doorLines: ['M366,96 L366,204', 'M454,132 L458,204'],
    handles: [[440, 146]],
    mirror: [454, 98],
    head: [
      [452, 168],
      [466, 168],
      [466, 182],
      [452, 182],
    ],
    tail: [
      [4, 188],
      [12, 188],
      [12, 200],
      [4, 200],
    ],
    bumpers: [
      {
        pts: [
          [444, 196],
          [470, 196],
          [470, 210],
          [446, 212],
        ],
        color: '#2b2e33',
      },
    ],
    defs: SHADE_OV,
    decals:
      `<path d="M352,152 L466,152 L466,166 L352,166 Z" fill="#1e88e5"/><path d="M352,166 L466,166 L466,170 L352,170 Z" fill="#90caf9"/>` +
      `<path d="M6,190 L352,190 M6,198 L352,198" stroke="rgba(0,0,0,0.25)" stroke-width="2"/>` +
      label(408, 147, 'AGUA', 15, '#1565c0') +
      label(408, 181, 'A DOMICILIO', 8, '#1565c0', { weight: 800 }),
    under: cage + posts,
    over: sign,
    hitbox: { x: 4, y: 62, w: 462, h: h - 62 },
  });
}

// ───────────────────────── garbage truck ─────────────────────────
/** A worker standing on the rear step, holding the grab rail (facing right). */
function stepWorker(x: number, floor: number, skin: string, vest: string): string {
  return (
    limb(`M${x + 4},${floor - 44} L${x + 2},${floor}`, '#2f3d4f', 9) +
    limb(`M${x + 14},${floor - 44} L${x + 18},${floor - 22} L${x + 14},${floor}`, '#2f3d4f', 9) +
    `<path d="M${x - 6},${floor} L${x + 10},${floor} L${x + 10},${floor + 5} L${x - 8},${floor + 5} Z M${x + 8},${floor} L${x + 24},${floor} L${x + 26},${floor + 5} L${x + 8},${floor + 5} Z" fill="#141518"/>` +
    `<path d="M${x - 4},${floor - 42} Q${x - 6},${floor - 78} ${x + 9},${floor - 84} Q${x + 24},${floor - 78} ${x + 22},${floor - 42} Z" fill="${vest}" ${sw(2)}/>` +
    `<path d="M${x - 5},${floor - 64} L${x + 22},${floor - 64} M${x - 4},${floor - 52} L${x + 22},${floor - 52}" stroke="#e8edf2" stroke-width="3.5"/>` +
    limb(`M${x + 16},${floor - 78} L${x + 26},${floor - 98} L${x + 30},${floor - 112}`, skin, 6) +
    limb(`M${x + 2},${floor - 76} L${x - 6},${floor - 56}`, skin, 6) +
    `<path d="M${x + 6},${floor - 86} L${x + 8},${floor - 92}" stroke="${skin}" stroke-width="7"/>` +
    head(x + 9, floor - 100, skin, 1, '#fdd835')
  );
}

/** Rear-loader garbage truck with two workers on the step: slow, and it stops every block ("¡La basura!"). */
export function camionBasura(): Sprite {
  const h = 262;
  const ox = 30;
  const paint = '#f1f3f4';
  const P = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [x + ox, y]);
  const ribs = [130, 210, 290, 370, 450].map((x) => `<path d="M${x + ox},${44} L${x + ox},${206}" stroke="rgba(0,0,0,0.16)" stroke-width="3"/><path d="M${x + ox + 3},${44} L${x + ox + 3},${206}" stroke="#ffffff" stroke-width="1.2" opacity="0.5"/>`).join('');
  const hopper = `<path d="M${ox + 8},${120} L${ox + 40},${72} L${ox + 70},${72} L${ox + 70},${226} L${ox + 8},${226} Z" fill="#2b2e33" opacity="0.92"/><path d="M${ox + 16},${132} L${ox + 44},${92} L${ox + 62},${92} L${ox + 62},${168} L${ox + 16},${168} Z" fill="#141518"/>`;
  const trash =
    `<ellipse cx="${ox + 36}" cy="${150}" rx="14" ry="11" fill="#263238" ${sw(1.4)}/><ellipse cx="${ox + 52}" cy="${158}" rx="11" ry="9" fill="#37474f" ${sw(1.4)}/><path d="M${ox + 44},${140} q5,-8 10,0" stroke="#90a4ae" stroke-width="2" fill="none"/>` +
    `<rect x="${ox + 22}" y="${154}" width="14" height="12" fill="#c8a165" ${sw(1.2)} transform="rotate(-12 ${ox + 29} 160)"/>`;
  const rail = `<path d="M${ox + 4},${110} L${ox + 4},${96} L${ox + 36},${96}" stroke="#9aa0a7" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M${ox - 26},${232} L${ox + 20},${232}" stroke="#596068" stroke-width="6" stroke-linecap="round"/>`;
  const crew = stepWorker(ox - 20, 230, '#6b4329', '#c6ff00') + stepWorker(ox - 2, 230, '#8d5a3b', '#ff9800');
  return vehicle({
    id: 'camion-basura',
    name: 'Camión de la basura',
    w: 700,
    h,
    paint,
    body: P([
      [8, 226],
      [6, 120],
      [40, 70],
      [92, 38],
      [520, 36],
      [528, 118],
      [548, 104],
      [632, 104],
      [656, 124],
      [668, 180],
      [670, 226],
      [650, 236],
      [24, 236],
    ]),
    radius: [4, 10, 18, 24, 12, 4, 10, 12, 10, 8, 6, 4, 4],
    wheels: [
      { x: 190 + ox, r: 30, style: 'truck' },
      { x: 590 + ox, r: 30, style: 'truck' },
    ],
    windows: [
      P([
        [556, 114],
        [628, 114],
        [648, 150],
        [556, 150],
      ]),
    ],
    riders: [{ x: 604 + ox, base: 151, s: 1.15, hat: '#2e7d32' }],
    shoulder: { from: 96 + ox, to: 518 + ox, y: 44 },
    doorLines: [`M${548 + ox},${112} L${548 + ox},${230}`, `M${652 + ox},${156} L${656 + ox},${230}`],
    handles: [[630 + ox, 168]],
    mirror: [654 + ox, 118],
    head: P([
      [656, 190],
      [670, 190],
      [670, 204],
      [656, 204],
    ]),
    tail: P([
      [6, 136],
      [14, 136],
      [14, 160],
      [6, 160],
    ]),
    bumpers: [
      {
        pts: P([
          [646, 216],
          [674, 216],
          [674, 232],
          [648, 234],
        ]),
        color: '#2b2e33',
      },
    ],
    defs: SHADE_OV,
    decals:
      `<path d="M${ox},150 L${ox + 680},150 L${ox + 680},170 L${ox},170 Z" fill="#2e7d32"/><path d="M${ox},170 L${ox + 680},170 L${ox + 680},178 L${ox},178 Z" fill="#fdd835"/>` +
      ribs +
      label(300 + ox, 110, 'RECOGIDA DE BASURA', 28, '#2e7d32', { spacing: 1 }) +
      label(300 + ox, 136, '¡NO TIRES BASURA EN LA CALLE!', 13, '#37474f') +
      label(300 + ox, 196, 'SERVICIO MUNICIPAL', 11, '#2e7d32', { weight: 800, spacing: 2 }) +
      `<rect x="0" y="0" width="700" height="${h}" fill="url(#shadeov)"/>`,
    under: '',
    over: hopper + trash + rail + crew,
    hitbox: { x: 4, y: 36, w: 692, h: h - 36 },
  });
}

// ───────────────────────── moving truck ─────────────────────────
/** A man sitting on top of the load, holding on to the mattress (facing right). */
function sittingHelper(x: number, seat: number): string {
  return (
    limb(`M${x},${seat} L${x + 22},${seat + 2} L${x + 24},${seat + 24}`, '#5d4037', 9) +
    `<path d="M${x + 18},${seat + 24} L${x + 32},${seat + 24} L${x + 32},${seat + 29} L${x + 16},${seat + 29} Z" fill="#141518"/>` +
    `<path d="M${x - 10},${seat + 2} Q${x - 12},${seat - 30} ${x + 2},${seat - 36} Q${x + 16},${seat - 30} ${x + 14},${seat + 2} Z" fill="#e53935" ${sw(2)}/>` +
    limb(`M${x + 8},${seat - 28} L${x + 22},${seat - 40} L${x + 26},${seat - 56}`, '#8d5a3b', 6) +
    limb(`M${x - 4},${seat - 26} L${x - 14},${seat - 8}`, '#8d5a3b', 6) +
    `<path d="M${x},${seat - 38} L${x + 1},${seat - 44}` + `" stroke="#8d5a3b" stroke-width="7"/>` +
    head(x + 2, seat - 52, '#8d5a3b', 1)
  );
}

/** Open truck with a whole household tied on top: mattress, fridge, sofa, plastic chairs, fan… and a cousin. */
export function camionMudanza(): Sprite {
  const h = 270;
  const paint = '#e9c46a';
  const bed = 196;
  // wooden side rails (baranda)
  let slats = '';
  for (let x = 8; x <= 392; x += 48) slats += `<rect x="${x}" y="${150}" width="10" height="${bed - 150}" fill="#8d6e63" ${sw(1.4)}/>`;
  slats += `<rect x="4" y="150" width="398" height="10" rx="2" fill="#a1887f" ${sw(1.4)}/><rect x="4" y="172" width="398" height="9" rx="2" fill="#a1887f" ${sw(1.4)}/>`;
  // the load (back to front): fridge, mattress standing, sofa, chairs, fan box, TV box, bags
  const fridge = `<rect x="22" y="70" width="70" height="${bed - 70}" rx="6" fill="#eceff1" ${sw(2)}/><path d="M22,118 L92,118" stroke="${OUTLINE}" stroke-width="1.6"/><rect x="80" y="84" width="5" height="24" rx="2" fill="#90a4ae"/><rect x="80" y="126" width="5" height="34" rx="2" fill="#90a4ae"/><path d="M28,76 L28,${bed - 6}" stroke="#ffffff" stroke-width="3" opacity="0.7"/>`;
  let flowers = '';
  const rnd = artRng(77);
  for (let i = 0; i < 14; i++) flowers += `<circle cx="${r1(112 + rnd() * 116)}" cy="${r1(56 + rnd() * 92)}" r="${r1(3 + rnd() * 3)}" fill="${['#f48fb1', '#ffffff', '#81d4fa'][i % 3]}" opacity="0.8"/>`;
  const mattress = `<g transform="rotate(-8 170 110)"><rect x="104" y="44" width="132" height="112" rx="14" fill="#5c8fd6" ${sw(2.2)}/>${flowers}<rect x="104" y="44" width="132" height="112" rx="14" fill="none" stroke="#3f6db3" stroke-width="5" opacity="0.6" transform="translate(0,0)"/></g>`;
  const sofa = `<path d="M222,${bed} L222,134 Q222,124 234,124 L322,124 Q334,124 334,134 L334,${bed} Z" fill="#8d4f2f" ${sw(2)}/><rect x="214" y="150" width="128" height="30" rx="10" fill="#a0603c" ${sw(2)}/><path d="M232,140 Q278,130 324,140" stroke="#c17f59" stroke-width="3" fill="none"/>`;
  const chair = (x: number, y: number, c: string) => `<path d="M${x},${y} L${x + 6},${y - 40} L${x + 34},${y - 40} L${x + 30},${y} M${x + 2},${y - 14} L${x + 32},${y - 14}" fill="none" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/><path d="M${x},${y} L${x + 6},${y - 40} L${x + 34},${y - 40} L${x + 30},${y} M${x + 2},${y - 14} L${x + 32},${y - 14}" fill="none" stroke="${c}" stroke-width="4" stroke-linejoin="round"/>`;
  const chairs = chair(330, 150, '#e53935') + chair(334, 140, '#ffffff') + chair(338, 130, '#e53935') + chair(342, 120, '#ffffff');
  const boxes = `<rect x="246" y="88" width="56" height="36" fill="#c8a165" ${sw(1.8)}/>${label(274, 111, 'ABANICO', 8, '#5d4037')}<rect x="300" y="98" width="40" height="26" fill="#bf9b5f" ${sw(1.8)}/><path d="M246,100 L302,100" stroke="#a07c46" stroke-width="2"/>`;
  const ropes = `<path d="M10,150 Q120,24 250,88 Q320,110 398,150" stroke="#e0c68f" stroke-width="3" fill="none"/><path d="M40,150 Q200,80 380,130" stroke="#e0c68f" stroke-width="3" fill="none"/>`;
  const helper = sittingHelper(266, 88);
  return vehicle({
    id: 'camion-mudanza',
    name: 'Camión de mudanza',
    w: 520,
    h,
    paint,
    body: [
      [6, 240],
      [4, bed],
      [404, bed],
      [406, 130],
      [420, 118],
      [480, 118],
      [500, 136],
      [510, 186],
      [512, 238],
      [494, 248],
      [22, 248],
    ],
    radius: [4, 3, 2, 4, 10, 12, 10, 6, 4, 4, 4],
    wheels: [
      { x: 112, r: 28, style: 'steel' },
      { x: 454, r: 28, style: 'steel' },
    ],
    windows: [
      [
        [424, 128],
        [478, 128],
        [494, 164],
        [424, 164],
      ],
    ],
    riders: [{ x: 456, base: 165, s: 1.1 }],
    shoulder: { from: 410, to: 506, y: 176 },
    doorLines: ['M418,132 L418,244', 'M496,170 L500,244'],
    handles: [[480, 184]],
    mirror: [496, 136],
    head: [
      [500, 200],
      [512, 200],
      [512, 214],
      [500, 214],
    ],
    tail: [
      [4, 204],
      [12, 204],
      [12, 218],
      [4, 218],
    ],
    bumpers: [
      {
        pts: [
          [490, 230],
          [516, 230],
          [516, 244],
          [492, 246],
        ],
        color: '#2b2e33',
      },
    ],
    defs: SHADE_OV,
    decals:
      `<path d="M4,214 L404,214 M4,226 L404,226" stroke="rgba(0,0,0,0.22)" stroke-width="2"/>` +
      label(283, 236, 'MUDANZAS EL PRIMO · 809-555-0147', 11, '#5d4037') +
      label(458, 222, 'EL PRIMO', 10, '#5d4037'),
    under: fridge + mattress + sofa + boxes + chairs + slats,
    over: ropes + helper,
    hitbox: { x: 4, y: 40, w: 508, h: h - 40 },
  });
}

export const extraSprites = (): Sprite[] => [
  sedanPrivado('sedan-plata', 'Carro privado (plata)', '#b9c2cb'),
  sedanPrivado('sedan-vino', 'Carro privado (vino)', '#9e1b2f'),
  sedanPrivado('sedan-blanco', 'Carro privado (blanco)', '#eef0f2'),
  yipeta('yipeta-negra', 'Yipeta (negra)', '#24282f'),
  yipeta('yipeta-blanca', 'Yipeta (blanca)', '#eceef0'),
  deliveryBike(),
  repartidor(),
  camionAgua(),
  camionBasura(),
  camionMudanza(),
];

