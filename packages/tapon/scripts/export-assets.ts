// El Tapón asset export: every sprite as a standalone SVG + sprites.json (sizes, wheels, collision boxes, anchors),
// transparent WebP composites of each vehicle (body + wheels + rider) for the catalog page, and the asset table in
// docs/EL_TAPON_ASSETS.md. All art is original (generated from code in src/art/), nothing is copied.
//
// Usage (from the repository root):  npx tsx packages/tapon/scripts/export-assets.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildSprites, PX_PER_M, type Sprite } from '../src/art/index.ts';
import { KINDS, OBSTACLES } from '../src/sim/kinds.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const spritesDir = join(root, 'apps/web/public/games/el-tapon/sprites');
const vehiclesDir = join(root, 'apps/web/public/games/el-tapon/vehicles');
mkdirSync(spritesDir, { recursive: true });
mkdirSync(vehiclesDir, { recursive: true });

const all = buildSprites();
const metres = (px: number) => +(px / PX_PER_M).toFixed(2);

// ── 1. individual sprites ──
const manifest: Record<string, unknown> = {};
for (const s of all.values()) {
  writeFileSync(join(spritesDir, `${s.id}.svg`), s.svg);
  manifest[s.id] = { name: s.name, width: s.w, height: s.h, widthM: metres(s.w), heightM: metres(s.h), ground: s.ground, hitbox: s.hitbox, hitboxM: { x: metres(s.hitbox.x), w: metres(s.hitbox.w) }, wheels: s.wheels, anchors: s.anchors ?? {} };
}
writeFileSync(join(spritesDir, 'sprites.json'), JSON.stringify({ scale: `${PX_PER_M} px = 1 m (near lane, scale 1)`, ground: 'y = height (bottom edge)', sprites: manifest }, null, 1));

// ── 2. composites for the gallery (parts share the ground line; x = offset in sprite px) ──
interface Part {
  id: string;
  x?: number;
}
const COMPOSITES: Record<string, Part[]> = {
  motoconchista: [{ id: 'moto-jugador' }, { id: 'pasajero-senora' }, { id: 'motoconchista' }],
  'carro-publico': [{ id: 'carro-publico' }],
  'sonata-mamey': [{ id: 'sonata-mamey' }],
  omsa: [{ id: 'omsa' }],
  guagua: [{ id: 'guagua' }],
  platanera: [{ id: 'platanera' }, { id: 'platano', x: -40 }],
  policia: [{ id: 'policia' }],
  transito: [{ id: 'digesett-pickup' }, { id: 'moto-digesett', x: 430 }, { id: 'agente-motorizado', x: 430 }, { id: 'agente-pare', x: 620 }, { id: 'cono', x: 720 }],
  'sedan-plata': [{ id: 'sedan-plata' }],
  'sedan-vino': [{ id: 'sedan-vino' }],
  'sedan-blanco': [{ id: 'sedan-blanco' }],
  'yipeta-negra': [{ id: 'yipeta-negra' }],
  'yipeta-blanca': [{ id: 'yipeta-blanca' }],
  'moto-delivery': [{ id: 'moto-delivery' }, { id: 'repartidor' }],
  'camion-agua': [{ id: 'camion-agua' }],
  'camion-basura': [{ id: 'camion-basura' }],
  'camion-mudanza': [{ id: 'camion-mudanza' }],
  cocos: [{ id: 'cocos' }],
};
for (const [file, parts] of Object.entries(COMPOSITES)) for (const p of parts) if (!all.has(p.id)) throw new Error(`${file}: unknown sprite ${p.id}`);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');
// tsx (esbuild) wraps named functions in __name(); define it so serialized callbacks run in the page
await page.evaluate('globalThis.__name = (f) => f');
const plain = (s: Sprite) => ({ id: s.id, w: s.w, h: s.h, ground: s.ground, svg: s.svg, wheels: s.wheels });
for (const [file, parts] of Object.entries(COMPOSITES)) {
  const used = new Set(parts.flatMap((p) => [p.id, ...all.get(p.id)!.wheels.map((w) => w.sprite)]));
  const sprites = Object.fromEntries([...used].map((id) => [id, plain(all.get(id)!)]));
  const data: string = await page.evaluate(
    async ({ parts, sprites }) => {
      const load = (svg: string) =>
        new Promise<HTMLImageElement>((res, rej) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = rej;
          i.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        });
      const minX = Math.min(...parts.map((p) => p.x ?? 0));
      const maxX = Math.max(...parts.map((p) => (p.x ?? 0) + sprites[p.id].w));
      const height = Math.max(...parts.map((p) => sprites[p.id].ground));
      const width = maxX - minX;
      const scale = Math.min(1.5, 720 / width);
      const pad = 6;
      const c = document.getElementById('c') as HTMLCanvasElement;
      c.width = Math.ceil(width * scale + pad * 2);
      c.height = Math.ceil(height * scale + pad * 2);
      const g = c.getContext('2d')!;
      g.clearRect(0, 0, c.width, c.height);
      const ground = pad + height * scale;
      for (const p of parts) {
        const s = sprites[p.id];
        const x = pad + ((p.x ?? 0) - minX) * scale;
        const top = ground - s.ground * scale;
        g.drawImage(await load(s.svg), x, top, s.w * scale, s.h * scale);
        for (const w of s.wheels) {
          const ws = sprites[w.sprite];
          g.drawImage(await load(ws.svg), x + (w.x - ws.w / 2) * scale, top + (w.y - ws.h / 2) * scale, ws.w * scale, ws.h * scale);
        }
      }
      return c.toDataURL('image/webp', 0.9);
    },
    { parts, sprites },
  );
  writeFileSync(join(vehiclesDir, `${file}.webp`), Buffer.from(data.split(',')[1], 'base64'));
}
await browser.close();

// ── 3. documentation: dimensions and collision bounds ──
const rows = (ids: string[]) =>
  ids
    .map((id) => {
      const s = all.get(id)!;
      return `| \`${s.id}\` | ${s.name} | ${s.w} × ${s.h} px | ${metres(s.w)} × ${metres(s.h)} m | x ${s.hitbox.x}–${s.hitbox.x + s.hitbox.w} (${metres(s.hitbox.w)} m), y ${s.hitbox.y}–${s.hitbox.y + s.hitbox.h} | ${s.wheels.length ? s.wheels.map((w) => `${w.sprite.replace('wheel-', '')} @${w.x}`).join(', ') : '—'} |`;
    })
    .join('\n');
const traffic = Object.entries(KINDS).map(([k, d]) => `| \`${k}\` | ${d.label} | ${(d.variants ?? [d.sprite]).map((v) => `\`${v}\``).join(', ')}${d.overlays ? ` + ${d.overlays.map((o) => `\`${o}\``).join(', ')}` : ''} | ${d.speed[0]}–${d.speed[1]} m/s | ${[d.laneChange ? `cambia de carril (${d.laneChange}/s)` : '', d.stops ? `paradas (${d.stops}/s, ${d.stopTime?.[0]}–${d.stopTime?.[1]} s${d.stopSay ? `, «${d.stopSay}»` : ''})` : '', d.drops ? 'suelta plátanos' : ''].filter(Boolean).join(' · ') || 'sigue su carril'} |`);
const doc = `# El Tapón — sprites and dimensions

Generated by \`npx tsx packages/tapon/scripts/export-assets.ts\` — do not edit by hand.

All art is original, drawn in code (\`packages/tapon/src/art/\`), side view, light from the upper left, dark outlines,
**${PX_PER_M} px = 1 m** at scale 1 (near lane; the middle and far lanes draw at 0.92 and 0.84). Ground contact is the
bottom edge of every sprite. Wheels are separate sprites so they can turn; the rider of a motorcycle is a separate
overlay. Collision uses the horizontal extent of the hitbox in the lane (x range below).

Files: \`apps/web/public/games/el-tapon/sprites/<id>.svg\` (+ \`sprites.json\` with every number) and transparent WebP
composites for the catalog page in \`apps/web/public/games/el-tapon/vehicles/\`.

## Signature vehicles (priority order of the design brief)

| id | Name | Size | Size (m) | Hitbox (px) | Wheels |
| --- | --- | --- | --- | --- | --- |
${rows(['moto-jugador', 'motoconchista', 'pasajero-senora', 'pasajero-estudiante', 'pasajero-don', 'carro-publico', 'sonata-mamey', 'omsa', 'guagua', 'platanera', 'policia', 'digesett-pickup', 'moto-digesett', 'agente-motorizado', 'agente-pare', 'agente-siga'])}

## Everyday traffic

| id | Name | Size | Size (m) | Hitbox (px) | Wheels |
| --- | --- | --- | --- | --- | --- |
${rows(['sedan-plata', 'sedan-vino', 'sedan-blanco', 'yipeta-negra', 'yipeta-blanca', 'moto-delivery', 'repartidor', 'camion-agua', 'camion-basura', 'camion-mudanza', 'cocos'])}

## Obstacles and pickups

| id | Name | Size | Size (m) | Hitbox (px) | Wheels |
| --- | --- | --- | --- | --- | --- |
${rows([...new Set(Object.values(OBSTACLES).map((o) => o.sprite)), 'cliente-0', 'cliente-1', 'cliente-2'].filter((id) => all.has(id)))}

## Traffic behaviour (sim/kinds.ts)

| kind | Name | Sprites | Speed | Behaviour |
| --- | --- | --- | --- | --- |
${traffic.join('\n')}
`;
writeFileSync(join(root, 'docs/EL_TAPON_ASSETS.md'), doc);
console.log(`exported ${all.size} sprites, ${Object.keys(COMPOSITES).length} composites and docs/EL_TAPON_ASSETS.md`);
