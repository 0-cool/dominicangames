import { describe, expect, it } from 'vitest';
import { GeoProjection, WORLD_ORIGIN } from '@sd/shared';
import { Atmosphere } from '../src/render/Atmosphere.ts';
import { MISSIONS } from '../src/gameplay/Missions.ts';

const deg = (r: number) => (r * 180) / Math.PI;

describe('solar position for Santo Domingo', () => {
  it('puts the sun almost overhead at solar noon near the June solstice', () => {
    // Solar noon in Santo Domingo is ≈ 12:30 local time (UTC-4, longitude −69.9°)
    let best = -90;
    for (let h = 11; h <= 14; h += 0.05) best = Math.max(best, deg(Atmosphere.solar(172, h).el));
    expect(best).toBeGreaterThan(83);
    expect(best).toBeLessThan(88);
  });
  it('has night at 22:00 and day at 10:00', () => {
    expect(deg(Atmosphere.solar(327, 22).el)).toBeLessThan(-30);
    expect(deg(Atmosphere.solar(327, 10).el)).toBeGreaterThan(30);
  });
  it('sets in the west (azimuth 230–300°) in the evening', () => {
    const az = deg(Atmosphere.solar(327, 17.5).az);
    expect(az).toBeGreaterThan(230);
    expect(az).toBeLessThan(300);
  });
});

describe('mission definitions', () => {
  const proj = new GeoProjection(WORLD_ORIGIN);
  it('keeps every checkpoint inside the OpenStreetMap extract', () => {
    for (const m of MISSIONS)
      for (const s of m.steps)
        if (s.kind === 'checkpoint') {
          expect(s.cp.lat).toBeGreaterThan(18.459);
          expect(s.cp.lat).toBeLessThan(18.481);
          expect(s.cp.lon).toBeGreaterThan(-69.907);
          expect(s.cp.lon).toBeLessThan(-69.875);
          const w = proj.toWorld(s.cp.lat, s.cp.lon);
          expect(Math.abs(w.x)).toBeLessThan(1700);
          expect(Math.abs(w.z)).toBeLessThan(1250);
        }
  });
  it('defines the introductory mission first with a reward', () => {
    expect(MISSIONS[0].id).toBe('m001_bienvenido');
    expect(MISSIONS[0].reward).toBeGreaterThan(0);
    expect(MISSIONS[0].steps[0].kind).toBe('talk');
  });
});
