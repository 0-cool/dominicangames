import type { LatLon } from './geo.ts';

/** Road classes derived from OSM `highway=*`. */
export type RoadClass =
  | 'trunk'
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'residential'
  | 'service'
  | 'living'
  | 'pedestrian'
  | 'footway'
  | 'steps';

export type RoadSurface = 'asphalt' | 'pavers' | 'concrete';

export interface RoadNode {
  id: number;
  x: number;
  z: number;
  /** Signalised junction (OSM highway=traffic_signals near this node). */
  signal: boolean;
  /** Incident edge ids. */
  edges: number[];
  /** Distance from node centre where incident lanes are trimmed (junction box radius). */
  radius: number;
}

export interface RoadEdge {
  id: number;
  a: number;
  b: number;
  /** Flat polyline [x0,z0,x1,z1,...] from node a to node b. */
  pts: number[];
  cls: RoadClass;
  /** Carriageway width in metres (curb to curb). */
  width: number;
  /** Sidewalk width each side (0 when none). */
  sidewalk: number;
  /** Lanes in a→b direction and b→a direction (0 = not allowed). */
  lanesF: number;
  lanesB: number;
  speed: number;
  surface: RoadSurface;
  drivable: boolean;
  walkable: boolean;
  length: number;
  name?: string;
  osmId: number;
}

export interface RoadGraphData {
  nodes: RoadNode[];
  edges: RoadEdge[];
}

export interface ChunkInfo {
  id: string;
  ix: number;
  iz: number;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  glb: string;
  props: string;
  triangles: number;
  buildings: number;
}

export interface LandmarkInfo {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
  /** Short factual description (Spanish) shown on discovery. */
  description: string;
}

export interface WorldManifest {
  version: number;
  generatedAt: string;
  source: { name: string; license: string; attribution: string; fetched: string; bbox: number[] };
  origin: LatLon;
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  playBounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  seaLevel: number;
  chunkSize: number;
  chunks: ChunkInfo[];
  landmarks: LandmarkInfo[];
  spawn: { x: number; z: number; heading: number };
  stats: Record<string, number>;
}

/**
 * Per-chunk instanced props. Each entry is a flat array with a fixed stride
 * documented in PROP_STRIDE. Coordinates are absolute world metres.
 */
export interface ChunkProps {
  props: Partial<Record<PropType, number[]>>;
  /** Businesses with fictional names, sign mounted on a street-facing wall. */
  shops: { x: number; y: number; z: number; rot: number; kind: ShopKind; name: string }[];
  /** Traffic-signal heads: flat [x, z, rotY, nodeId, edgeId] */
  signals: number[];
  /** Overhead power-line spans between pole tops: flat [x1, y1, z1, x2, y2, z2] */
  wires: number[];
  /** Night light sources: flat [x, y, z, kind] (kind 0 = warm lantern, 1 = sodium street lamp, 2 = LED) */
  lights: number[];
}

export type ShopKind =
  | 'colmado'
  | 'banca'
  | 'farmacia'
  | 'restaurante'
  | 'picapollo'
  | 'cafeteria'
  | 'bar'
  | 'tienda'
  | 'repuestos'
  | 'ferreteria'
  | 'salon'
  | 'banco';

export type PropType =
  | 'tree_palm'
  | 'tree_royal'
  | 'tree_almond'
  | 'tree_flamboyan'
  | 'tree_ficus'
  | 'lamp_colonial'
  | 'lamp_street'
  | 'lamp_malecon'
  | 'pole'
  | 'signal'
  | 'stop_sign'
  | 'bench'
  | 'trash'
  | 'tinaco'
  | 'ac_unit'
  | 'balcony'
  | 'awning'
  | 'chair_set'
  | 'cooler'
  | 'cart'
  | 'parked_car'
  | 'parked_moto'
  | 'bollard'
  | 'rock'
  | 'dish'
  | 'rebar'
  | 'planter';

/** Floats per instance for each prop type: x, y, z, rotY, variant (+ extra). */
export const PROP_STRIDE = 5;

/** Facade style ids shared by the world builder (vertex attribute) and the facade shader. */
export const FACADE = {
  COLONIAL: 0,
  CORAL_STONE: 1,
  GAZCUE: 2,
  HOUSE: 3,
  APARTMENT: 4,
  COMMERCIAL: 5,
  TOWER: 6,
  RUINS: 7,
  MARBLE: 8,
} as const;

/** Facade flag bits (vertex attribute `_facade.z`). */
export const FACADE_FLAG = {
  STREET: 1,
  SHOP: 2,
  BLANK: 4,
  ARCADE: 8,
  GARAGE: 16,
} as const;

export interface MapData {
  sea: number[][][];
  water: number[][][];
  parks: number[][][];
  plazas: number[][][];
  buildings: number[][];
}
