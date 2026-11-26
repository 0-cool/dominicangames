import { OUTLINE, type Sprite, chromeGrad, finish, label, paintGrad, r1, radial, shade } from './kit.ts';

/**
 * The motoconcho (player): a small 150 cc street bike, the motoconchista and optional passengers. They share one
 * coordinate frame (W×H, ground at H) so the renderer stacks them: bike → passenger → rider.
 */
export const MOTO_W = 176;
export const MOTO_H = 142;
const G = MOTO_H; // ground
const RW = 23; // wheel radius (0.31 m)
export const MOTO_WHEELS = [
  { sprite: `wheel-spoke-${RW}`, x: 36, y: G - RW, r: RW },
  { sprite: `wheel-spoke-${RW}`, x: 142, y: G - RW, r: RW },
];
/** Bike-only collision box (rider overhang is ignored). */
export const MOTO_HITBOX = { x: 12, y: 40, w: 156, h: 102 };

export interface BikeOpts {
  id: string;
  name: string;
  paint: string;
  /** Box on the rear rack: delivery box or police equipment. */
  box?: { color: string; text: string; textColor: string } | null;
  /** Emergency lights (traffic police). */
  beacons?: boolean;
  stripe?: string;
}

export function bikeSprite(o: BikeOpts): Sprite {
  const p = o.paint;
  const defs = `${paintGrad('paint', p, 1.2)}${chromeGrad('chrome')}${radial('lamp', '#fffbe6', '#e8d9a0', 0.4, 0.35)}<linearGradient id="seat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4d52"/><stop offset="0.4" stop-color="#232528"/><stop offset="1" stop-color="#111214"/></linearGradient><linearGradient id="engine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa0a7"/><stop offset="1" stop-color="#4b5056"/></linearGradient>`;
  const sw = `stroke="${OUTLINE}" stroke-width="2" stroke-linejoin="round"`;
  const parts: string[] = [];
  // rear rack + fender
  parts.push(`<path d="M8,${G - 32} Q12,${G - 52} 36,${G - 54} Q56,${G - 54} 64,${G - 44} L59,${G - 41} Q50,${G - 49} 36,${G - 48} Q19,${G - 47} 15,${G - 31} Z" fill="url(#paint)" ${sw}/>`);
  parts.push(`<path d="M10,${G - 62} L52,${G - 64}" stroke="#2b2e33" stroke-width="3.5" stroke-linecap="round"/><path d="M14,${G - 62} L18,${G - 52} M44,${G - 63} L46,${G - 52}" stroke="#2b2e33" stroke-width="2.5"/>`);
  // tail light
  parts.push(`<path d="M6,${G - 66} L16,${G - 67} L16,${G - 60} L7,${G - 59} Z" fill="#e8322b" stroke="${OUTLINE}" stroke-width="1.4"/><path d="M8,${G - 65} L13,${G - 65.5}" stroke="#ff9b8f" stroke-width="1.4"/>`);
  // swingarm + chain guard
  parts.push(`<path d="M36,${G - RW} L86,${G - 36}" stroke="#2a2c30" stroke-width="8" stroke-linecap="round"/><path d="M40,${G - 30} L84,${G - 42}" stroke="#121315" stroke-width="5" stroke-linecap="round"/>`);
  // exhaust: header pipe + muffler with heat shield
  parts.push(`<path d="M102,${G - 34} Q92,${G - 22} 70,${G - 26} L44,${G - 33}" fill="none" stroke="url(#chrome)" stroke-width="6" stroke-linecap="round"/>`);
  parts.push(`<path d="${`M12,${G - 44} L56,${G - 38} Q60,${G - 33} 56,${G - 28} L12,${G - 32} Q6,${G - 38} 12,${G - 44} Z`}" fill="url(#chrome)" ${sw}/><path d="M22,${G - 41} L48,${G - 37.5} L47,${G - 33} L21,${G - 36} Z" fill="#3a3d42" opacity="0.85"/>`);
  // engine block with cooling fins + clutch cover
  parts.push(`<path d="M72,${G - 60} L110,${G - 58} L112,${G - 34} Q100,${G - 26} 84,${G - 28} L70,${G - 36} Z" fill="url(#engine)" ${sw}/>`);
  for (let i = 0; i < 5; i++) parts.push(`<path d="M${80 + i * 5},${G - 58} L${79 + i * 5},${G - 44}" stroke="#3b3f44" stroke-width="1.6"/>`);
  parts.push(`<circle cx="92" cy="${G - 38}" r="9" fill="url(#chrome)" ${sw}/><circle cx="92" cy="${G - 38}" r="3.5" fill="#6b7178"/>`);
  // frame down tube
  parts.push(`<path d="M122,${G - 86} L106,${G - 52}" stroke="${shade(p, -0.25)}" stroke-width="7" stroke-linecap="round"/>`);
  // side cover (under the seat) with model name
  parts.push(`<path d="M44,${G - 74} L90,${G - 76} Q92,${G - 64} 84,${G - 54} L52,${G - 52} Q44,${G - 60} 44,${G - 74} Z" fill="url(#paint)" ${sw}/>`);
  parts.push(label(67, G - 60, 'FARO 150', 7.5, '#ffffff', { stroke: shade(p, -0.45), sw: 1.6, italic: true }));
  // fuel tank
  parts.push(`<path d="M80,${G - 70} Q84,${G - 92} 104,${G - 93} Q122,${G - 93} 126,${G - 80} L121,${G - 68} Q100,${G - 62} 80,${G - 70} Z" fill="url(#paint)" ${sw}/>`);
  parts.push(`<path d="M86,${G - 80} Q100,${G - 86} 120,${G - 82}" fill="none" stroke="${o.stripe ?? '#ffffff'}" stroke-width="3.5" opacity="0.9"/><path d="M90,${G - 89} Q102,${G - 92} 114,${G - 90}" fill="none" stroke="#ffffff" stroke-width="2.2" opacity="0.55"/>`);
  // seat
  parts.push(`<path d="M28,${G - 70} Q30,${G - 80} 46,${G - 81} L88,${G - 82} Q96,${G - 82} 93,${G - 75} L86,${G - 69} L36,${G - 66} Q28,${G - 65} 28,${G - 70} Z" fill="url(#seat)" ${sw}/><path d="M38,${G - 78} L84,${G - 79}" stroke="#6b6f75" stroke-width="1.5" opacity="0.7"/>`);
  if (o.box) {
    parts.push(`<rect x="4" y="${G - 108}" width="46" height="42" rx="4" fill="${o.box.color}" ${sw}/><rect x="7" y="${G - 105}" width="40" height="8" rx="2" fill="#ffffff" opacity="0.25"/>`);
    parts.push(label(27, G - 82, o.box.text, o.box.text.length > 6 ? 7 : 9, o.box.textColor, { weight: 900 }));
  }
  if (o.beacons) {
    parts.push(`<rect x="10" y="${G - 118}" width="7" height="10" rx="2" fill="#2f6bff" stroke="${OUTLINE}" stroke-width="1.2"/><rect x="38" y="${G - 118}" width="7" height="10" rx="2" fill="#ff2f2f" stroke="${OUTLINE}" stroke-width="1.2"/><path d="M13,${G - 108} L13,${G - 102} M41,${G - 108} L41,${G - 102}" stroke="#2b2e33" stroke-width="2"/>`);
  }
  // front fork (behind the fender) + front fender
  parts.push(`<path d="M126,${G - 88} L142,${G - RW}" stroke="url(#chrome)" stroke-width="6" stroke-linecap="round"/><path d="M134,${G - 54} L142,${G - RW}" stroke="#2c2f34" stroke-width="7" stroke-linecap="round"/>`);
  parts.push(`<path d="M124,${G - 36} Q132,${G - 54} 146,${G - 54} Q160,${G - 53} 166,${G - 40} L161,${G - 38} Q155,${G - 48} 145,${G - 48} Q134,${G - 48} 129,${G - 34} Z" fill="url(#paint)" ${sw}/>`);
  // headlight + turn signal + speedometer
  parts.push(`<circle cx="136" cy="${G - 88}" r="10" fill="url(#chrome)" ${sw}/><circle cx="138" cy="${G - 88}" r="7" fill="url(#lamp)"/><path d="M135,${G - 93} Q139,${G - 95} 142,${G - 91}" stroke="#ffffff" stroke-width="1.6" fill="none"/>`);
  parts.push(`<rect x="140" y="${G - 103}" width="9" height="5" rx="2" fill="#ff9d1c" stroke="${OUTLINE}" stroke-width="1"/><rect x="118" y="${G - 106}" width="12" height="9" rx="3" fill="#202226" stroke="${OUTLINE}" stroke-width="1"/>`);
  if (o.beacons) parts.push(`<rect x="146" y="${G - 112}" width="9" height="6" rx="2" fill="#ff2f2f" stroke="${OUTLINE}" stroke-width="1"/>`);
  // handlebar + mirror
  parts.push(`<path d="M126,${G - 100} L114,${G - 92}" stroke="#2b2e33" stroke-width="4" stroke-linecap="round"/><path d="M124,${G - 101} L118,${G - 122}" stroke="#2b2e33" stroke-width="2"/><ellipse cx="117" cy="${G - 126}" rx="6" ry="4.5" fill="#2b2e33" stroke="${OUTLINE}" stroke-width="1"/><ellipse cx="117" cy="${G - 126.5}" rx="3.5" ry="2.3" fill="#9fb3c8"/>`);
  return finish(o.id, o.name, MOTO_W, MOTO_H, defs, parts.join(''), MOTO_WHEELS, MOTO_HITBOX, { rider: { x: 70, y: G - 74 }, tail: { x: 8, y: G - 62 } });
}

export interface RiderLook {
  helmet: string;
  helmetStripe: string;
  vest: string;
  shirt: string;
  pants: string;
  skin: string;
  number?: string;
}

const legPath = (hip: [number, number], knee: [number, number], foot: [number, number], color: string, w: number) =>
  `<path d="M${hip[0]},${hip[1]} L${knee[0]},${knee[1]} L${foot[0]},${foot[1]}" fill="none" stroke="${OUTLINE}" stroke-width="${w + 4}" stroke-linecap="round" stroke-linejoin="round"/><path d="M${hip[0]},${hip[1]} L${knee[0]},${knee[1]} L${foot[0]},${foot[1]}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** The motoconchista: full-face helmet, numbered reflective vest, jeans and sneakers. */
export function riderSprite(id: string, name: string, look: RiderLook): Sprite {
  const L = look;
  const defs = `${paintGrad('vest', L.vest, 1.1)}${radial('helmet', shade(L.helmet, 0.45), L.helmet, 0.35, 0.3)}<linearGradient id="visor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7fb3d9"/><stop offset="0.5" stop-color="#1d3954"/><stop offset="1" stop-color="#0b1622"/></linearGradient>`;
  const sw = `stroke="${OUTLINE}" stroke-width="2" stroke-linejoin="round"`;
  const parts: string[] = [];
  // leg (thigh to knee, shin down to the foot peg) + sneaker
  parts.push(legPath([70, G - 76], [104, G - 70], [96, G - 42], L.pants, 13));
  parts.push(`<path d="M88,${G - 42} L106,${G - 42} Q112,${G - 40} 110,${G - 35} L88,${G - 35} Z" fill="#f2f2f2" ${sw}/><path d="M88,${G - 37} L110,${G - 37}" stroke="#c0392b" stroke-width="2"/>`);
  // torso + vest (leaning forward)
  parts.push(`<path d="M58,${G - 70} Q52,${G - 98} 66,${G - 116} Q80,${G - 126} 92,${G - 114} Q98,${G - 96} 90,${G - 72} Z" fill="${L.shirt}" ${sw}/>`);
  parts.push(`<path d="M57,${G - 72} Q52,${G - 98} 65,${G - 114} Q76,${G - 122} 88,${G - 113} Q94,${G - 96} 87,${G - 74} Z" fill="url(#vest)" ${sw}/>`);
  parts.push(`<path d="M55,${G - 84} Q72,${G - 88} 90,${G - 86}" stroke="#e8edf2" stroke-width="4.5" opacity="0.95"/><path d="M57,${G - 100} Q72,${G - 104} 91,${G - 101}" stroke="#e8edf2" stroke-width="4.5" opacity="0.95"/>`);
  if (L.number) parts.push(`<rect x="58" y="${G - 99}" width="18" height="13" rx="2" fill="#ffffff" stroke="${OUTLINE}" stroke-width="1"/>${label(67, G - 88.5, L.number, 10, '#111', { weight: 900 })}`);
  // arm to the handlebar (sleeve + forearm + glove)
  parts.push(`<path d="M84,${G - 110} L100,${G - 96} L116,${G - 94}" fill="none" stroke="${OUTLINE}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><path d="M84,${G - 110} L100,${G - 96}" stroke="${L.shirt}" stroke-width="9" stroke-linecap="round"/><path d="M100,${G - 96} L116,${G - 94}" stroke="${L.skin}" stroke-width="8" stroke-linecap="round"/><circle cx="117" cy="${G - 94}" r="5" fill="#2a2c30"/>`);
  // neck + helmet (full face) with visor reflection
  parts.push(`<path d="M76,${G - 118} L80,${G - 126}" stroke="${L.skin}" stroke-width="8" stroke-linecap="round"/>`);
  parts.push(`<path d="M64,${G - 132} Q62,${G - 152} 80,${G - 156} Q98,${G - 158} 100,${G - 140} L99,${G - 126} Q90,${G - 120} 74,${G - 122} Q64,${G - 124} 64,${G - 132} Z" fill="url(#helmet)" ${sw}/>`);
  parts.push(`<path d="M66,${G - 142} Q80,${G - 154} 98,${G - 148}" fill="none" stroke="${L.helmetStripe}" stroke-width="4"/>`);
  parts.push(`<path d="M82,${G - 145} Q96,${G - 147} 100,${G - 138} L100,${G - 131} Q92,${G - 129} 84,${G - 133} Z" fill="url(#visor)" stroke="${OUTLINE}" stroke-width="1.5"/><path d="M86,${G - 142} Q93,${G - 144} 97,${G - 140}" stroke="#ffffff" stroke-width="1.6" opacity="0.8" fill="none"/>`);
  return finish(id, name, MOTO_W, MOTO_H + 18, defs, `<g transform="translate(0,18)">${parts.join('')}</g>`, [], MOTO_HITBOX);
}

export type PassengerKind = 'senora' | 'estudiante' | 'don';

/** Passenger riding behind the motoconchista. */
export function passengerSprite(kind: PassengerKind): Sprite {
  const look = {
    senora: { shirt: '#e84393', pants: '#2c3e50', skin: '#8d5a3b', hair: '#1c1410' },
    estudiante: { shirt: '#f0e6c8', pants: '#1f3b73', skin: '#b47b54', hair: '#2a1a12' },
    don: { shirt: '#2e86c1', pants: '#6b5a45', skin: '#6b4329', hair: '#d9d9d9' },
  }[kind];
  const defs = '';
  const sw = `stroke="${OUTLINE}" stroke-width="2" stroke-linejoin="round"`;
  const parts: string[] = [];
  parts.push(legPath([44, G - 74], [66, G - 70], [58, G - 44], look.pants, 12));
  parts.push(`<path d="M50,${G - 44} L66,${G - 44} Q70,${G - 41} 68,${G - 38} L50,${G - 38} Z" fill="#3b2b22" ${sw}/>`);
  if (kind === 'estudiante') parts.push(`<rect x="16" y="${G - 116}" width="22" height="34" rx="6" fill="#c0392b" ${sw}/><path d="M20,${G - 104} L34,${G - 104}" stroke="#7b241c" stroke-width="2"/>`);
  parts.push(`<path d="M34,${G - 72} Q30,${G - 100} 44,${G - 114} Q56,${G - 120} 64,${G - 108} Q66,${G - 90} 60,${G - 72} Z" fill="${look.shirt}" ${sw}/>`);
  if (kind === 'senora') parts.push(`<circle cx="40" cy="${G - 96}" r="3" fill="#ffffff" opacity="0.7"/><circle cx="52" cy="${G - 86}" r="3" fill="#ffffff" opacity="0.7"/><circle cx="46" cy="${G - 106}" r="2.5" fill="#ffd166"/>`);
  // arm around the rider's waist
  parts.push(`<path d="M58,${G - 106} L70,${G - 92} L82,${G - 86}" fill="none" stroke="${OUTLINE}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/><path d="M58,${G - 106} L70,${G - 92} L82,${G - 86}" fill="none" stroke="${look.skin}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`);
  // head
  parts.push(`<path d="M50,${G - 116} L52,${G - 122}" stroke="${look.skin}" stroke-width="7"/><ellipse cx="53" cy="${G - 132}" rx="10" ry="11" fill="${look.skin}" ${sw}/>`);
  if (kind === 'senora') parts.push(`<path d="M43,${G - 132} Q42,${G - 146} 55,${G - 145} Q64,${G - 143} 63,${G - 134} Q56,${G - 140} 46,${G - 128} Z" fill="${look.hair}"/><circle cx="43" cy="${G - 143}" r="6" fill="${look.hair}" stroke="${OUTLINE}" stroke-width="1.5"/>`);
  if (kind === 'estudiante') parts.push(`<path d="M43,${G - 131} Q42,${G - 145} 54,${G - 145} Q64,${G - 144} 63,${G - 135} Q55,${G - 139} 45,${G - 129} Z" fill="${look.hair}"/>`);
  if (kind === 'don') parts.push(`<path d="M42,${G - 135} Q44,${G - 148} 55,${G - 147} Q64,${G - 146} 64,${G - 136} L72,${G - 135} L44,${G - 132} Z" fill="#c0392b" ${sw}/><path d="M60,${G - 126} Q62,${G - 122} 58,${G - 121}" stroke="#d9d9d9" stroke-width="3"/>`);
  parts.push(`<circle cx="58" cy="${G - 133}" r="1.4" fill="#1b1b1b"/>`);
  if (kind === 'senora') parts.push(`<path d="M30,${G - 92} L24,${G - 70}" stroke="#2b2e33" stroke-width="1.5"/><rect x="12" y="${G - 72}" width="22" height="20" rx="3" fill="#f5f5f5" ${sw}/>${label(23, G - 58, 'SUPER', 5.5, '#c0392b')}`);
  if (kind === 'don') parts.push(`<g transform="translate(18,${G - 104}) rotate(-25)">${[0, 1, 2, 3, 4].map((i) => `<path d="M${i * 5},0 Q${i * 5 + 8},-14 ${i * 5 + 2},-30" fill="none" stroke="${OUTLINE}" stroke-width="7.5" stroke-linecap="round"/><path d="M${i * 5},0 Q${i * 5 + 8},-14 ${i * 5 + 2},-30" fill="none" stroke="#4f8f2f" stroke-width="5" stroke-linecap="round"/>`).join('')}</g>`);
  return finish(`pasajero-${kind}`, `Pasajero (${kind})`, MOTO_W, MOTO_H + 18, defs, `<g transform="translate(0,18)">${parts.join('')}</g>`, [], MOTO_HITBOX);
}

export const r = r1;
