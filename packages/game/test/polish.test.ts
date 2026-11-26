import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { STATIONS, Song } from '../src/audio/Radio.ts';
import { Headlights } from '../src/render/Headlights.ts';

describe('car radio', () => {
  it('has four fictional stations, one per Dominican genre', () => {
    expect(STATIONS.map((s) => s.genre).sort()).toEqual(['bachata', 'dembow', 'merengue', 'tipico']);
    expect(new Set(STATIONS.map((s) => s.name)).size).toBe(STATIONS.length);
  });

  it('generates songs deterministically from a seed, with genre-appropriate tempos', () => {
    const ranges = { bachata: [124, 132], merengue: [138, 150], dembow: [112, 120], tipico: [148, 160] } as const;
    for (const s of STATIONS) {
      for (let seed = 1; seed < 40; seed++) {
        const a = new Song(s.genre, seed);
        const b = new Song(s.genre, seed);
        expect(a.bpm).toBe(b.bpm);
        expect(a.note(3)).toBe(b.note(3));
        expect(a.bpm).toBeGreaterThanOrEqual(ranges[s.genre][0]);
        expect(a.bpm).toBeLessThanOrEqual(ranges[s.genre][1]);
      }
    }
  });

  it('gives every song an intro, verses, choruses, a break and an outro', () => {
    const song = new Song('merengue', 7);
    const sections = new Set(Array.from({ length: song.bars }, (_, bar) => song.section(bar)));
    expect([...sections].sort()).toEqual(['break', 'chorus', 'intro', 'outro', 'verse']);
    expect(song.section(0)).toBe('intro');
    expect(song.section(song.bars - 1)).toBe('outro');
  });
});

describe('headlights', () => {
  const car = { position: new THREE.Vector3(10, 0.5, 20), forward: new THREE.Vector3(0, 0, 1), spec: { L: 4.6, H: 1.45, twoWheels: false } };

  it('switch on automatically at night and in heavy rain, not on a clear day', () => {
    const h = new Headlights();
    expect(h.wanted(0, 0)).toBe(false);
    expect(h.wanted(0.8, 0)).toBe(true);
    expect(h.wanted(0, 0.9)).toBe(true);
  });

  it('L flips what the player sees, and leaving the vehicle returns to automatic', () => {
    const h = new Headlights();
    expect(h.toggle(0.9, 0)).toBe(false); // night: auto-on → off
    expect(h.wanted(0.9, 0)).toBe(false);
    expect(h.toggle(0.9, 0)).toBe(true);
    for (let i = 0; i < 30; i++) h.update(1 / 30, car, 0.9, 0);
    expect(h.on).toBe(true);
    expect(h.light.intensity).toBeGreaterThan(0);
    // the beam points down the road, ahead of the car
    expect(h.light.target.position.z).toBeGreaterThan(car.position.z + 10);
    h.update(1 / 30, null, 0.9, 0);
    expect(h.mode).toBe('auto');
    for (let i = 0; i < 60; i++) h.update(1 / 30, null, 0.9, 0);
    expect(h.light.intensity).toBe(0);
  });
});
