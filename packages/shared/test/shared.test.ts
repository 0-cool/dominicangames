import { describe, expect, it } from 'vitest';
import {
  GeoProjection,
  PRESETS,
  WORLD_ORIGIN,
  defaultGameSettings,
  formatDop,
  gameSettingsSchema,
  haversine,
  headingFromDirection,
  registerSchema,
  saveDataSchema,
} from '../src/index.ts';

describe('prices', () => {
  it('formats Dominican pesos', () => {
    expect(formatDop(10000)).toBe('RD$100.00');
    expect(formatDop(123456)).toBe('RD$1,234.56');
  });
});

describe('registration schema', () => {
  const ok = { email: '  Ana@Example.COM ', username: 'ana_rd', password: 'una-clave-larga', acceptTerms: true as const };
  it('normalises the email', () => {
    expect(registerSchema.parse(ok).email).toBe('ana@example.com');
  });
  it('rejects weak or incomplete input', () => {
    expect(registerSchema.safeParse({ ...ok, password: 'corta' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, username: 'a b' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, email: 'no-email' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, acceptTerms: false }).success).toBe(false);
  });
});

describe('game settings and saves', () => {
  it('builds valid defaults for every preset', () => {
    for (const p of ['low', 'medium', 'high', 'ultra'] as const) {
      const s = defaultGameSettings(p);
      expect(gameSettingsSchema.safeParse(s).success).toBe(true);
      expect(s.graphics.drawDistance).toBe(PRESETS[p].drawDistance);
    }
  });
  it('validates saves strictly', () => {
    const save = { version: 1, player: { x: 1, y: 2, z: 3, heading: 90 }, vehicle: null, money: 0, timeOfDay: 12, weather: 'clear', discoveredLandmarks: [], stats: { distanceWalked: 0, distanceDriven: 0, playTimeSec: 0, topSpeedKmh: 0 }, savedAt: new Date().toISOString() };
    expect(saveDataSchema.safeParse(save).success).toBe(true);
    expect(saveDataSchema.safeParse({ ...save, money: -1 }).success).toBe(false);
    expect(saveDataSchema.safeParse({ ...save, player: { ...save.player, x: Number.NaN } }).success).toBe(false);
    expect(saveDataSchema.safeParse({ ...save, timeOfDay: 25 }).success).toBe(false);
  });
});

describe('geo projection', () => {
  const proj = new GeoProjection(WORLD_ORIGIN);
  it('round-trips coordinates', () => {
    const w = proj.toWorld(18.4737, -69.8838); // Parque Colón
    const g = proj.toGeo(w.x, w.z);
    expect(g.lat).toBeCloseTo(18.4737, 9);
    expect(g.lon).toBeCloseTo(-69.8838, 9);
  });
  it('matches great-circle distances within 0.2 %', () => {
    const a = { lat: 18.4713, lon: -69.8935 }; // Puerta del Conde
    const b = { lat: 18.4709, lon: -69.8822 }; // Fortaleza Ozama
    const wa = proj.toWorld(a.lat, a.lon);
    const wb = proj.toWorld(b.lat, b.lon);
    const local = Math.hypot(wa.x - wb.x, wa.z - wb.z);
    expect(Math.abs(local - haversine(a, b)) / haversine(a, b)).toBeLessThan(0.002);
  });
  it('uses +X east and +Z south', () => {
    expect(proj.toWorld(18.47, -69.89).x).toBeGreaterThan(0);
    expect(proj.toWorld(18.48, -69.891).z).toBeLessThan(0);
    expect(headingFromDirection(0, -1)).toBe(0);
    expect(headingFromDirection(1, 0)).toBe(90);
  });
});
