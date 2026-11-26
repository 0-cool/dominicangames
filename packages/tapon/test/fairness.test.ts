import { describe, expect, it } from 'vitest';
import { taponImplausible, taponScoreBounds } from '@sd/shared';
import { FAIR } from '../src/config.ts';
import { pathFrom, planPath, predictFree } from '../src/sim/fairness.ts';
import { World } from '../src/sim/world.ts';

/** A bot with perfect information: follows the escape path the fairness model finds. */
function botStep(w: World, reactSteps = 0) {
  // like a calm player: plans between lane changes and prefers to keep its lane
  if (Math.abs(w.lanePos - w.laneTarget) > 1e-3) return true;
  const ents = w.entities.filter((e) => e.deadly && e.x + e.hb1 > w.dist - 30 && e.x < w.dist + 90).map(World.pred);
  const p = { ...w.predPlayer(), v: w.v };
  const path = reactSteps ? pathFrom(p, predictFree(p, ents), reactSteps) : planPath(p, predictFree(p, ents), w.laneTarget);
  if (!path) return false;
  for (let i = 1; i < path.length; i++) {
    if (path[i][1] !== path[i - 1][1]) {
      if (path[i - 1][0] === 0) w.move(path[i][1] > path[i - 1][1] ? 1 : -1);
      break;
    }
  }
  return true;
}

function run(seed: number, seconds: number) {
  const w = new World(seed);
  const dt = 1 / 60;
  let lost = 0;
  for (let i = 0; i < seconds * 60 && !w.over; i++) {
    if (!botStep(w)) lost++;
    w.step(dt);
  }
  return { w, lost };
}

describe('El Tapón fairness', () => {
  it('a bot that follows the escape path never crashes (many seeded runs)', () => {
    let crashes = 0;
    let distance = 0;
    let refused = 0;
    let events = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { w } = run(seed, 150);
      crashes += w.stats.crashes;
      distance += w.dist;
      refused += w.refused;
      events += w.stats.closuresPassed + w.stats.plantainsDodged;
    }
    // something actually happened on the road
    expect(distance).toBeGreaterThan(12 * 1500);
    expect(events).toBeGreaterThan(12);
    expect(refused).toBeGreaterThan(0);
    expect(crashes).toBe(0);
  }, 240_000);

  it('the escape search finds a lane change around a blocked lane', () => {
    const player = { x0: 0, x1: 2, v: 10, lanePos: 1, laneTarget: 1 };
    const wall = { x: 12, hb0: 0, hb1: 4, v: 0, vCruise: 0, lane: 1, laneFrom: 1, blinkLeft: -1, changeLeft: -1, changeDur: 0.9, changeTo: 1, stopLeft: -1, isStatic: true };
    const path = pathFrom(player, predictFree(player, [wall]), Math.round(FAIR.reactS / FAIR.stepS));
    expect(path).not.toBeNull();
    expect(path!.some(([, l]) => l !== 1)).toBe(true);
    // all three lanes walled at the same distance: no escape
    const walls = [0, 1, 2].map((lane) => ({ ...wall, lane, laneFrom: lane, changeTo: lane }));
    expect(pathFrom(player, predictFree(player, walls), 9)).toBeNull();
  });

  it('scores stay inside the bounds the server accepts', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { w } = run(seed, 90);
      const stats = w.finalStats();
      const { min, max } = taponScoreBounds(stats);
      expect(w.score).toBeGreaterThanOrEqual(min);
      expect(w.score).toBeLessThanOrEqual(max);
      expect(taponImplausible(w.score, stats, stats.durationMs + 1000)).toEqual([]);
    }
  }, 60_000);
});
