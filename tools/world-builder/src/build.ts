/**
 * World builder: OpenStreetMap slice → chunked GLB city + road graph + props.
 *
 *   npm run world:build
 *
 * Input : data/osm/sd_osm_slice.json.gz   (OSM API v0.6 export, ODbL © OpenStreetMap contributors)
 * Output: apps/server/game-data/world/     (served only to entitled players)
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { FACADE, GeoProjection, type LandmarkInfo, type RoadGraphData, WORLD_ORIGIN, type WorldManifest } from '@sd/shared';
import { type Bldg, collectOsmBuildings, emitBuilding, generateInfill, shopKind, shopName } from './buildings.ts';
import {
  type MultiPoly,
  type Poly,
  type Pt,
  SpatialHash,
  bboxOf,
  centroid,
  difference,
  disk,
  dist,
  distToSegment,
  hash01,
  intersection,
  multiArea,
  orientCW,
  pointInPoly,
  pointInRing,
  rect,
  rng,
  segmentQuads,
  simplify,
  union,
} from './geom.ts';
import { AreaIndex, PropSink, RoadIndex } from './index-helpers.ts';
import { MeshBuilder, type V3, writeGlb } from './mesh.ts';
import { areaPolys, buildSea, loadOsm, riverFallback, wayPts } from './osm.ts';
import { emitObelisk, emitStatue, placeAreaProps, placeShopFurniture, placeStreetProps, subPolyline } from './props.ts';
import { buildGraph } from './roads.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const OSM_FILE = resolve(ROOT, 'data/osm/sd_osm_slice.json.gz');
const OUT = resolve(ROOT, 'apps/server/game-data/world');
const CHUNK = 250;
const SEA_LEVEL = -2.0;
const SIDEWALK_H = 0.15;

const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// Approximate historic-centre outline (Ciudad Colonial), lon/lat. Used only for styling rules.
const COLONIAL_LL: [number, number][] = [
  [-69.8916, 18.4748],
  [-69.8878, 18.4772],
  [-69.8842, 18.4792],
  [-69.8812, 18.4792],
  [-69.8802, 18.4745],
  [-69.8808, 18.4700],
  [-69.8832, 18.4668],
  [-69.8890, 18.4670],
  [-69.8912, 18.4688],
  [-69.8921, 18.4712],
];

const LANDMARK_TEXT: Record<string, { name: string; description: string; radius: number }> = {
  catedral: { name: 'Catedral Primada de América', radius: 45, description: 'Basílica Catedral Santa María de la Encarnación, primera catedral de América (siglo XVI), en el corazón de la Ciudad Colonial, Patrimonio de la Humanidad por la UNESCO.' },
  fortaleza: { name: 'Fortaleza Ozama', radius: 60, description: 'Construida a inicios del siglo XVI a orillas del río Ozama; considerada la fortificación militar de origen europeo más antigua de América. Destaca la Torre del Homenaje.' },
  alcazar: { name: 'Alcázar de Colón', radius: 45, description: 'Palacio virreinal levantado a inicios del siglo XVI como residencia de Diego Colón y María de Toledo, frente a la Plaza de España.' },
  puerta_conde: { name: 'Puerta del Conde', radius: 35, description: 'Puerta de la antigua muralla. Aquí se proclamó la Independencia Nacional el 27 de febrero de 1844.' },
  altar_patria: { name: 'Altar de la Patria', radius: 40, description: 'Mausoleo de mármol en el Parque Independencia donde reposan los Padres de la Patria: Duarte, Sánchez y Mella.' },
  obelisco_macho: { name: 'Obelisco del Malecón', radius: 40, description: 'Obelisco de unos 40 metros sobre la avenida George Washington, inaugurado en 1937. Hoy luce murales en homenaje a las hermanas Mirabal.' },
  obelisco_hembra: { name: 'Obelisco Hembra', radius: 30, description: 'Monumento a la Independencia Financiera en el Malecón; conmemora el Tratado Trujillo-Hull de 1940 y el pago de la deuda externa.' },
  panteon: { name: 'Panteón Nacional', radius: 35, description: 'Antigua iglesia de los jesuitas del siglo XVIII; hoy guarda los restos de figuras ilustres de la historia dominicana.' },
  san_francisco: { name: 'Ruinas de San Francisco', radius: 45, description: 'Restos del primer monasterio franciscano del Nuevo Mundo, del siglo XVI.' },
  san_nicolas: { name: 'Hospital San Nicolás de Bari', radius: 35, description: 'Ruinas del primer hospital de América, fundado a inicios del siglo XVI por Nicolás de Ovando.' },
  casas_reales: { name: 'Museo de las Casas Reales', radius: 35, description: 'Sede de la Real Audiencia en tiempos coloniales, hoy museo sobre la vida colonial.' },
  parque_colon: { name: 'Parque Colón', radius: 40, description: 'Plaza frente a la Catedral con la estatua de Cristóbal Colón; punto de encuentro de la Ciudad Colonial.' },
  palacio_nacional: { name: 'Palacio Nacional', radius: 70, description: 'Sede del Poder Ejecutivo, construido en la década de 1940 con mármol dominicano. Famoso por su cúpula.' },
  plaza_juan_baron: { name: 'Plaza Juan Barón', radius: 50, description: 'Plaza recreativa del Malecón, junto al Obelisco, frente al mar Caribe.' },
  calle_el_conde: { name: 'Calle El Conde', radius: 30, description: 'Calle peatonal y comercial que une la Puerta del Conde con el Parque Colón.' },
  barrio_chino: { name: 'Barrio Chino', radius: 40, description: 'Barrio chino de Santo Domingo sobre la avenida Duarte, con sus arcos de entrada.' },
};

async function main() {
  const proj = new GeoProjection(WORLD_ORIGIN);
  const osm = loadOsm(OSM_FILE, proj);
  const [W, S, E, N] = osm.meta.bbox;
  const nw = proj.toWorld(N, W);
  const se = proj.toWorld(S, E);
  const world = { minX: Math.ceil(nw.x), minZ: Math.ceil(nw.z), maxX: Math.floor(se.x), maxZ: Math.floor(se.z) };
  const play = { minX: world.minX + 70, minZ: world.minZ + 70, maxX: world.maxX - 70, maxZ: world.maxZ - 70 };
  log('OSM loaded', osm.nodes.size, 'nodes', osm.ways.length, 'ways; world', world);
  const inWorld = (p: Pt) => p[0] >= world.minX && p[0] <= world.maxX && p[1] >= world.minZ && p[1] <= world.maxZ;
  const inPlay = (p: Pt) => p[0] >= play.minX && p[0] <= play.maxX && p[1] >= play.minZ && p[1] <= play.maxZ;
  const colonialRing = COLONIAL_LL.map(([lon, lat]) => {
    const w = proj.toWorld(lat, lon);
    return [w.x, w.z] as Pt;
  });
  const isColonial = (p: Pt) => pointInRing(p, colonialRing);

  // ── Water: sea from coastline, river polygon + centreline fallback north of mapped polygon ──
  const sea = buildSea(osm, world);
  const riverPolys: MultiPoly = [];
  for (const w of osm.ways) if (w.tags.natural === 'water' && w.tags.water === 'river') riverPolys.push(...areaPolys(osm, w));
  const river = union(riverPolys, riverFallback(osm, 18.4785, 75));
  const fountains: MultiPoly = [];
  for (const w of osm.ways) if (w.tags.natural === 'water' && !w.tags.water) fountains.push(...areaPolys(osm, w));
  const water = intersection(union(sea, river), [[rect(world.minX, world.minZ, world.maxX, world.maxZ)]]);
  const waterIdx = new AreaIndex();
  waterIdx.add(water, 'water');
  const seaIdx = new AreaIndex();
  seaIdx.add(sea, 'sea');
  const land = (p: Pt) => inWorld(p) && !waterIdx.has(p);
  const nearSea = (p: Pt) => [0, 1, 2, 3, 4, 5, 6, 7].some((k) => seaIdx.has([p[0] + Math.cos(k * 0.785) * 28, p[1] + Math.sin(k * 0.785) * 28]));
  log('water area m²', Math.round(multiArea(water)), 'sea', Math.round(multiArea(sea)));

  // ── Roads ──
  const g = buildGraph(osm, isColonial, (p) => p[0] >= world.minX - 40 && p[0] <= world.maxX + 40 && p[1] >= world.minZ - 40 && p[1] <= world.maxZ + 40);
  const pr = rng(4401);
  for (const e of g.edges) {
    const oneway = e.lanesB === 0;
    const okCls = ['residential', 'tertiary', 'secondary', 'living'].includes(e.cls);
    const colonial = isColonial(e.ptsXZ[Math.floor(e.ptsXZ.length / 2)]);
    (e as { parking?: number }).parking = okCls && ((oneway && e.width >= 5.4) || (oneway && colonial && e.width >= 4.6 && pr() < 0.55) || (!oneway && e.width >= 8.6)) ? 1 : 0;
  }
  const roads = new RoadIndex();
  for (const e of g.edges)
    for (let i = 1; i < e.ptsXZ.length; i++)
      roads.add({ a: e.ptsXZ[i - 1], b: e.ptsXZ[i], hw: e.width / 2, sw: e.sidewalk, cls: e.cls, edgeId: e.id, drivable: e.drivable });
  log('graph', g.nodes.length, 'nodes', g.edges.length, 'edges', g.nodes.filter((n) => n.signal).length, 'signals');

  // ── Areas ──
  const parks: MultiPoly = [];
  const plazas: MultiPoly = [];
  const beaches: MultiPoly = [];
  const piers: MultiPoly = [];
  const noBuildMp: MultiPoly = [];
  const addArea = (el: Parameters<typeof areaPolys>[1], tags: Record<string, string>) => {
    const mp = areaPolys(osm, el);
    if (!mp.length) return;
    const c = centroid(mp[0][0]);
    if (tags.leisure && /park|garden|playground|common|pitch|sports_centre/.test(tags.leisure) && !tags.building) {
      (isColonial(c) && tags.leisure !== 'pitch' ? plazas : parks).push(...mp);
      noBuildMp.push(...mp);
    } else if (tags.landuse && /grass|meadow|forest|flowerbed|village_green|cemetery/.test(tags.landuse)) {
      parks.push(...mp);
      noBuildMp.push(...mp);
    } else if (tags.place === 'square' || (tags.highway === 'pedestrian' && tags.area === 'yes') || tags.amenity === 'marketplace' || tags.historic === 'castle' && !tags.building) {
      plazas.push(...mp);
      noBuildMp.push(...mp);
    } else if (tags.natural === 'beach' || tags.natural === 'sand') {
      beaches.push(...mp);
      noBuildMp.push(...mp);
    } else if (tags.man_made && /pier|quay|breakwater/.test(tags.man_made)) {
      piers.push(...mp);
      noBuildMp.push(...mp);
    } else if (tags.landuse === 'military' || tags.historic === 'ruins' || tags.leisure === 'marina' || tags.tourism === 'attraction' && !tags.building) {
      noBuildMp.push(...mp);
    }
  };
  for (const w of osm.ways) if (w.nodes[0] === w.nodes[w.nodes.length - 1]) addArea(w, w.tags);
  for (const rel of osm.relations) if (rel.tags.type === 'multipolygon') addArea(rel, rel.tags);
  noBuildMp.push(...fountains);
  const noBuild = new AreaIndex();
  noBuild.add(noBuildMp, 'nobuild');
  const distClass = (p: Pt, classes: string[], r: number) => {
    const n = roads.nearest(p, r, (s) => classes.includes(s.cls));
    return n ? n.d : Infinity;
  };

  // ── Buildings ──
  const ctx = { osm, roads, noBuild, land, isColonial, distClass };
  const osmB = collectOsmBuildings(ctx, inWorld);
  log('OSM buildings', osmB.list.length, 'dropped (in road corridor)', osmB.dropped, 'clipped', osmB.clipped);
  const infill = generateInfill(ctx, osmB.list, g.edges, (id) => g.nodes[id].radius, inPlay);
  log('infill buildings', infill.length);
  const buildings: Bldg[] = [...osmB.list, ...infill];
  const bIndex = new SpatialHash<Bldg>(50);
  for (const b of buildings) bIndex.insertBBox(b.bbox, b);
  const buildingAt = (p: Pt) => {
    for (const b of bIndex.query([p[0], p[1], p[0], p[1]])) if (pointInPoly(p, b.poly)) return true;
    return false;
  };

  // ── Props ──
  const sink = new PropSink(CHUNK);
  const propCtx = { nodes: g.nodes, edges: g.edges, roads, land, isColonial, buildingAt, noBuild, inPlay, nearSea };
  placeStreetProps(propCtx, sink);
  placeAreaProps(osm, parks, plazas, propCtx, sink);

  // Shops at OSM POIs → nearest street-facing building wall.
  let shops = 0;
  for (const n of osm.nodes.values()) {
    if (!n.tags) continue;
    const kind = shopKind(n.tags);
    if (!kind) continue;
    const p: Pt = [n.x, n.z];
    if (!inPlay(p)) continue;
    const near = nearestWall(bIndex, p, 22);
    if (!near) continue;
    const name = shopName(kind, n.id);
    sink.shop(near.p[0] + near.n[0] * 0.08, 3.25, near.p[1] + near.n[1] * 0.08, Math.atan2(near.n[0], near.n[1]), kind, name);
    placeShopFurniture(kind, near.p, near.n[0], near.n[1], sink, n.id);
    near.b.flags |= 2; // SHOP
    shops++;
  }
  // Extra colmados on residential corners (very common in Santo Domingo).
  const cr = rng(2024);
  for (const b of infill) {
    if (!(b.flags & 2) || b.colonial || cr() > 0.55) continue;
    const c = centroid(b.poly[0]);
    const near = nearestWall(bIndex, c, 18);
    if (!near || near.b !== b) continue;
    const kind = cr() < 0.7 ? 'colmado' : cr() < 0.5 ? 'banca' : 'picapollo';
    sink.shop(near.p[0] + near.n[0] * 0.08, 3.05, near.p[1] + near.n[1] * 0.08, Math.atan2(near.n[0], near.n[1]), kind, shopName(kind, Math.floor(hash01(shops) * 1e6)));
    placeShopFurniture(kind, near.p, near.n[0], near.n[1], sink, shops * 7 + 3);
    shops++;
  }
  log('shops', shops);

  // ── Landmark nodes ──
  const landmarks: LandmarkInfo[] = [];
  const addLandmark = (id: string, x: number, z: number) => {
    const t = LANDMARK_TEXT[id];
    if (t && !landmarks.some((l) => l.id === id)) landmarks.push({ id, name: t.name, x: Math.round(x), z: Math.round(z), radius: t.radius, description: t.description });
  };
  for (const b of buildings) if (b.landmark) {
    const c = centroid(b.poly[0]);
    addLandmark(b.landmark, c[0], c[1]);
  }
  const nodeAt = (id: number) => osm.nodes.get(id);
  const obM = nodeAt(596664529);
  const obH = nodeAt(1766964888);
  const colon = nodeAt(3224914259);
  if (obM) addLandmark('obelisco_macho', obM.x, obM.z);
  if (obH) addLandmark('obelisco_hembra', obH.x, obH.z);
  if (colon) addLandmark('parque_colon', colon.x, colon.z);
  const gateConde = osm.wayById.get(303898466);
  if (gateConde) {
    const c = centroid(wayPts(osm, gateConde));
    addLandmark('puerta_conde', c[0], c[1]);
  }
  for (const w of osm.ways) {
    if (w.tags.name === 'Plaza Juan Barón') {
      const c = centroid(wayPts(osm, w));
      addLandmark('plaza_juan_baron', c[0], c[1]);
    }
    if (w.tags.name === 'Barrio Chino' && w.tags.place) {
      const c = centroid(wayPts(osm, w));
      addLandmark('barrio_chino', c[0], c[1]);
    }
  }
  const conde = g.edges.filter((e) => e.name === 'Calle El Conde' && e.cls === 'pedestrian');
  if (conde.length) {
    const e = conde[Math.floor(conde.length / 2)];
    const p = e.ptsXZ[Math.floor(e.ptsXZ.length / 2)];
    addLandmark('calle_el_conde', p[0], p[1]);
  }
  log('landmarks', landmarks.map((l) => l.id).join(', '));

  // ── Chunk meshes ──
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(resolve(OUT, 'chunks'), { recursive: true });
  const chunks: WorldManifest['chunks'] = [];
  const bByChunk = new Map<string, Bldg[]>();
  for (const b of buildings) {
    const c = centroid(b.poly[0]);
    const k = `${Math.floor(c[0] / CHUNK)}_${Math.floor(c[1] / CHUNK)}`;
    (bByChunk.get(k) ?? bByChunk.set(k, []).get(k)!).push(b);
  }
  const cityWalls = osm.ways.filter((w) => w.tags.barrier === 'city_wall' || w.tags.historic === 'citywalls');
  const gates = [303898466, 318767365, 323836371].map((id) => osm.wayById.get(id)).filter(Boolean);
  const chinaGates = [371237020, 371237023].map((id) => osm.wayById.get(id)).filter(Boolean);
  const memorials = [...osm.nodes.values()].filter((n) => n.tags && (n.tags.historic === 'memorial' || n.tags.historic === 'monument') && n.tags.name && n.id !== 3224914259 && (n.tags.memorial === 'statue' || n.tags.memorial === 'bust' || n.tags.historic === 'monument' || n.tags.artwork_type === 'bust'));
  let totalTris = 0;
  let validationCorridorHits = 0;

  // ── Spawn: Gazcue sidewalk near a residential street (Mission 001 start) ──
  const spawnLL = proj.toWorld(18.4699, -69.8978);
  let spawn = { x: spawnLL.x, z: spawnLL.z, heading: 90 };
  {
    const n = roads.nearest([spawnLL.x, spawnLL.z], 200, (s) => s.cls === 'residential' && s.sw > 0.8);
    if (n) {
      const s = n.seg;
      const dx = s.b[0] - s.a[0];
      const dz = s.b[1] - s.a[1];
      const l = Math.hypot(dx, dz) || 1;
      const m: Pt = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
      const off = s.hw + s.sw * 0.5;
      spawn = { x: Math.round((m[0] - (dz / l) * off) * 100) / 100, z: Math.round((m[1] + (dx / l) * off) * 100) / 100, heading: Math.round(((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360) };
    }
  }

  // Mission 001 starts at Don Ramón's colmado: the shop closest to the spawn becomes it
  // (fictional business; the dialogue and HUD refer to it).
  {
    let best: { list: { x: number; z: number; rot: number; kind: string; name: string }[]; i: number; d: number } | null = null;
    for (const c of sink.chunks.values())
      c.shops.forEach((s, i) => {
        const d = Math.hypot(s.x - spawn.x, s.z - spawn.z);
        if (d < 45 && (!best || d < best.d)) best = { list: c.shops, i, d };
      });
    const b = best as { list: { x: number; z: number; rot: number; kind: string; name: string }[]; i: number; d: number } | null;
    if (b) {
      const s = b.list[b.i];
      s.kind = 'colmado';
      s.name = 'Colmado Don Ramón';
      const nx = Math.sin(s.rot);
      const nz = Math.cos(s.rot);
      placeShopFurniture('colmado', [s.x - nx * 0.08, s.z - nz * 0.08], nx, nz, sink, 777);
      log('mission colmado at', Math.round(s.x), Math.round(s.z), 'dist', Math.round(b.d));
    } else log('WARNING: no shop near spawn for Colmado Don Ramón');
  }

  // Keep the player's starting spot clear (no bins/benches/poles right where the camera starts).
  {
    let removed = 0;
    for (const c of sink.chunks.values())
      for (const [type, arr] of Object.entries(c.props)) {
        if (!arr || !['trash', 'bench', 'cart', 'bollard', 'rock', 'planter', 'rebar'].includes(type)) continue;
        const keep: number[] = [];
        for (let i = 0; i < arr.length; i += 5) {
          if (Math.hypot(arr[i] - spawn.x, arr[i + 2] - spawn.z) < 5.5) removed++;
          else keep.push(arr[i], arr[i + 1], arr[i + 2], arr[i + 3], arr[i + 4]);
        }
        (c.props as Record<string, number[]>)[type] = keep;
      }
    log('props cleared around spawn', removed);
  }

  const ix0 = Math.floor(world.minX / CHUNK);
  const ix1 = Math.floor((world.maxX - 0.01) / CHUNK);
  const iz0 = Math.floor(world.minZ / CHUNK);
  const iz1 = Math.floor((world.maxZ - 0.01) / CHUNK);
  for (let ix = ix0; ix <= ix1; ix++)
    for (let iz = iz0; iz <= iz1; iz++) {
      const x0 = Math.max(world.minX, ix * CHUNK);
      const z0 = Math.max(world.minZ, iz * CHUNK);
      const x1 = Math.min(world.maxX, (ix + 1) * CHUNK);
      const z1 = Math.min(world.maxZ, (iz + 1) * CHUNK);
      const R: MultiPoly = [[rect(x0, z0, x1, z1)]];
      const landR = difference(R, water);
      if (multiArea(landR) < 1) continue;
      const key = `${ix}_${iz}`;
      const M = {
        ground: new MeshBuilder('ground', { color: true }),
        grass: new MeshBuilder('grass'),
        plaza: new MeshBuilder('plaza'),
        sand: new MeshBuilder('sand'),
        asphalt: new MeshBuilder('asphalt'),
        pavers: new MeshBuilder('pavers'),
        concrete: new MeshBuilder('concrete'),
        sidewalk: new MeshBuilder('sidewalk'),
        markings: new MeshBuilder('markings', { color: true }),
        walls: new MeshBuilder('walls', { color: true, extras: { facade: 4, bdim: 2 } }),
        roofs: new MeshBuilder('roofs', { color: true }),
        stone: new MeshBuilder('stone', { color: true }),
        mural: new MeshBuilder('mural'),
        bronze: new MeshBuilder('bronze', { color: true }),
        detail: new MeshBuilder('detail', { color: true }),
        coast: new MeshBuilder('coast'),
      };
      const col = new MeshBuilder('collision', { uv: false });

      // Road surfaces via boolean union (no overlaps → no z-fighting).
      const pieces = { asphalt: [] as MultiPoly, pavers: [] as MultiPoly, path: [] as MultiPoly, side: [] as MultiPoly };
      const seen = new Set<number>();
      for (const s of roads.near([(x0 + x1) / 2, (z0 + z1) / 2], CHUNK * 0.75 + 30)) {
        const e = g.edges[s.edgeId];
        const target = e.cls === 'footway' || e.cls === 'steps' ? pieces.path : e.surface === 'pavers' || e.cls === 'pedestrian' ? pieces.pavers : pieces.asphalt;
        for (const q of segmentQuads([s.a, s.b], s.hw)) target.push([q]);
        target.push([disk(s.a, s.hw, 12)], [disk(s.b, s.hw, 12)]);
        if (s.sw > 0) {
          for (const q of segmentQuads([s.a, s.b], s.hw + s.sw)) pieces.side.push([q]);
          pieces.side.push([disk(s.a, s.hw + s.sw, 12)], [disk(s.b, s.hw + s.sw, 12)]);
        }
        for (const nid of [e.a, e.b]) {
          if (seen.has(nid)) continue;
          seen.add(nid);
          const n = g.nodes[nid];
          if (n.radius <= 0) continue;
          const inc = n.edges.map((id) => g.edges[id]).filter((x) => x.drivable);
          if (!inc.length) continue;
          const mh = Math.max(...inc.map((x) => x.width / 2));
          const ms = Math.max(...inc.map((x) => x.sidewalk));
          const asph = inc.some((x) => x.surface !== 'pavers');
          (asph ? pieces.asphalt : pieces.pavers).push([disk([n.x, n.z], mh + 0.9, 20)]);
          if (ms > 0) pieces.side.push([disk([n.x, n.z], mh + ms + 0.9, 20)]);
        }
      }
      const A = intersection(union(pieces.asphalt), landR);
      const P = difference(intersection(union(pieces.pavers), landR), A);
      const Sw = difference(intersection(union(pieces.side), landR), A, P);
      const F = difference(intersection(union(pieces.path), landR), A, P, Sw);
      const roadsAll = union(A, P, Sw, F);
      const parkR = difference(intersection(parks, landR), roadsAll);
      const plazaR = difference(intersection(plazas, landR), roadsAll, parkR);
      const sandR = difference(intersection(beaches, landR), roadsAll, parkR, plazaR);
      const pierR = difference(intersection(piers, landR), roadsAll, parkR, plazaR, sandR);
      const groundR = difference(landR, roadsAll, parkR, plazaR, sandR, pierR);
      for (const poly of A) M.asphalt.flat(poly, 0, undefined, 1);
      for (const poly of P) M.pavers.flat(poly, 0, undefined, 1);
      for (const poly of F) M.concrete.flat(poly, 0.01, undefined, 1);
      for (const poly of parkR) M.grass.flat(poly, 0, undefined, 1);
      for (const poly of plazaR) M.plaza.flat(poly, 0, undefined, 1);
      for (const poly of pierR) M.concrete.flat(poly, 0.05, undefined, 1);
      for (const poly of sandR) M.sand.flat(poly, -0.05, undefined, 1);
      const gr = rng(ix * 1000 + iz);
      for (const poly of groundR) {
        const c = centroid(poly[0]);
        // the historic centre is paved wall-to-wall: no dirt lots
        if (isColonial(c)) M.plaza.flat(poly, 0, undefined, 1);
        else if (nearSea(c)) M.concrete.flat(poly, 0.0, undefined, 1); // Malecón promenade
        else {
          const tone = 0.78 + gr() * 0.12;
          M.ground.flat(poly, 0, [tone, tone * 0.97, tone * 0.92], 1);
        }
      }
      // land collision (flat), sidewalks raised with curbs
      for (const poly of landR) col.flat(poly, 0);
      for (const poly of Sw) {
        M.sidewalk.flat(poly, SIDEWALK_H, undefined, 1);
        col.flat(poly, SIDEWALK_H);
        extrudeRings(poly, 0, SIDEWALK_H, M.sidewalk, col, false, [x0, z0, x1, z1]);
      }

      // Lane markings, stop lines and zebra crossings (decals).
      emitMarkings(g, x0, z0, x1, z1, M.markings);

      // Buildings whose centroid is in this chunk.
      for (const b of bByChunk.get(key) ?? []) {
        emitBuilding(b, M.walls, M.roofs, M.stone, col, sink, roads);
        for (const v of b.poly[0]) if (roads.inCorridor(v, -0.6)) validationCorridorHits++;
      }

      // City walls & forts.
      for (const w of cityWalls) {
        const pts = wayPts(osm, w);
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const b = pts[i];
          const mx = (a[0] + b[0]) / 2;
          const mz = (a[1] + b[1]) / 2;
          if (mx < x0 || mx >= x1 || mz < z0 || mz >= z1) continue;
          const L = dist(a, b);
          if (L < 0.3) continue;
          const rot = Math.atan2(b[1] - a[1], b[0] - a[0]);
          const h = 6.2;
          M.stone.box(mx, h / 2, mz, L / 2 + 0.6, h / 2, 1.3, rot, [0.78, 0.71, 0.6], 1);
          col.box(mx, h / 2, mz, L / 2 + 0.6, h / 2, 1.3, rot);
          const cnt = Math.floor(L / 1.8);
          for (let k = 0; k < cnt; k++) {
            const t = (k + 0.5) / cnt;
            M.stone.box(a[0] + (b[0] - a[0]) * t, h + 0.5, a[1] + (b[1] - a[1]) * t, 0.45, 0.5, 1.1, rot, [0.76, 0.69, 0.58], 1);
          }
        }
      }
      for (const w of gates) {
        const pts = wayPts(osm, w!);
        const c = centroid(pts);
        if (c[0] < x0 || c[0] >= x1 || c[1] < z0 || c[1] >= z1) continue;
        emitGate(pts, M.stone, col, w!.id === 303898466);
      }
      for (const w of chinaGates) {
        const pts = wayPts(osm, w!);
        const c = centroid(pts);
        if (c[0] < x0 || c[0] >= x1 || c[1] < z0 || c[1] >= z1) continue;
        emitChinaGate(pts, M.detail, col);
      }
      const inChunk = (x: number, z: number) => x >= x0 && x < x1 && z >= z0 && z < z1;
      if (obM && inChunk(obM.x, obM.z)) {
        emitObelisk(M.stone, M.mural, obM.x, obM.z, 40, 2.1, 0.62);
        col.box(obM.x, 10, obM.z, 3.2, 10, 3.2, 0.62);
      }
      if (obH && inChunk(obH.x, obH.z)) {
        const rot = 0.62;
        for (const s of [-1, 1]) {
          const ox = Math.cos(rot) * 1.7 * s;
          const oz = Math.sin(rot) * 1.7 * s;
          emitObelisk(M.stone, M.mural, obH.x + ox, obH.z + oz, 21, 0.85, rot);
        }
        M.stone.box(obH.x, 17.5, obH.z, 2.6, 0.35, 0.9, rot, [0.92, 0.9, 0.86]);
        col.box(obH.x, 5, obH.z, 3.4, 5, 1.6, rot);
      }
      if (colon && inChunk(colon.x, colon.z)) {
        emitStatue(M.bronze, M.stone, colon.x, colon.z, Math.PI, 1.25);
        col.box(colon.x, 2, colon.z, 2, 2, 2, Math.PI);
      }
      for (const m of memorials) {
        if (!inChunk(m.x, m.z) || !inPlay([m.x, m.z]) || buildingAt([m.x, m.z]) || roads.inCorridor([m.x, m.z], 0)) continue;
        M.stone.box(m.x, 0.8, m.z, 0.55, 0.8, 0.55, hash01(m.id) * 3, [0.85, 0.83, 0.79]);
        M.bronze.box(m.x, 1.85, m.z, 0.25, 0.28, 0.2, hash01(m.id) * 3, [0.24, 0.21, 0.15]);
        col.box(m.x, 0.8, m.z, 0.55, 0.8, 0.55, hash01(m.id) * 3);
      }

      // Coast: retaining walls into the water + Malecón sea wall + rocks.
      emitCoast(water, seaIdx, beaches, [x0, z0, x1, z1], world, M.coast, M.stone, col, sink, inPlay);

      const layers = Object.values(M);
      const tris = layers.reduce((a, m) => a + m.triangleCount, 0);
      totalTris += tris;
      const glb = await writeGlb(layers, col);
      const file = `chunks/c_${key}.glb`;
      writeFileSync(resolve(OUT, file), glb);
      const props = sink.chunks.get(key) ?? { props: {}, shops: [], signals: [], wires: [], lights: [] };
      const propsFile = `chunks/c_${key}.json`;
      writeFileSync(resolve(OUT, propsFile), JSON.stringify(props));
      chunks.push({ id: key, ix, iz, minX: x0, minZ: z0, maxX: x1, maxZ: z1, glb: file, props: propsFile, triangles: tris, buildings: (bByChunk.get(key) ?? []).length });
    }
  log('chunks', chunks.length, 'triangles', totalTris);

  // ── Road graph for AI, routing and the minimap ──
  const graph: RoadGraphData = {
    nodes: g.nodes,
    edges: g.edges.map(({ ptsXZ: _p, ...e }) => ({ ...e, parking: (e as { parking?: number }).parking ?? 0 })),
  };
  writeFileSync(resolve(OUT, 'roads.json'), JSON.stringify(graph));

  // ── Map data (minimap / pause map) ──
  const simp = (mp: MultiPoly, tol: number) => mp.map((poly) => poly.map((ring) => simplify([...ring, ring[0]], tol).map((p) => [Math.round(p[0]), Math.round(p[1])])));
  const mapData = {
    water: simp(water, 2),
    parks: simp(intersection(parks, [[rect(world.minX, world.minZ, world.maxX, world.maxZ)]]), 1.5),
    plazas: simp(plazas, 1.5),
    buildings: buildings.map((b) => b.poly[0].flatMap((p) => [Math.round(p[0] * 2) / 2, Math.round(p[1] * 2) / 2])),
  };
  writeFileSync(resolve(OUT, 'map.json'), JSON.stringify(mapData));

  // ── Validation report ──
  const report = validate(g, world, play);
  const manifest: WorldManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: { name: osm.meta.source, license: osm.meta.license, attribution: osm.meta.attribution, fetched: osm.meta.fetched, bbox: osm.meta.bbox },
    origin: { ...WORLD_ORIGIN },
    bounds: world,
    playBounds: play,
    seaLevel: SEA_LEVEL,
    chunkSize: CHUNK,
    chunks,
    landmarks,
    spawn,
    stats: {
      osmBuildings: osmB.list.length,
      infillBuildings: infill.length,
      buildingsDroppedInCorridor: osmB.dropped,
      buildingsClipped: osmB.clipped,
      roadEdges: g.edges.length,
      roadNodes: g.nodes.length,
      signals: g.nodes.filter((n) => n.signal).length,
      triangles: totalTris,
      shops,
      trees: ['tree_palm', 'tree_royal', 'tree_almond', 'tree_flamboyan', 'tree_ficus'].reduce((a, t) => a + sink.count(t as never), 0),
      poles: sink.count('pole'),
      parkedCars: sink.count('parked_car'),
      buildingVertsInsideCarriageway: validationCorridorHits,
      ...report,
    },
  };
  writeFileSync(resolve(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  const sizes = { roads: gzipSync(JSON.stringify(graph)).length, map: gzipSync(JSON.stringify(mapData)).length };
  log('stats', manifest.stats, 'gz sizes', sizes);
  log('done →', OUT);
}

/** Nearest building wall to a point: returns point on wall, outward normal and building. */
function nearestWall(idx: SpatialHash<Bldg>, p: Pt, r: number): { p: Pt; n: Pt; b: Bldg } | null {
  let best: { p: Pt; n: Pt; b: Bldg; d: number } | null = null;
  for (const b of idx.query([p[0] - r, p[1] - r, p[0] + r, p[1] + r])) {
    const ring = b.poly[0];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const c = ring[(i + 1) % ring.length];
      const d = distToSegment(p, a, c);
      if (d < r && (!best || d < best.d)) {
        const L = dist(a, c) || 1;
        let nx = (c[1] - a[1]) / L;
        let nz = -(c[0] - a[0]) / L;
        const mid: Pt = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
        if (pointInPoly([mid[0] + nx * 0.3, mid[1] + nz * 0.3], b.poly)) {
          nx = -nx;
          nz = -nz;
        }
        if (L < 3) continue;
        best = { p: mid, n: [nx, nz], b, d };
      }
    }
  }
  return best;
}

/** Vertical faces around polygon rings; normals point out of the polygon (or into it when `inward`). */
function extrudeRings(poly: Poly, y0: number, y1: number, m: MeshBuilder, col: MeshBuilder | null, inward: boolean, clip?: number[]) {
  for (const ring of poly) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const c = ring[(i + 1) % ring.length];
      const L = dist(a, c);
      if (L < 0.05) continue;
      if (clip) {
        // skip seams lying on the chunk boundary
        const onX = (v: number) => Math.abs(a[0] - v) < 0.02 && Math.abs(c[0] - v) < 0.02;
        const onZ = (v: number) => Math.abs(a[1] - v) < 0.02 && Math.abs(c[1] - v) < 0.02;
        if (onX(clip[0]) || onX(clip[2]) || onZ(clip[1]) || onZ(clip[3])) continue;
      }
      let nx = (c[1] - a[1]) / L;
      let nz = -(c[0] - a[0]) / L;
      const mid: Pt = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
      const inside = pointInPoly([mid[0] + nx * 0.05, mid[1] + nz * 0.05], poly);
      if (inside !== inward) {
        nx = -nx;
        nz = -nz;
      }
      m.wall(a, c, y0, y1, nx, nz, 0, L, y0, y1);
      if (col) col.wall(a, c, y0, y1, nx, nz, 0, 0, 0, 0);
    }
  }
}

function emitCoast(water: MultiPoly, seaIdx: AreaIndex, beaches: MultiPoly, bb: number[], world: { minX: number; minZ: number; maxX: number; maxZ: number }, coast: MeshBuilder, stone: MeshBuilder, col: MeshBuilder, sink: PropSink, inPlay: (p: Pt) => boolean) {
  const r = rng(Math.floor(bb[0] * 7 + bb[1] * 13));
  const beachIdx = new AreaIndex();
  beachIdx.add(beaches, 'beach');
  for (const poly of water) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const c = ring[(i + 1) % ring.length];
        const mid: Pt = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
        if (mid[0] < bb[0] || mid[0] >= bb[2] || mid[1] < bb[1] || mid[1] >= bb[3]) continue;
        const onEdge = (v: number, k: 0 | 1) => Math.abs(a[k] - v) < 0.05 && Math.abs(c[k] - v) < 0.05;
        if (onEdge(world.minX, 0) || onEdge(world.maxX, 0) || onEdge(world.minZ, 1) || onEdge(world.maxZ, 1)) continue;
        const L = dist(a, c);
        if (L < 0.05) continue;
        let nx = (c[1] - a[1]) / L;
        let nz = -(c[0] - a[0]) / L;
        // normal must point into the water
        if (!pointInPoly([mid[0] + nx * 0.2, mid[1] + nz * 0.2], poly)) {
          nx = -nx;
          nz = -nz;
        }
        const beach = beachIdx.has([mid[0] - nx * 3, mid[1] - nz * 3]);
        coast.wall(a, c, SEA_LEVEL - 3, beach ? -0.05 : 0.02, nx, nz, 0, L / 3, (SEA_LEVEL - 3) / 3, 0.0);
        const isSea = seaIdx.has([mid[0] + nx * 2, mid[1] + nz * 2]);
        if (isSea && !beach && inPlay(mid)) {
          // Malecón sea wall (parapet) set back from the edge
          const ia: Pt = [a[0] - nx * 0.5, a[1] - nz * 0.5];
          const ic: Pt = [c[0] - nx * 0.5, c[1] - nz * 0.5];
          const rot = Math.atan2(ic[1] - ia[1], ic[0] - ia[0]);
          stone.box((ia[0] + ic[0]) / 2, 0.45, (ia[1] + ic[1]) / 2, L / 2 + 0.05, 0.45, 0.22, rot, [0.86, 0.85, 0.82], 1);
          col.box((ia[0] + ic[0]) / 2, 0.6, (ia[1] + ic[1]) / 2, L / 2 + 0.05, 0.6, 0.25, rot);
          for (let s = 0; s < L; s += 3 + r() * 3)
            sink.add('rock', a[0] + ((c[0] - a[0]) * s) / L + nx * (0.8 + r() * 2.5), SEA_LEVEL - 0.6 + r() * 0.8, a[1] + ((c[1] - a[1]) * s) / L + nz * (0.8 + r() * 2.5), r() * 6.28, Math.floor(r() * 4));
        }
      }
    }
  }
}

function emitMarkings(g: ReturnType<typeof buildGraph>, x0: number, z0: number, x1: number, z1: number, m: MeshBuilder) {
  const WHITE: V3 = [0.82, 0.82, 0.78];
  const YELLOW: V3 = [0.85, 0.55, 0.05];
  const Y = 0.012;
  const inC = (p: Pt) => p[0] >= x0 && p[0] < x1 && p[1] >= z0 && p[1] < z1;
  const stripe = (pts: Pt[], off: number, w: number, color: V3, dash: number, gap: number) => {
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const L = dist(a, b);
      if (L < 1e-3) continue;
      const dx = (b[0] - a[0]) / L;
      const dz = (b[1] - a[1]) / L;
      const nx = -dz;
      const nz = dx;
      let s = 0;
      while (s < L) {
        const period = dash + gap;
        const phase = (acc + s) % period;
        let segLen: number;
        if (gap > 0 && phase >= dash) {
          s += period - phase;
          continue;
        }
        segLen = gap > 0 ? Math.min(dash - phase, L - s) : L - s;
        const p0: Pt = [a[0] + dx * s + nx * off, a[1] + dz * s + nz * off];
        const p1: Pt = [a[0] + dx * (s + segLen) + nx * off, a[1] + dz * (s + segLen) + nz * off];
        if (inC([(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2])) quad(m, p0, p1, nx * w * 0.5, nz * w * 0.5, Y, color);
        s += segLen;
      }
      acc += L;
    }
  };
  for (const e of g.edges) {
    if (!e.drivable || e.cls === 'service' || e.surface === 'pavers' || e.width < 4.5) continue;
    const bb = bboxOf(e.ptsXZ);
    if (bb[2] < x0 - 5 || bb[0] > x1 + 5 || bb[3] < z0 - 5 || bb[1] > z1 + 5) continue;
    const ra = g.nodes[e.a].radius + 0.6;
    const rb = g.nodes[e.b].radius + 0.6;
    if (e.length - ra - rb < 3) continue;
    const pts = subPolyline(e.ptsXZ, ra, e.length - rb);
    const hw = e.width / 2;
    const major = ['trunk', 'primary', 'secondary'].includes(e.cls);
    const twoWay = e.lanesF > 0 && e.lanesB > 0;
    const parkingW = (e as { parking?: number }).parking ? 2.1 : 0;
    if (twoWay) {
      if (major) {
        stripe(pts, 0.11, 0.1, YELLOW, 1, 0);
        stripe(pts, -0.11, 0.1, YELLOW, 1, 0);
      } else stripe(pts, 0, 0.11, YELLOW, 3, 4);
      const lwF = (hw - parkingW) / e.lanesF;
      for (let k = 1; k < e.lanesF; k++) stripe(pts, k * lwF, 0.11, WHITE, 3, 6);
      const lwB = hw / e.lanesB;
      for (let k = 1; k < e.lanesB; k++) stripe(pts, -k * lwB, 0.11, WHITE, 3, 6);
    } else if (e.lanesF > 1) {
      const lw = (e.width - parkingW) / e.lanesF;
      for (let k = 1; k < e.lanesF; k++) stripe(pts, -hw + k * lw, 0.11, WHITE, 3, 6);
    }
    if (major) {
      stripe(pts, hw - 0.3, 0.12, WHITE, 1, 0);
      stripe(pts, -hw + 0.3, 0.12, twoWay ? WHITE : YELLOW, 1, 0);
    }
  }
  // Zebra crossings + stop lines at signalised junctions.
  for (const n of g.nodes) {
    if (!n.signal || n.radius <= 0) continue;
    if (n.x < x0 - 30 || n.x > x1 + 30 || n.z < z0 - 30 || n.z > z1 + 30) continue;
    for (const eid of n.edges) {
      const e = g.edges[eid];
      if (!e.drivable) continue;
      const pts = e.a === n.id ? e.ptsXZ : [...e.ptsXZ].reverse();
      const p1 = pts[Math.min(1, pts.length - 1)];
      const L = dist(pts[0], p1) || 1;
      const dx = (p1[0] - pts[0][0]) / L;
      const dz = (p1[1] - pts[0][1]) / L;
      zebra(m, n.x + dx * (n.radius + 0.4), n.z + dz * (n.radius + 0.4), dx, dz, e.width, WHITE, inC);
      // stop line on the incoming half
      const incoming = e.b === n.id ? e.lanesF > 0 : e.lanesB > 0;
      if (incoming) {
        const s = n.radius + 3.8;
        const cx = n.x + dx * s;
        const cz = n.z + dz * s;
        // incoming lanes are on the right side of travel (travel = -d); right of -d is (dz, -dx)
        const twoWay = e.lanesF > 0 && e.lanesB > 0;
        const from = twoWay ? 0 : -e.width / 2;
        const to = e.width / 2;
        const p0: Pt = [cx + dz * from, cz - dx * from];
        const p2: Pt = [cx + dz * to, cz - dx * to];
        if (inC([cx, cz])) quad(m, p0, p2, dx * 0.22, dz * 0.22, 0.013, WHITE);
      }
    }
  }
  for (const c of g.crossings) {
    const [x, z, dx, dz, w] = c;
    zebra(m, x, z, dx, dz, w, WHITE, inC);
  }
}

function zebra(m: MeshBuilder, cx: number, cz: number, dx: number, dz: number, width: number, color: V3, inC: (p: Pt) => boolean) {
  if (!inC([cx, cz])) return;
  const len = 3.2;
  const nx = -dz;
  const nz = dx;
  for (let o = -width / 2 + 0.4; o < width / 2 - 0.2; o += 1.0) {
    const p0: Pt = [cx + nx * o, cz + nz * o];
    const p1: Pt = [cx + nx * o + dx * len, cz + nz * o + dz * len];
    quad(m, p0, p1, nx * 0.25, nz * 0.25, 0.013, color);
  }
}

function quad(m: MeshBuilder, p0: Pt, p1: Pt, ox: number, oz: number, y: number, c: V3) {
  const a = m.v([p0[0] + ox, y, p0[1] + oz], [0, 1, 0], [0, 0], c);
  const b = m.v([p1[0] + ox, y, p1[1] + oz], [0, 1, 0], [1, 0], c);
  const d = m.v([p1[0] - ox, y, p1[1] - oz], [0, 1, 0], [1, 1], c);
  const e = m.v([p0[0] - ox, y, p0[1] - oz], [0, 1, 0], [0, 1], c);
  // ensure facing up
  const cy = (m.pos[b * 3 + 2] - m.pos[a * 3 + 2]) * (m.pos[d * 3] - m.pos[a * 3]) - (m.pos[b * 3] - m.pos[a * 3]) * (m.pos[d * 3 + 2] - m.pos[a * 3 + 2]);
  if (cy > 0) m.quad(a, b, d, e);
  else m.quad(a, e, d, b);
}

/** Oriented bounding box of points: centre, axes and half extents. */
function obb(pts: Pt[]) {
  let best = { area: Infinity, c: [0, 0] as Pt, u: [1, 0] as Pt, hu: 0, hv: 0 };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const L = dist(a, b);
    if (L < 0.2) continue;
    const u: Pt = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const v: Pt = [-u[1], u[0]];
    let mu = Infinity;
    let Mu = -Infinity;
    let mv = Infinity;
    let Mv = -Infinity;
    for (const p of pts) {
      const pu = p[0] * u[0] + p[1] * u[1];
      const pv = p[0] * v[0] + p[1] * v[1];
      mu = Math.min(mu, pu);
      Mu = Math.max(Mu, pu);
      mv = Math.min(mv, pv);
      Mv = Math.max(Mv, pv);
    }
    const area = (Mu - mu) * (Mv - mv);
    if (area < best.area) {
      const cu = (mu + Mu) / 2;
      const cv = (mv + Mv) / 2;
      best = { area, c: [u[0] * cu + v[0] * cv, u[1] * cu + v[1] * cv], u, hu: (Mu - mu) / 2, hv: (Mv - mv) / 2 };
    }
  }
  return best;
}

function emitGate(pts: Pt[], stone: MeshBuilder, col: MeshBuilder, conde: boolean) {
  const o = obb(pts);
  // passage runs along the axis closer to east-west for Puerta del Conde, else across the short side
  let u = o.u;
  let hu = o.hu;
  let hv = o.hv;
  const alongX = Math.abs(u[0]) > Math.abs(u[1]);
  if ((conde && !alongX) || (!conde && hu > hv)) {
    u = [-u[1], u[0]];
    [hu, hv] = [hv, hu];
  }
  hu = Math.max(hu, 2.5);
  hv = Math.max(hv, 4);
  const rot = Math.atan2(u[1], u[0]);
  const v: Pt = [-u[1], u[0]];
  const pass = 1.9;
  const pierW = (hv - pass) / 2;
  const C: V3 = [0.8, 0.72, 0.6];
  const H = conde ? 8 : 7;
  for (const s of [-1, 1]) {
    const off = pass + pierW;
    const cx = o.c[0] + v[0] * off * s;
    const cz = o.c[1] + v[1] * off * s;
    stone.box(cx, H / 2, cz, hu, H / 2, pierW, rot, C, 1);
    col.box(cx, H / 2, cz, hu, H / 2, pierW, rot);
  }
  stone.box(o.c[0], H - 1.3, o.c[1], hu, 1.3, pass + 0.05, rot, C, 1);
  if (conde) {
    // small belfry on top, like the real gate
    stone.box(o.c[0], H + 1.4, o.c[1], hu * 0.6, 1.4, 1.6, rot, [0.84, 0.76, 0.64], 1);
    stone.box(o.c[0], H + 3.2, o.c[1], hu * 0.45, 0.4, 1.0, rot, [0.84, 0.76, 0.64], 1);
  }
  for (let k = -3; k <= 3; k++) stone.box(o.c[0] + v[0] * k * 1.4, H + 0.4, o.c[1] + v[1] * k * 1.4, 0.4, 0.4, 0.4, rot, C, 1);
}

function emitChinaGate(pts: Pt[], m: MeshBuilder, col: MeshBuilder) {
  const o = obb(pts);
  const rot = Math.atan2(o.u[1], o.u[0]);
  const v: Pt = [-o.u[1], o.u[0]];
  const RED: V3 = [0.55, 0.04, 0.03];
  const GREEN: V3 = [0.05, 0.3, 0.16];
  const GOLD: V3 = [0.75, 0.55, 0.1];
  for (const su of [-1, 1])
    for (const sv of [-1, 1]) {
      const x = o.c[0] + o.u[0] * (o.hu - 0.4) * su + v[0] * (o.hv - 0.4) * sv;
      const z = o.c[1] + o.u[1] * (o.hu - 0.4) * su + v[1] * (o.hv - 0.4) * sv;
      m.box(x, 2.6, z, 0.28, 2.6, 0.28, rot, RED);
      col.box(x, 2.6, z, 0.28, 2.6, 0.28, rot);
    }
  m.box(o.c[0], 5.3, o.c[1], o.hu + 0.2, 0.18, o.hv + 0.2, rot, RED);
  m.box(o.c[0], 5.75, o.c[1], o.hu + 1.0, 0.25, o.hv + 0.9, rot, GREEN);
  m.box(o.c[0], 6.15, o.c[1], o.hu * 0.8, 0.22, o.hv * 0.6, rot, GREEN);
  m.box(o.c[0], 4.6, o.c[1], o.hu * 0.5, 0.35, o.hv + 0.25, rot, GOLD);
}

function validate(g: ReturnType<typeof buildGraph>, world: { minX: number; minZ: number; maxX: number; maxZ: number }, play: { minX: number; minZ: number; maxX: number; maxZ: number }) {
  // Strongly connected component (respecting one-ways) of the drivable network.
  const drv = g.edges.filter((e) => e.drivable && e.cls !== 'service');
  const adj = new Map<number, number[]>();
  const radj = new Map<number, number[]>();
  const add = (m: Map<number, number[]>, a: number, b: number) => (m.get(a) ?? m.set(a, []).get(a)!).push(b);
  for (const e of drv) {
    if (e.lanesF > 0) {
      add(adj, e.a, e.b);
      add(radj, e.b, e.a);
    }
    if (e.lanesB > 0) {
      add(adj, e.b, e.a);
      add(radj, e.a, e.b);
    }
  }
  const inPlay = (n: { x: number; z: number }) => n.x > play.minX && n.x < play.maxX && n.z > play.minZ && n.z < play.maxZ;
  const start = g.nodes.find((n) => n.signal && inPlay(n)) ?? g.nodes[0];
  const bfs = (m: Map<number, number[]>) => {
    const seen = new Set<number>([start.id]);
    const q = [start.id];
    while (q.length) for (const nb of m.get(q.pop()!) ?? []) if (!seen.has(nb)) (seen.add(nb), q.push(nb));
    return seen;
  };
  const f = bfs(adj);
  const b = bfs(radj);
  const scc = [...f].filter((x) => b.has(x));
  const playNodes = new Set(drv.flatMap((e) => [e.a, e.b]).filter((id) => inPlay(g.nodes[id])));
  const inScc = [...playNodes].filter((id) => scc.includes(id)).length;
  const deadEnds = [...playNodes].filter((id) => g.nodes[id].edges.filter((x) => g.edges[x].drivable).length === 1).length;
  void world;
  return {
    drivableNodesInPlay: playNodes.size,
    drivableNodesInMainScc: inScc,
    mainSccPercent: Math.round((inScc / Math.max(1, playNodes.size)) * 1000) / 10,
    deadEndsInPlay: deadEnds,
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
