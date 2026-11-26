import { type Sprite, wheelSprite } from './kit.ts';
import { bikeSprite, passengerSprite, riderSprite } from './moto.ts';
import { carroPublico, cocosPickup, digesettPickup, guagua, omsa, platanera, policia, sonataMamey } from './vehicles.ts';
import { extraSprites } from './extra.ts';
import { agenteSprite, cascoSprite, clienteSprite, conoSprite, desvioSprite, hoyoSprite, platanoSprite, racimoSprite } from './props.ts';

export * from './kit.ts';
export { MOTO_H, MOTO_W } from './moto.ts';

/** Every sprite of the game, keyed by id (built once; pure SVG strings, no DOM needed). */
export function buildSprites(): Map<string, Sprite> {
  const list: Sprite[] = [
    bikeSprite({ id: 'moto-jugador', name: 'Motor del motoconchista', paint: '#c62828', stripe: '#ffd23f' }),
    riderSprite('motoconchista', 'Motoconchista', { helmet: '#1f2329', helmetStripe: '#e53935', vest: '#ff7a1a', shirt: '#2e6fb7', pants: '#2f4f7f', skin: '#8d5a3b', number: '27' }),
    passengerSprite('senora'),
    passengerSprite('estudiante'),
    passengerSprite('don'),
    carroPublico(),
    sonataMamey(),
    omsa(),
    guagua(),
    platanera(),
    platanoSprite(),
    racimoSprite(),
    policia(),
    digesettPickup(),
    bikeSprite({ id: 'moto-digesett', name: 'Motor de tránsito (AMET/DIGESETT)', paint: '#eef1f3', stripe: '#1e8a44', beacons: true, box: { color: '#f3f5f7', text: 'DIGESETT', textColor: '#1e8a44' } }),
    riderSprite('agente-motorizado', 'Agente motorizado', { helmet: '#f5f7f8', helmetStripe: '#1e8a44', vest: '#c6ff00', shirt: '#6fa86a', pants: '#1e4d2b', skin: '#6b4329' }),
    agenteSprite('agente-pare', 'Agente de tránsito (¡Pare!)', { shirt: '#6fa86a', pants: '#1e4d2b', vest: '#c6ff00', vestText: 'DIGESETT', cap: '#f5f7f8', skin: '#6b4329' }, 'pare'),
    agenteSprite('agente-siga', 'Agente de tránsito (siga)', { shirt: '#6fa86a', pants: '#1e4d2b', vest: '#c6ff00', vestText: 'DIGESETT', cap: '#f5f7f8', skin: '#6b4329' }, 'siga'),
    conoSprite(),
    desvioSprite(),
    hoyoSprite(),
    cascoSprite(),
    clienteSprite(0),
    clienteSprite(1),
    clienteSprite(2),
    cocosPickup(),
    ...extraSprites(),
  ];
  const map = new Map(list.map((s) => [s.id, s]));
  // wheel sprites referenced by vehicles
  for (const s of list) for (const w of s.wheels) if (!map.has(w.sprite)) {
    const [, style, r] = w.sprite.split('-');
    const ws = wheelSprite(style as Parameters<typeof wheelSprite>[0], Number(r));
    map.set(ws.id, ws);
  }
  return map;
}
