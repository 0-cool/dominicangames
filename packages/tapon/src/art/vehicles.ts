import { OUTLINE, type Pt, type Sprite, label, r1, roundedPath, shade } from './kit.ts';
import { dent, rust, vehicle } from './car.ts';
import { artRng, plantain, plantainHand } from './props.ts';

/** Shift a list of points down by dy (to leave room above the roof for signs, cargo, people). */
export const down = (pts: Pt[], dy: number): Pt[] => pts.map(([x, y]) => [x, y + dy]);

/** Overlay that keeps the paint shading on top of decals (lit top, dark bottom). */
const SHADE_OV = `<linearGradient id="shadeov" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/><stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.3"/></linearGradient>`;

// ───────────────────────── 2. Carro público (concho) ─────────────────────────
/** A tired early-90s sedan working as a *carro público*: faded paint, a primer-blue door, rust, route on the door and five passengers. */
export function carroPublico(): Sprite {
  const h = 112;
  const door: Pt[] = [
    [92, 48],
    [160, 47],
    [160, 100],
    [96, 100],
  ];
  return vehicle({
    id: 'carro-publico',
    name: 'Carro público (concho)',
    w: 332,
    h,
    paint: '#e6dfcb',
    paintStrength: 0.85,
    body: [
      [4, 92],
      [2, 70],
      [6, 54],
      [68, 48],
      [106, 13],
      [198, 10],
      [248, 45],
      [314, 52],
      [326, 58],
      [328, 90],
      [306, 98],
      [22, 98],
    ],
    radius: [6, 8, 6, 10, 14, 12, 8, 10, 6, 6, 4, 4],
    wheels: [
      { x: 78, r: 22, style: 'rusty' },
      { x: 260, r: 22, style: 'hubcap' },
    ],
    windows: [
      [
        [116, 18],
        [156, 16],
        [156, 45],
        [90, 46],
      ],
      [
        [164, 16],
        [196, 15],
        [238, 44],
        [164, 45],
      ],
    ],
    riders: [
      { x: 103, base: 48 },
      { x: 124, base: 47, s: 1.05 },
      { x: 145, base: 48 },
      { x: 186, base: 47, s: 1.05, hat: '#c0392b' },
      { x: 210, base: 47 },
    ],
    glassAlpha: 0.5,
    shoulder: { from: 10, to: 312, y: 52, y2: 54 },
    doorLines: ['M92,48 L96,97', 'M160,47 L160,97', 'M242,47 L236,96'],
    handles: [
      [148, 58],
      [228, 58],
    ],
    mirror: [238, 44],
    head: [
      [312, 55],
      [326, 59],
      [326, 68],
      [310, 66],
    ],
    tail: [
      [3, 57],
      [16, 56],
      [16, 68],
      [3, 69],
    ],
    bumpers: [
      {
        pts: [
          [0, 72],
          [28, 71],
          [28, 88],
          [2, 89],
        ],
        color: '#3a3c40',
      },
      {
        pts: [
          [300, 71],
          [330, 71],
          [330, 88],
          [300, 89],
        ],
        color: '#3a3c40',
      },
    ],
    defs: SHADE_OV,
    decals:
      `<path d="${roundedPath(door, 2)}" fill="#93b4c8"/><path d="${roundedPath(door, 2)}" fill="url(#shadeov)"/>` +
      rust(52, 72, 7, 1) +
      rust(126, 94, 9, 2) +
      rust(288, 74, 6, 3) +
      rust(20, 86, 5, 4) +
      dent(168, 64, 18) +
      dent(106, 82, 14) +
      label(200, 78, 'RUTA 32', 14, '#1d3557', { stroke: '#f3efe2', sw: 2 }) +
      label(200, 90, 'LINCOLN · BOLÍVAR', 6.5, '#1d3557', { weight: 700 }),
    over: `<path d="M24,50 L10,6" stroke="#2b2e33" stroke-width="1.4"/><circle cx="10" cy="6" r="1.6" fill="#2b2e33"/>`,
    hitbox: { x: 4, y: 12, w: 322, h: 100 },
  });
}

// ───────────────────────── 3. Sonata mamey ─────────────────────────
/** Sonata-inspired sedan in the mamey orange of Santo Domingo's taxis (no maker marks). */
export function sonataMamey(): Sprite {
  const dy = 14;
  const h = 118 + dy;
  const paint = '#f26b3a';
  return vehicle({
    id: 'sonata-mamey',
    name: 'Sonata mamey',
    w: 368,
    h,
    paint,
    body: down(
      [
        [6, 98],
        [3, 72],
        [10, 54],
        [72, 46],
        [124, 12],
        [208, 9],
        [270, 44],
        [340, 54],
        [362, 64],
        [364, 92],
        [338, 104],
        [24, 104],
      ],
      dy,
    ),
    radius: [8, 10, 12, 18, 26, 22, 14, 16, 14, 8, 6, 6],
    wheels: [
      { x: 88, r: 24, style: 'alloy' },
      { x: 293, r: 24, style: 'alloy' },
    ],
    windows: [
      down(
        [
          [130, 17],
          [172, 14],
          [172, 46],
          [104, 47],
        ],
        dy,
      ),
      down(
        [
          [180, 14],
          [210, 14],
          [262, 44],
          [180, 46],
        ],
        dy,
      ),
    ],
    windowRadius: 6,
    riders: [
      { x: 150, base: 47 + dy, s: 1.05 },
      { x: 226, base: 46 + dy, s: 1.05 },
    ],
    shoulder: { from: 12, to: 338, y: 58 + dy, y2: 53 + dy },
    doorLines: [`M108,${49 + dy} L110,${102 + dy}`, `M176,${48 + dy} L176,${102 + dy}`, `M262,${47 + dy} L254,${100 + dy}`],
    handles: [
      [160, 60 + dy],
      [244, 59 + dy],
    ],
    mirror: [258, 43 + dy],
    head: down(
      [
        [330, 56],
        [358, 62],
        [356, 71],
        [328, 65],
      ],
      dy,
    ),
    tail: down(
      [
        [5, 58],
        [28, 55],
        [29, 67],
        [5, 70],
      ],
      dy,
    ),
    bumpers: [
      {
        pts: down(
          [
            [3, 86],
            [30, 87],
            [30, 96],
            [5, 96],
          ],
          dy,
        ),
        color: '#2f3236',
      },
      {
        pts: down(
          [
            [334, 88],
            [364, 86],
            [362, 96],
            [336, 98],
          ],
          dy,
        ),
        color: '#2f3236',
      },
    ],
    decals:
      `<path d="M104,${47 + dy} L262,${45 + dy}" stroke="url(#chrome)" stroke-width="2.5"/>` +
      label(142, 84 + dy, 'TAXI', 18, '#ffffff', { stroke: shade(paint, -0.5), sw: 2.5 }) +
      label(142, 95 + dy, '809-555-0182', 7.5, '#ffffff', { weight: 700 }),
    over: `<path d="M158,${23} L162,${11 + dy - 2} M188,${23} L184,${11 + dy - 2}" stroke="#2b2e33" stroke-width="2"/><rect x="148" y="4" width="50" height="17" rx="4" fill="#fff6c9" stroke="${OUTLINE}" stroke-width="1.8"/>${label(173, 17, 'TAXI', 11.5, '#1d2a3a')}`,
    hitbox: { x: 4, y: 20, w: 358, h: 112 },
  });
}

// ───────────────────────── 4. OMSA ─────────────────────────
/** A green articulated-free city bus in the style of Santo Domingo's OMSA corridors (plain text, no logos). */
export function omsa(): Sprite {
  const h = 246;
  const paint = '#7cc242';
  const winY0 = 62;
  const winY1 = 148;
  const panes: [number, number][] = [
    [40, 150],
    [160, 290],
    [300, 440],
    [530, 650],
    [660, 780],
  ];
  const doorPanes: [number, number][] = [
    [452, 484],
    [488, 520],
    [790, 826],
    [830, 866],
  ];
  const windows: Pt[][] = [
    ...panes.map(([a, b]) => [
      [a, winY0],
      [b, winY0],
      [b, winY1],
      [a, winY1],
    ] as Pt[]),
    ...doorPanes.map(([a, b]) => [
      [a, winY0],
      [b, winY0],
      [b, 214],
      [a, 214],
    ] as Pt[]),
    [
      [874, 40],
      [896, 40],
      [904, 150],
      [874, 150],
    ],
  ];
  const riders = [52, 90, 128, 176, 214, 252, 318, 356, 396, 548, 590, 630, 678, 718, 758].map((x, i) => ({ x, base: 150, s: 1.45 + (i % 3) * 0.05 }));
  riders.push({ x: 470, base: 182, s: 1.6 }, { x: 806, base: 186, s: 1.6 }, { x: 886, base: 150, s: 1.5 });
  const louvers = [0, 1, 2, 3, 4, 5].map((i) => `<path d="M22,${168 + i * 6} L118,${168 + i * 6}" stroke="rgba(0,0,0,0.35)" stroke-width="2"/>`).join('');
  return vehicle({
    id: 'omsa',
    name: 'Guagua OMSA',
    w: 910,
    h,
    paint,
    body: [
      [6, 226],
      [4, 40],
      [14, 20],
      [880, 16],
      [898, 28],
      [906, 120],
      [908, 222],
      [892, 230],
      [18, 230],
    ],
    radius: [6, 12, 16, 16, 14, 8, 6, 4, 4],
    wheels: [
      { x: 262, r: 37, style: 'bus' },
      { x: 706, r: 37, style: 'bus' },
    ],
    windows,
    windowRadius: 3,
    glassAlpha: 0.58,
    riders,
    shoulder: { from: 14, to: 890, y: 26 },
    doorLines: ['M448,60 L448,226', 'M524,60 L524,226', 'M786,60 L786,226', 'M870,60 L870,226'],
    head: [
      [894, 188],
      [908, 186],
      [908, 204],
      [894, 206],
    ],
    tail: [
      [4, 148],
      [14, 148],
      [14, 190],
      [4, 190],
    ],
    bumpers: [
      {
        pts: [
          [876, 208],
          [910, 206],
          [910, 228],
          [878, 230],
        ],
        color: '#2b2e33',
      },
      {
        pts: [
          [0, 208],
          [32, 208],
          [32, 228],
          [2, 230],
        ],
        color: '#2b2e33',
      },
    ],
    defs: SHADE_OV,
    decals:
      `<rect x="0" y="182" width="910" height="50" fill="#2f7d32"/><rect x="0" y="176" width="910" height="6" fill="#f4f7f2"/><rect x="0" y="0" width="910" height="30" fill="#f4f7f2" opacity="0.9"/><path d="M0,30 L910,30" stroke="#2f7d32" stroke-width="3"/>` +
      louvers +
      `<rect x="0" y="0" width="910" height="246" fill="url(#shadeov)"/>` +
      label(600, 212, 'OMSA', 30, '#ffffff', { stroke: '#1b4d1e', sw: 3, spacing: 3 }) +
      label(600, 226, 'CORREDOR 27 DE FEBRERO', 9, '#e8f5e9', { weight: 700 }) +
      label(366, 172, 'TRANSPORTE PÚBLICO', 10, '#1b4d1e', { weight: 900 }),
    under: `<rect x="520" y="2" width="180" height="22" rx="6" fill="#dfe4e8" stroke="${OUTLINE}" stroke-width="2"/><path d="M536,9 L684,9 M536,15 L684,15" stroke="#9aa3ad" stroke-width="2"/>`,
    over:
      `<rect x="700" y="34" width="170" height="20" rx="3" fill="#111214" stroke="${OUTLINE}" stroke-width="2"/>` +
      label(785, 49, 'C27 · 27 DE FEBRERO', 12, '#ffb020', { family: "'Courier New', monospace", weight: 700 }) +
      `<path d="M904,56 L922,60 L922,96" stroke="#2b2e33" stroke-width="3" fill="none"/><rect x="914" y="94" width="10" height="26" rx="3" fill="#2b2e33"/>`,
    hitbox: { x: 4, y: 16, w: 904, h: 230 },
  });
}

// ───────────────────────── 5. Guagua (public minibus) ─────────────────────────
/** A hand-painted public minibus with a slogan, luggage on the roof and its *cobrador* hanging out of the door. */
export function guagua(): Sprite {
  const dy = 20;
  const h = 214 + dy;
  const paint = '#f3f1ea';
  const pane = (a: number, b: number): Pt[] =>
    down(
      [
        [a, 50],
        [b, 50],
        [b, 100],
        [a, 100],
      ],
      dy,
    );
  const windows = [pane(30, 92), pane(98, 160), pane(166, 228), pane(234, 296), pane(302, 364), pane(370, 432), down([[492, 36], [500, 36], [518, 96], [492, 100]] as Pt[], dy)];
  const riders = [48, 76, 116, 144, 184, 212, 252, 280, 320, 348, 388, 414].map((x, i) => ({ x, base: 101 + dy, s: 1.05 + (i % 2) * 0.05 }));
  const cob = 440;
  const cobrador =
    // the cobrador: one foot on the step, one hand on the rail, the other waving people in
    `<path d="M${cob + 40},${150 + dy} L${cob + 46},${196 + dy}" stroke="${OUTLINE}" stroke-width="13" stroke-linecap="round"/><path d="M${cob + 40},${150 + dy} L${cob + 46},${196 + dy}" stroke="#34495e" stroke-width="9" stroke-linecap="round"/>` +
    `<path d="M${cob + 38},${112 + dy} Q${cob + 50},${104 + dy} ${cob + 56},${120 + dy} L${cob + 52},${154 + dy} L${cob + 34},${154 + dy} Z" fill="#f1c40f" stroke="${OUTLINE}" stroke-width="2"/>` +
    `<path d="M${cob + 52},${118 + dy} L${cob + 72},${102 + dy} L${cob + 84},${86 + dy}" fill="none" stroke="${OUTLINE}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M${cob + 52},${118 + dy} L${cob + 72},${102 + dy} L${cob + 84},${86 + dy}" fill="none" stroke="#8d5a3b" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<ellipse cx="${cob + 46}" cy="${98 + dy}" rx="9" ry="10" fill="#8d5a3b" stroke="${OUTLINE}" stroke-width="2"/><path d="M${cob + 36},${94 + dy} Q${cob + 44},${82 + dy} ${cob + 56},${92 + dy} L${cob + 62},${92 + dy}" fill="#c0392b" stroke="${OUTLINE}" stroke-width="1.6"/>` +
    `<path d="M${cob + 36},${120 + dy} L${cob + 22},${108 + dy}" stroke="${OUTLINE}" stroke-width="9" stroke-linecap="round"/><path d="M${cob + 36},${120 + dy} L${cob + 22},${108 + dy}" stroke="#8d5a3b" stroke-width="5" stroke-linecap="round"/>`;
  const rack =
    `<path d="M120,${20 + dy - 2} L120,${4 + dy} L400,${4 + dy} L400,${20 + dy - 2}" fill="none" stroke="#2b2e33" stroke-width="3"/>` +
    `<rect x="140" y="${-8 + dy}" width="54" height="20" rx="5" fill="#2e86c1" stroke="${OUTLINE}" stroke-width="2"/><ellipse cx="240" cy="${2 + dy}" rx="30" ry="12" fill="#c8b27a" stroke="${OUTLINE}" stroke-width="2"/><path d="M216,${2 + dy} Q240,${-6 + dy} 264,${2 + dy}" stroke="#8a7445" stroke-width="2" fill="none"/><rect x="300" y="${-12 + dy}" width="40" height="24" rx="3" fill="#a0522d" stroke="${OUTLINE}" stroke-width="2"/>`;
  return vehicle({
    id: 'guagua',
    name: 'Guagua de ruta',
    w: 552,
    h,
    paint,
    body: down(
      [
        [6, 196],
        [4, 46],
        [16, 24],
        [470, 20],
        [500, 30],
        [522, 92],
        [532, 110],
        [534, 190],
        [516, 198],
        [20, 198],
      ],
      dy,
    ),
    radius: [6, 12, 18, 20, 14, 10, 8, 6, 4, 4],
    wheels: [
      { x: 150, r: 30, style: 'steel' },
      { x: 440, r: 30, style: 'steel' },
    ],
    windows,
    windowRadius: 4,
    glassAlpha: 0.5,
    riders,
    shoulder: { from: 18, to: 480, y: 30 + dy },
    doorLines: [`M446,${44 + dy} L446,${196 + dy}`, `M488,${40 + dy} L494,${196 + dy}`],
    head: down(
      [
        [524, 150],
        [534, 150],
        [534, 166],
        [524, 166],
      ],
      dy,
    ),
    tail: down(
      [
        [4, 120],
        [12, 120],
        [12, 150],
        [4, 150],
      ],
      dy,
    ),
    bumpers: [
      {
        pts: down(
          [
            [512, 176],
            [538, 176],
            [538, 194],
            [514, 196],
          ],
          dy,
        ),
        color: '#9aa0a7',
      },
      {
        pts: down(
          [
            [0, 176],
            [26, 176],
            [26, 194],
            [2, 196],
          ],
          dy,
        ),
        color: '#9aa0a7',
      },
    ],
    defs: SHADE_OV,
    decals:
      `<path d="M0,${104 + dy} L540,${100 + dy} L540,${112 + dy} L0,${118 + dy} Z" fill="#d62828"/><path d="M0,${118 + dy} L540,${112 + dy} L540,${118 + dy} L0,${125 + dy} Z" fill="#fcbf49"/><path d="M0,${125 + dy} L540,${118 + dy} L540,${130 + dy} L0,${138 + dy} Z" fill="#1d4e89"/>` +
      `<rect x="446" y="${44 + dy}" width="42" height="152" fill="#1b2330"/><rect x="0" y="0" width="552" height="${h}" fill="url(#shadeov)"/>` +
      label(292, 172 + dy, 'La Bendición', 30, '#d62828', { stroke: '#fff4d6', sw: 3, family: "Georgia, 'Times New Roman', serif", italic: true, weight: 700 }) +
      label(72, 172 + dy, 'Dios es fiel', 11, '#1d4e89', { family: 'Georgia, serif', italic: true, weight: 700 }) +
      label(292, 191 + dy, 'RUTA 100 · KM 9 – PARQUE ENRIQUILLO', 8.5, '#1d4e89', { weight: 700 }),
    over: rack + cobrador,
    hitbox: { x: 4, y: 20 + dy, w: 532, h: 194 },
    anchors: { door: { x: 466, y: 130 + dy } },
  });
}

// ───────────────────────── pickups (police, DIGESETT, cocos) ─────────────────────────
interface PickupOpts {
  id: string;
  name: string;
  paint: string;
  decals?: string;
  lightBar?: 'police' | 'amber' | null;
  crew?: { x: number; shirt: string; vest: string; cap: string }[];
  cargo?: string;
  defs?: string;
}
const PDY = 30;
/** Double-cab pickup (generic 2010s shape). */
function pickup(o: PickupOpts): Sprite {
  const dy = PDY;
  const crew = (o.crew ?? [])
    .map((c, i) => {
      const x = c.x;
      const top = 36 + dy - (i % 2) * 4;
      return (
        `<path d="M${x - 15},${100 + dy} Q${x - 16},${top + 30} ${x},${top + 24} Q${x + 16},${top + 30} ${x + 15},${100 + dy} Z" fill="${c.shirt}" stroke="${OUTLINE}" stroke-width="2"/>` +
        `<path d="M${x - 13},${98 + dy} Q${x - 13},${top + 36} ${x},${top + 30} Q${x + 13},${top + 36} ${x + 13},${98 + dy} Z" fill="${c.vest}"/><path d="M${x - 13},${top + 48} L${x + 13},${top + 48}" stroke="#e8edf2" stroke-width="3"/>` +
        `<ellipse cx="${x}" cy="${top + 12}" rx="9" ry="10" fill="#7a4b2e" stroke="${OUTLINE}" stroke-width="2"/><path d="M${x - 10},${top + 9} Q${x - 9},${top - 2} ${x + 1},${top - 2} Q${x + 10},${top - 1} ${x + 10},${top + 8} Z" fill="${c.cap}" stroke="${OUTLINE}" stroke-width="1.6"/><path d="M${x + 4},${top + 6} L${x + 16},${top + 8} L${x + 4},${top + 10} Z" fill="${c.cap}"/>` +
        `<path d="M${x + 10},${top + 34} L${x + 24},${top + 22}" stroke="${OUTLINE}" stroke-width="8" stroke-linecap="round"/><path d="M${x + 10},${top + 34} L${x + 24},${top + 22}" stroke="#7a4b2e" stroke-width="4.5" stroke-linecap="round"/>`
      );
    })
    .join('');
  const rollbar = o.crew?.length ? `<path d="M146,${98 + dy} L146,${44 + dy} L172,${42 + dy} L172,${96 + dy}" fill="none" stroke="#2b2e33" stroke-width="5" stroke-linejoin="round"/>` : '';
  const bar =
    o.lightBar === 'police'
      ? `<rect x="214" y="${dy + 8}" width="64" height="14" rx="5" fill="#d9dde2" stroke="${OUTLINE}" stroke-width="2"/><rect x="218" y="${dy + 10}" width="26" height="9" rx="3" fill="#e53935"/><rect x="248" y="${dy + 10}" width="26" height="9" rx="3" fill="#1e5bff"/>`
      : o.lightBar === 'amber'
        ? `<rect x="214" y="${dy + 8}" width="64" height="14" rx="5" fill="#d9dde2" stroke="${OUTLINE}" stroke-width="2"/><rect x="218" y="${dy + 10}" width="26" height="9" rx="3" fill="#ffb300"/><rect x="248" y="${dy + 10}" width="26" height="9" rx="3" fill="#1e5bff"/>`
        : '';
  return vehicle({
    id: o.id,
    name: o.name,
    w: 410,
    h: 170 + dy,
    paint: o.paint,
    body: down(
      [
        [4, 150],
        [4, 96],
        [176, 94],
        [180, 40],
        [200, 26],
        [286, 24],
        [328, 62],
        [392, 72],
        [404, 86],
        [406, 146],
        [382, 156],
        [20, 156],
      ],
      dy,
    ),
    radius: [4, 6, 4, 8, 12, 12, 10, 12, 8, 6, 4, 4],
    wheels: [
      { x: 92, r: 28, style: 'alloy' },
      { x: 330, r: 28, style: 'alloy' },
    ],
    windows: [
      down(
        [
          [190, 32],
          [234, 30],
          [234, 62],
          [184, 62],
        ],
        dy,
      ),
      down(
        [
          [242, 30],
          [284, 30],
          [318, 62],
          [242, 62],
        ],
        dy,
      ),
    ],
    riders: [
      { x: 210, base: 63 + dy },
      { x: 268, base: 63 + dy, s: 1.05 },
    ],
    glassAlpha: 0.66,
    shoulder: { from: 8, to: 392, y: 98 + dy, y2: 74 + dy },
    doorLines: [`M184,${40 + dy} L186,${150 + dy}`, `M238,${34 + dy} L238,${150 + dy}`, `M322,${64 + dy} L316,${148 + dy}`],
    handles: [
      [226, 74 + dy],
      [306, 74 + dy],
    ],
    mirror: [318, 60 + dy],
    head: down(
      [
        [386, 78],
        [402, 84],
        [400, 94],
        [384, 90],
      ],
      dy,
    ),
    tail: down(
      [
        [3, 100],
        [12, 100],
        [12, 118],
        [3, 118],
      ],
      dy,
    ),
    bumpers: [
      {
        pts: down(
          [
            [0, 132],
            [24, 132],
            [24, 152],
            [2, 152],
          ],
          dy,
        ),
        color: '#2b2e33',
      },
      {
        pts: down(
          [
            [382, 128],
            [408, 126],
            [408, 148],
            [384, 152],
          ],
          dy,
        ),
        color: '#2b2e33',
      },
    ],
    defs: SHADE_OV + (o.defs ?? ''),
    decals: `<path d="M6,${98 + dy} L176,${96 + dy}" stroke="rgba(0,0,0,0.4)" stroke-width="2"/>` + (o.decals ?? ''),
    under: (o.cargo ?? '') + crew + rollbar,
    over: bar,
    hitbox: { x: 4, y: 24 + dy, w: 402, h: 146 },
  });
}

/** Police pickup inspired by Santo Domingo patrols: white, blue/yellow check band, light bar. No official insignia. */
export function policia(): Sprite {
  const dy = PDY;
  let checks = '';
  for (let x = 0, i = 0; x < 410; x += 12, i++) {
    checks += `<rect x="${x}" y="${118 + dy}" width="12" height="11" fill="${i % 2 ? '#ffd400' : '#1f4fa3'}"/><rect x="${x}" y="${129 + dy}" width="12" height="11" fill="${i % 2 ? '#1f4fa3' : '#ffd400'}"/>`;
  }
  return pickup({
    id: 'policia',
    name: 'Patrulla de policía',
    paint: '#f3f5f7',
    lightBar: 'police',
    crew: [
      { x: 60, shirt: '#1d2f4f', vest: '#d4ff3a', cap: '#1d2f4f' },
      { x: 118, shirt: '#1d2f4f', vest: '#d4ff3a', cap: '#1d2f4f' },
    ],
    decals: checks + `<path d="M0,${117 + dy} L410,${117 + dy} M0,${140 + dy} L410,${140 + dy}" stroke="#1f4fa3" stroke-width="2.5"/>` + label(282, 108 + dy, 'POLICÍA', 21, '#1f4fa3', { spacing: 1 }),
  });
}

/** Traffic-enforcement pickup (AMET / DIGESETT style): white with green and orange sweeps. No official insignia. */
export function digesettPickup(): Sprite {
  const dy = PDY;
  const bands =
    `<path d="M410,${120 + dy} L130,${124 + dy} Q60,${126 + dy} 30,${100 + dy} L52,${100 + dy} Q76,${116 + dy} 130,${115 + dy} L410,${111 + dy} Z" fill="#f28c28"/>` +
    `<path d="M410,${132 + dy} L130,${136 + dy} Q50,${138 + dy} 8,${104 + dy} L30,${100 + dy} Q60,${126 + dy} 130,${124 + dy} L410,${120 + dy} Z" fill="#1e8a44"/>`;
  return pickup({
    id: 'digesett-pickup',
    name: 'Camioneta de tránsito (AMET/DIGESETT)',
    paint: '#f3f5f7',
    lightBar: 'amber',
    decals: bands + label(286, 106 + dy, 'DIGESETT', 17, '#1e8a44') + label(110, 150 + dy, '911', 18, '#d62828'),
  });
}

/** Coconut seller's pickup: a pile of green coconuts and a hand-painted sign. */
export function cocosPickup(): Sprite {
  const dy = PDY;
  const rnd = artRng(91);
  let pile = '';
  for (let row = 0; row < 4; row++) {
    const n = 7 - row;
    for (let i = 0; i < n; i++) {
      const x = 20 + row * 9 + i * 22 + rnd() * 4;
      const y = 92 + dy - row * 15 + rnd() * 3;
      pile += `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="12" ry="11" fill="${rnd() < 0.8 ? '#5a9a2e' : '#8aa83a'}" stroke="${OUTLINE}" stroke-width="1.6"/><path d="M${r1(x - 6)},${r1(y - 4)} Q${r1(x)},${r1(y - 9)} ${r1(x + 6)},${r1(y - 4)}" stroke="#a9d46a" stroke-width="2" fill="none" opacity="0.7"/>`;
    }
  }
  const sign = `<rect x="30" y="${10 + dy}" width="96" height="24" rx="3" fill="#fff3c4" stroke="${OUTLINE}" stroke-width="2" transform="rotate(-4 78 ${22 + dy})"/>${label(78, 28 + dy, 'COCOS FRÍOS', 11, '#2e7d32', { rotate: -4 })}<path d="M60,${34 + dy} L60,${60 + dy} M100,${32 + dy} L100,${60 + dy}" stroke="#7a5230" stroke-width="3"/>`;
  return pickup({ id: 'cocos', name: 'Camioneta de cocos', paint: '#3f6fb5', cargo: sign + pile });
}

// ───────────────────────── 6. La Platanera ─────────────────────────
/** Small cab-over truck overloaded with green plantains, tied with rope, with a cardboard price sign. */
export function platanera(): Sprite {
  const dy = 44;
  const h = 184 + dy;
  const paint = '#c7c0dc';
  const rnd = artRng(2027);
  // the pile: rows of plantain hands forming a mound above the bed
  let pile = '';
  const rows = 7;
  for (let r = 0; r < rows; r++) {
    const y = 150 + dy - 14 - r * 13;
    const span = 172 - r * 16;
    const x0 = 12 + r * 8;
    const n = Math.max(2, Math.round(span / 30));
    for (let i = 0; i < n; i++) {
      const x = x0 + (i / n) * span + rnd() * 6;
      const ripe = rnd() < 0.12 ? 0.8 : rnd() * 0.15;
      const ang = -20 + rnd() * 40 + (r % 2 ? 180 : 0);
      pile += r % 2 ? plantain(x + 40, y + rnd() * 4, ang, 36 + rnd() * 10, ripe, true) : plantainHand(x, y + rnd() * 4, ang, 34 + rnd() * 8, 3, ripe);
    }
  }
  // two loose hands hanging over the tailgate (the ones that will fall)
  pile += plantainHand(10, 132 + dy, 200, 34, 3, 0.05) + plantain(4, 120 + dy, 160, 36, 0.1);
  const ropes = `<path d="M14,${148 + dy} Q92,${66 + dy} 190,${140 + dy}" stroke="#d9c38a" stroke-width="3" fill="none"/><path d="M70,${148 + dy} Q126,${92 + dy} 188,${112 + dy}" stroke="#d9c38a" stroke-width="3" fill="none"/>`;
  const sign = `<g transform="rotate(-6 52 ${126 + dy})"><path d="M30,${140 + dy} L30,${152 + dy} M74,${138 + dy} L74,${150 + dy}" stroke="#6d4e2c" stroke-width="2"/><rect x="10" y="${110 + dy}" width="86" height="32" fill="#c89f6b" stroke="#6d4e2c" stroke-width="2"/>${label(53, 124 + dy, 'PLÁTANOS', 10.5, '#1b1e23')}${label(53, 137 + dy, '5 X 100', 11, '#c62828')}</g>`;
  return vehicle({
    id: 'platanera',
    name: 'La Platanera',
    w: 296,
    h,
    paint,
    body: down(
      [
        [6, 176],
        [6, 148],
        [194, 148],
        [196, 82],
        [206, 72],
        [262, 72],
        [278, 84],
        [286, 122],
        [288, 176],
        [270, 184],
        [20, 184],
      ],
      dy - 0,
    ).map(([x, y]) => [x, y - 0] as Pt),
    radius: [4, 4, 2, 4, 8, 10, 8, 6, 4, 4, 4],
    wheels: [
      { x: 70, r: 22, style: 'steel' },
      { x: 236, r: 22, style: 'steel' },
    ],
    windows: [
      down(
        [
          [208, 80],
          [256, 80],
          [270, 118],
          [208, 118],
        ],
        dy,
      ),
    ],
    riders: [{ x: 236, base: 119 + dy, s: 1.05, hat: '#2e86c1' }],
    shoulder: { from: 8, to: 284, y: 150 + dy },
    doorLines: [`M204,${84 + dy} L204,${176 + dy}`, `M274,${96 + dy} L278,${176 + dy}`],
    handles: [[262, 132 + dy]],
    head: down(
      [
        [278, 140],
        [290, 140],
        [290, 152],
        [278, 152],
      ],
      dy,
    ),
    tail: down(
      [
        [4, 152],
        [12, 152],
        [12, 164],
        [4, 164],
      ],
      dy,
    ),
    bumpers: [
      {
        pts: down(
          [
            [270, 170],
            [294, 170],
            [294, 182],
            [272, 184],
          ],
          dy,
        ),
        color: '#9aa0a7',
      },
      {
        pts: down(
          [
            [0, 170],
            [22, 170],
            [22, 180],
            [2, 182],
          ],
          dy,
        ),
        color: '#2b2e33',
      },
    ],
    defs: SHADE_OV,
    decals: [0, 1, 2].map((i) => `<path d="M8,${156 + dy + i * 8} L192,${156 + dy + i * 8}" stroke="rgba(0,0,0,0.22)" stroke-width="2"/>`).join('') + `<path d="M8,${150 + dy} L194,${150 + dy}" stroke="#ffffff" stroke-width="2" opacity="0.5"/>`,
    under: pile + ropes,
    over: sign,
    hitbox: { x: 2, y: 60, w: 288, h: h - 60 },
    anchors: { drop: { x: 6, y: 128 + dy } },
  });
}

export const _r = r1;
