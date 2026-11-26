import type { MapData, RoadClass, RoadGraphData, WorldManifest } from '@sd/shared';

/** Pre-rendered top-down city map used by the minimap and the full-screen map. */
export interface MapImage {
  canvas: HTMLCanvasElement;
  /** pixels per metre */
  scale: number;
  minX: number;
  minZ: number;
  width: number;
  height: number;
}

export interface WorldMapSource {
  manifest: WorldManifest;
  roads: RoadGraphData;
  map: { water: number[][][][]; parks: number[][][][]; plazas: number[][][][]; buildings: number[][] } | MapData;
}

const C = {
  land: '#171b23',
  sea: '#0d3a50',
  seaEdge: '#1f6c86',
  park: '#1c3a28',
  plaza: '#332f2b',
  building: '#262d3b',
  buildingStroke: '#303a4d',
};

const ROAD_STYLE: Record<RoadClass, { color: string; min: number; z: number }> = {
  trunk: { color: '#d7a64a', min: 3, z: 6 },
  primary: { color: '#c9ced9', min: 2.6, z: 5 },
  secondary: { color: '#aab1c0', min: 2.2, z: 4 },
  tertiary: { color: '#959cad', min: 2, z: 3 },
  residential: { color: '#7d8597', min: 1.6, z: 2 },
  living: { color: '#7d8597', min: 1.6, z: 2 },
  service: { color: '#5d6578', min: 1.1, z: 1 },
  pedestrian: { color: '#a8916b', min: 1.6, z: 2 },
  footway: { color: '#6e6250', min: 0.8, z: 0 },
  steps: { color: '#6e6250', min: 0.8, z: 0 },
};

function polys(ctx: CanvasRenderingContext2D, list: number[][][][], t: (x: number, z: number) => [number, number]) {
  ctx.beginPath();
  for (const poly of list)
    for (const ring of poly)
      ring.forEach(([x, z], i) => {
        const [px, py] = t(x, z);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
  ctx.fill('evenodd');
}

export function renderMapImage(src: WorldMapSource, scale = 1): MapImage {
  const b = src.manifest.bounds;
  const width = Math.ceil((b.maxX - b.minX) * scale);
  const height = Math.ceil((b.maxZ - b.minZ) * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const t = (x: number, z: number): [number, number] => [(x - b.minX) * scale, (z - b.minZ) * scale];

  ctx.fillStyle = C.land;
  ctx.fillRect(0, 0, width, height);
  const m = src.map as { water: number[][][][]; parks: number[][][][]; plazas: number[][][][]; buildings: number[][] };
  ctx.fillStyle = C.sea;
  polys(ctx, m.water ?? [], t);
  ctx.strokeStyle = C.seaEdge;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = C.park;
  polys(ctx, m.parks ?? [], t);
  ctx.fillStyle = C.plaza;
  polys(ctx, m.plazas ?? [], t);

  // buildings
  ctx.fillStyle = C.building;
  ctx.strokeStyle = C.buildingStroke;
  ctx.lineWidth = Math.max(0.5, scale * 0.6);
  ctx.beginPath();
  for (const f of m.buildings ?? []) {
    for (let i = 0; i < f.length; i += 2) {
      const [px, py] = t(f[i], f[i + 1]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();

  // roads, by class (minor first). Casing pass then fill pass.
  const edges = [...src.roads.edges].sort((a, b) => ROAD_STYLE[a.cls].z - ROAD_STYLE[b.cls].z);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const pass of ['casing', 'fill'] as const) {
    for (const e of edges) {
      const st = ROAD_STYLE[e.cls];
      const w = Math.max(st.min, (e.width + (pass === 'casing' ? 1.6 : 0)) * scale * 0.9);
      if (pass === 'casing' && st.z < 2) continue;
      ctx.strokeStyle = pass === 'casing' ? 'rgba(0,0,0,0.55)' : st.color;
      ctx.lineWidth = w;
      if (e.cls === 'footway' || e.cls === 'steps') ctx.setLineDash([2 * scale, 2 * scale]);
      else ctx.setLineDash([]);
      ctx.beginPath();
      for (let i = 0; i < e.pts.length; i += 2) {
        const [px, py] = t(e.pts[i], e.pts[i + 1]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  return { canvas, scale, minX: b.minX, minZ: b.minZ, width, height };
}

/** Street-name labels for the full map (one per named street, at its longest segment). */
export function streetLabels(roads: RoadGraphData) {
  const best = new Map<string, { x: number; z: number; angle: number; len: number; major: boolean }>();
  for (const e of roads.edges) {
    if (!e.name || e.length < 40) continue;
    const n = e.pts.length / 2;
    const mid = Math.floor(n / 2);
    const i0 = Math.max(0, mid - 1);
    const ax = e.pts[i0 * 2];
    const az = e.pts[i0 * 2 + 1];
    const bx = e.pts[Math.min(n - 1, mid) * 2] ?? ax;
    const bz = e.pts[Math.min(n - 1, mid) * 2 + 1] ?? az;
    let angle = Math.atan2(bz - az, bx - ax);
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;
    const cur = best.get(e.name);
    if (!cur || e.length > cur.len) best.set(e.name, { x: (ax + bx) / 2, z: (az + bz) / 2, angle, len: e.length, major: ['trunk', 'primary', 'secondary'].includes(e.cls) });
  }
  return [...best.entries()].map(([name, v]) => ({ name, ...v }));
}
