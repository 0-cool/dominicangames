import { describe, expect, it } from 'vitest';
import { centroid, difference, multiArea, offsetPolyline, pointInRing, rect, signedArea, simplify, triangulate, union } from '../src/geom.ts';

describe('polygon helpers', () => {
  const sq = rect(0, 0, 10, 10);
  it('computes area and centroid', () => {
    expect(Math.abs(signedArea(sq))).toBeCloseTo(100);
    const c = centroid(sq);
    expect(c[0]).toBeCloseTo(5);
    expect(c[1]).toBeCloseTo(5);
  });
  it('tests point containment', () => {
    expect(pointInRing([5, 5], sq)).toBe(true);
    expect(pointInRing([15, 5], sq)).toBe(false);
  });
  it('unions overlapping road surfaces without double counting', () => {
    const a = [[rect(0, 0, 10, 4)]];
    const b = [[rect(6, 0, 16, 4)]];
    expect(multiArea(union(a, b))).toBeCloseTo(64);
  });
  it('subtracts road corridors from building footprints', () => {
    const bldg = [[rect(0, 0, 10, 10)]];
    const road = [[rect(8, -5, 20, 15)]];
    expect(multiArea(difference(bldg, road))).toBeCloseTo(80);
  });
  it('triangulates a footprint with the right area', () => {
    const { xz, idx } = triangulate([sq]);
    let area = 0;
    for (let i = 0; i < idx.length; i += 3) {
      const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]];
      area += Math.abs((xz[b * 2] - xz[a * 2]) * (xz[c * 2 + 1] - xz[a * 2 + 1]) - (xz[c * 2] - xz[a * 2]) * (xz[b * 2 + 1] - xz[a * 2 + 1])) / 2;
    }
    expect(area).toBeCloseTo(100);
  });
});

describe('polyline helpers', () => {
  it('offsets a straight street by the requested distance', () => {
    const o = offsetPolyline([[0, 0], [10, 0]], 3);
    for (const p of o) expect(Math.abs(p[1])).toBeCloseTo(3);
  });
  it('simplifies collinear points', () => {
    const s = simplify([[0, 0], [1, 0.001], [2, 0], [3, 0]], 0.1);
    expect(s.length).toBe(2);
  });
});
