/**
 * Geographic ↔ game-world coordinate conversion.
 *
 * World convention (documented in docs/ARCHITECTURE.md §4):
 *   - 1 world unit = 1 metre.
 *   - +X = east, -Z = north (+Z = south), +Y = up (three.js right-handed).
 *   - Origin = WORLD_ORIGIN (between Parque Independencia and Zona Colonial).
 *
 * Projection: local equirectangular tangent plane using WGS84 metres-per-degree
 * evaluated at the origin latitude. Inside the playable area (< 3 km from the
 * origin) the distortion versus a geodesic distance is < 0.05 % (≈ 1.5 m at 3 km),
 * well below OSM mapping precision.
 */
export interface LatLon {
  lat: number;
  lon: number;
}

export interface WorldXZ {
  x: number;
  z: number;
}

export const WORLD_ORIGIN: Readonly<LatLon> = Object.freeze({ lat: 18.47, lon: -69.891 });

export function metersPerDegree(latDeg: number): { lat: number; lon: number } {
  const p = (latDeg * Math.PI) / 180;
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p) - 0.0023 * Math.cos(6 * p),
    lon: 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) + 0.118 * Math.cos(5 * p),
  };
}

export class GeoProjection {
  readonly origin: LatLon;
  private readonly mLat: number;
  private readonly mLon: number;

  constructor(origin: LatLon = WORLD_ORIGIN) {
    this.origin = { ...origin };
    const m = metersPerDegree(origin.lat);
    this.mLat = m.lat;
    this.mLon = m.lon;
  }

  toWorld(lat: number, lon: number): WorldXZ {
    return { x: (lon - this.origin.lon) * this.mLon, z: -(lat - this.origin.lat) * this.mLat };
  }

  toGeo(x: number, z: number): LatLon {
    return { lat: this.origin.lat - z / this.mLat, lon: this.origin.lon + x / this.mLon };
  }
}

/** Great-circle distance in metres (haversine, mean Earth radius). Used for validation. */
export function haversine(a: LatLon, b: LatLon): number {
  const R = 6371008.8;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Compass heading in degrees (0 = north, 90 = east) for a world-space direction. */
export function headingFromDirection(dx: number, dz: number): number {
  const deg = (Math.atan2(dx, -dz) * 180) / Math.PI;
  return (deg + 360) % 360;
}
