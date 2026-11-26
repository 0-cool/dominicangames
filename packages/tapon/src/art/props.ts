import { OUTLINE, type Sprite, finish, label, poly, r1, radial, shade } from './kit.ts';

/** Deterministic pseudo-random numbers for art (same picture every time). */
export function artRng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/**
 * One plantain: stem at (x, y), curved body along `angle` (degrees), length `len`.
 * `ripe` 0 = green (plátano verde) … 1 = yellow (maduro).
 */
export function plantain(x: number, y: number, angle: number, len: number, ripe = 0, flip = false): string {
  const t = len * 0.17;
  const base = ripe < 0.5 ? (ripe < 0.2 ? '#4c8a2b' : '#7aa83a') : '#e8c547';
  const dark = shade(base, -0.38);
  const light = shade(base, 0.35);
  const fy = flip ? -1 : 1;
  const body = `M0,${-t * 0.5 * fy} Q${len * 0.5},${-t * 2.3 * fy} ${len},${-t * 0.95 * fy} L${len + 3},${-t * 0.6 * fy} Q${len * 0.5},${t * 0.45 * fy} 0,${t * 0.5 * fy} Z`;
  return (
    `<g transform="translate(${r1(x)},${r1(y)}) rotate(${r1(angle)})">` +
    `<path d="${body}" fill="${base}" stroke="${OUTLINE}" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<path d="M${len * 0.12},${-t * 0.55 * fy} Q${len * 0.5},${-t * 1.75 * fy} ${len * 0.88},${-t * 0.95 * fy}" fill="none" stroke="${light}" stroke-width="${r1(t * 0.35)}" opacity="0.7" stroke-linecap="round"/>` +
    `<path d="M${len * 0.1},${t * 0.25 * fy} Q${len * 0.5},${-t * 0.1 * fy} ${len * 0.9},${-t * 0.5 * fy}" fill="none" stroke="${dark}" stroke-width="1.2" opacity="0.6"/>` +
    `<ellipse cx="${r1(len + 1.5)}" cy="${r1(-t * 0.78 * fy)}" rx="2.6" ry="2" fill="#3b2a1a"/>` +
    `<path d="M0,0 L${r1(-len * 0.14)},${r1(t * 0.25 * fy)}" stroke="#5b4a26" stroke-width="${r1(t * 0.55)}" stroke-linecap="round"/>` +
    `</g>`
  );
}

/** A "mano" of plantains fanned out from one crown. */
export function plantainHand(x: number, y: number, angle: number, len: number, n: number, ripe = 0): string {
  let out = '';
  for (let i = 0; i < n; i++) out += plantain(x, y + i * 1.5, angle - 18 + (36 * i) / Math.max(1, n - 1), len * (0.92 + 0.08 * Math.sin(i * 2.1)), ripe);
  return out + `<ellipse cx="${x}" cy="${y + n * 0.7}" rx="4" ry="5" fill="#5b4a26" stroke="${OUTLINE}" stroke-width="1"/>`;
}

// ───────────────────────── obstacles & props ─────────────────────────
export function platanoSprite(): Sprite {
  const w = 62;
  const h = 26;
  return finish('platano', 'Plátano en la calle', w, h, '', `<ellipse cx="31" cy="23" rx="26" ry="3.5" fill="rgba(0,0,0,0.25)"/>${plantain(8, 19, -6, 46, 0.05)}`, [], { x: 6, y: 6, w: 50, h: 20 });
}

export function racimoSprite(): Sprite {
  const w = 78;
  const h = 40;
  return finish('platano-racimo', 'Mano de plátanos en la calle', w, h, '', `<ellipse cx="39" cy="36" rx="32" ry="4" fill="rgba(0,0,0,0.25)"/>${plantainHand(14, 26, -12, 50, 4, 0.08)}`, [], { x: 8, y: 6, w: 62, h: 34 });
}

export function conoSprite(): Sprite {
  const w = 44;
  const h = 58;
  const body = `<ellipse cx="22" cy="54" rx="20" ry="4" fill="rgba(0,0,0,0.25)"/><path d="M4,50 L40,50 L40,56 L4,56 Z" fill="#202226" stroke="${OUTLINE}" stroke-width="1.5"/><path d="M15,6 L29,6 L38,50 L6,50 Z" fill="url(#cone)" stroke="${OUTLINE}" stroke-width="1.8" stroke-linejoin="round"/><path d="M12,20 L32,20 L34,28 L10,28 Z" fill="#f1f3f5"/><path d="M8,36 L36,36 L37,42 L7,42 Z" fill="#f1f3f5"/>`;
  return finish('cono', 'Cono', w, h, `<linearGradient id="cone" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff8a3d"/><stop offset="0.5" stop-color="#ff6b1a"/><stop offset="1" stop-color="#c94b0b"/></linearGradient>`, body, [], { x: 4, y: 6, w: 36, h: 52 });
}

export function desvioSprite(): Sprite {
  const w = 132;
  const h = 112;
  const stripes = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<path d="${poly([[8 + i * 16, 18], [18 + i * 16, 18], [8 + i * 16, 46], [-2 + i * 16, 46]])}" fill="${i % 2 ? '#ffffff' : '#ff6b1a'}"/>`).join('');
  const body =
    `<ellipse cx="66" cy="108" rx="60" ry="4" fill="rgba(0,0,0,0.25)"/>` +
    `<path d="M18,46 L10,108 M114,46 L122,108 M30,46 L36,108 M102,46 L96,108" stroke="#3b3f44" stroke-width="5" stroke-linecap="round"/>` +
    `<clipPath id="board"><rect x="4" y="18" width="124" height="28" rx="3"/></clipPath><g clip-path="url(#board)">${stripes}</g><rect x="4" y="18" width="124" height="28" rx="3" fill="none" stroke="${OUTLINE}" stroke-width="2"/>` +
    `<rect x="20" y="54" width="92" height="30" rx="4" fill="#ffd400" stroke="${OUTLINE}" stroke-width="2"/>${label(58, 75, 'DESVÍO', 16, '#1b1e23')}<path d="M90,62 L104,69 L90,76 Z" fill="#1b1e23"/>` +
    `<circle cx="14" cy="12" r="6" fill="#ffb300" stroke="${OUTLINE}" stroke-width="1.5"/><circle cx="118" cy="12" r="6" fill="#ffb300" stroke="${OUTLINE}" stroke-width="1.5"/>`;
  return finish('desvio', 'Letrero de desvío', w, h, '', body, [], { x: 4, y: 18, w: 124, h: 94 });
}

export function hoyoSprite(): Sprite {
  const w = 120;
  const h = 30;
  const body = `<path d="M6,16 Q14,4 40,5 Q62,1 86,6 Q112,7 116,16 Q110,27 80,27 Q58,30 30,26 Q4,25 6,16 Z" fill="#3c3a37" stroke="#24221f" stroke-width="2"/><path d="M16,16 Q24,9 44,10 Q64,7 86,11 Q104,12 106,17 Q98,23 76,23 Q56,25 32,22 Q14,21 16,16 Z" fill="#141312"/><path d="M24,13 Q46,8 70,9" stroke="#5a5650" stroke-width="2" fill="none"/><path d="M30,21 Q52,24 82,21" stroke="#2c4a5a" stroke-width="2" opacity="0.6" fill="none"/>`;
  return finish('hoyo', 'Hoyo en la calle', w, h, '', body, [], { x: 14, y: 4, w: 92, h: 22 });
}

export function cascoSprite(): Sprite {
  const w = 64;
  const h = 64;
  const body = `<circle cx="32" cy="32" r="30" fill="url(#glow)"/><path d="M12,38 Q10,14 32,11 Q54,10 54,32 L54,42 Q42,46 26,44 Q14,44 12,38 Z" fill="url(#hel)" stroke="${OUTLINE}" stroke-width="2.4"/><path d="M34,22 Q48,22 53,32 L53,38 Q44,38 36,34 Z" fill="#1d3954" stroke="${OUTLINE}" stroke-width="1.6"/><path d="M14,26 Q26,15 46,17" stroke="#ffd23f" stroke-width="4" fill="none"/>`;
  return finish('casco', 'Casco extra', w, h, `${radial('glow', 'rgba(255,230,120,0.55)', 'rgba(255,230,120,0)', 0.5, 0.5)}${radial('hel', '#ff6b6b', '#c62828', 0.35, 0.3)}`, body, [], { x: 10, y: 10, w: 44, h: 44 });
}

/** Person on the curb raising a hand for a motoconcho (a pickup). */
export function clienteSprite(kind: 0 | 1 | 2): Sprite {
  const look = [
    { shirt: '#9b59b6', pants: '#2c3e50', skin: '#8d5a3b', hair: '#1c1410' },
    { shirt: '#27ae60', pants: '#7f6a4d', skin: '#b47b54', hair: '#2a1a12' },
    { shirt: '#e67e22', pants: '#1f3b73', skin: '#6b4329', hair: '#111111' },
  ][kind];
  const w = 72;
  const h = 150;
  const sw = `stroke="${OUTLINE}" stroke-width="2" stroke-linejoin="round"`;
  const body =
    `<ellipse cx="36" cy="146" rx="22" ry="4" fill="rgba(0,0,0,0.25)"/>` +
    `<path d="M28,96 L26,142 M42,96 L46,142" stroke="${OUTLINE}" stroke-width="12" stroke-linecap="round"/><path d="M28,96 L26,142 M42,96 L46,142" stroke="${look.pants}" stroke-width="8" stroke-linecap="round"/>` +
    `<path d="M18,142 L32,142 L32,148 L16,148 Z M40,142 L54,142 L56,148 L40,148 Z" fill="#2b2e33"/>` +
    `<path d="M20,98 Q18,64 36,58 Q54,64 52,98 Z" fill="${look.shirt}" ${sw}/>` +
    `<path d="M48,66 L60,40 L62,20" fill="none" stroke="${OUTLINE}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M48,66 L60,40 L62,20" fill="none" stroke="${look.skin}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M24,66 L16,90" stroke="${OUTLINE}" stroke-width="10" stroke-linecap="round"/><path d="M24,66 L16,90" stroke="${look.skin}" stroke-width="6" stroke-linecap="round"/>` +
    `<ellipse cx="36" cy="44" rx="11" ry="12" fill="${look.skin}" ${sw}/><path d="M25,42 Q26,30 37,30 Q48,30 47,40 Q38,36 25,42 Z" fill="${look.hair}"/><circle cx="41" cy="44" r="1.4" fill="#111"/>` +
    `<rect x="44" y="0" width="26" height="16" rx="5" fill="#ffffff" stroke="${OUTLINE}" stroke-width="1.5"/>${label(57, 12, '¡MOTO!', 7.5, '#c62828')}`;
  return finish(`cliente-${kind}`, 'Cliente esperando', w, h, '', body, [], { x: 14, y: 30, w: 46, h: 120 });
}

export interface OfficerLook {
  shirt: string;
  pants: string;
  vest: string;
  vestText: string;
  cap: string;
  skin: string;
}

/**
 * Traffic officer (AMET / DIGESETT style, no official insignia) facing left towards oncoming traffic.
 * pose 'pare' = palm out (stop), 'siga' = waving traffic on.
 */
export function agenteSprite(id: string, name: string, look: OfficerLook, pose: 'pare' | 'siga'): Sprite {
  const w = 96;
  const h = 156;
  const sw = `stroke="${OUTLINE}" stroke-width="2" stroke-linejoin="round"`;
  const L = look;
  const arm =
    pose === 'pare'
      ? `M46,70 L24,72 L6,66`
      : `M46,70 L30,52 L20,30`;
  const hand = pose === 'pare' ? `<path d="M2,58 L9,57 L10,70 L3,72 Z" fill="#f5f5f5" ${sw}/>` : `<circle cx="19" cy="27" r="5.5" fill="#f5f5f5" ${sw}/>`;
  const body =
    `<ellipse cx="50" cy="152" rx="26" ry="4" fill="rgba(0,0,0,0.25)"/>` +
    `<path d="M44,104 L40,146 M58,104 L62,146" stroke="${OUTLINE}" stroke-width="13" stroke-linecap="round"/><path d="M44,104 L40,146 M58,104 L62,146" stroke="${L.pants}" stroke-width="9" stroke-linecap="round"/>` +
    `<path d="M30,146 L46,146 L46,153 L28,153 Z M56,146 L70,146 L72,153 L56,153 Z" fill="#141518"/>` +
    `<path d="M36,106 Q32,70 50,62 Q66,66 66,106 Z" fill="${L.shirt}" ${sw}/>` +
    `<path d="M37,104 Q34,76 50,68 Q63,72 64,104 Z" fill="${L.vest}" ${sw}/><path d="M36,84 L64,84 M35,96 L65,96" stroke="#e8edf2" stroke-width="4"/>` +
    `${label(50, 80, L.vestText, 5.6, '#1b1e23', { weight: 900 })}` +
    `<path d="${arm}" fill="none" stroke="${OUTLINE}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/><path d="${arm}" fill="none" stroke="${L.shirt}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>${hand}` +
    `<path d="M58,72 L66,94" stroke="${OUTLINE}" stroke-width="10" stroke-linecap="round"/><path d="M58,72 L66,94" stroke="${L.shirt}" stroke-width="6" stroke-linecap="round"/><circle cx="66" cy="96" r="4.5" fill="#f5f5f5" ${sw}/>` +
    `<path d="M48,58 L50,64" stroke="${L.skin}" stroke-width="8"/><ellipse cx="48" cy="48" rx="11" ry="12" fill="${L.skin}" ${sw}/><circle cx="42" cy="47" r="1.5" fill="#111"/>` +
    `<path d="M36,44 Q36,30 50,30 Q62,31 61,44 Z" fill="${L.cap}" ${sw}/><path d="M38,43 L24,46 L38,47 Z" fill="${shade(L.cap, -0.35)}" ${sw}/><rect x="37" y="38" width="24" height="4" fill="${L.vest}"/>` +
    `<path d="M38,53 L30,56" stroke="#c0c6cc" stroke-width="3" stroke-linecap="round"/><circle cx="29" cy="56.5" r="2.4" fill="#c0c6cc" stroke="${OUTLINE}" stroke-width="0.8"/>`;
  return finish(id, name, w, h, '', body, [], { x: 28, y: 28, w: 44, h: 128 });
}
