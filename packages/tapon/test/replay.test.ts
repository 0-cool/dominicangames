import { describe, expect, it } from 'vitest';
import { expNeg } from '../src/config.ts';
import { planPath, predictFree } from '../src/sim/fairness.ts';
import { SIM_STEP, decodeInputs, encodeInputs, replayRun, sameResult } from '../src/sim/replay.ts';
import { World } from '../src/sim/world.ts';

/** Plays a run like a player would (inputs recorded against the step counter), stopping after `seconds`. */
function record(seed: number, seconds: number) {
  const w = new World(seed);
  const inputs: [number, -1 | 1][] = [];
  for (let i = 0; i < seconds * 60 && !w.over; i++) {
    if (i > 30 * 60 && i % 3 === 0) {
      // after 30 s the driver gets careless: random lane changes until the cascos run out
      const dir = (i / 3) % 2 ? 1 : -1;
      inputs.push([w.steps, dir]);
      w.move(dir);
    } else if (Math.abs(w.lanePos - w.laneTarget) < 1e-3) {
      const ents = w.entities.filter((e) => e.deadly && e.x + e.hb1 > w.dist - 30 && e.x < w.dist + 90).map(World.pred);
      const p = w.predPlayer();
      const path = planPath(p, predictFree(p, ents), w.laneTarget);
      if (path)
        for (let k = 1; k < path.length; k++)
          if (path[k][1] !== path[k - 1][1]) {
            if (path[k - 1][0] === 0) {
              const dir = path[k][1] > path[k - 1][1] ? 1 : -1;
              inputs.push([w.steps, dir]);
              w.move(dir);
            }
            break;
          }
    }
    w.step(SIM_STEP);
    w.events.length = 0;
  }
  return { w, inputs };
}

describe('El Tapón replays (server-side verification)', () => {
  it('expNeg matches Math.exp to double precision', () => {
    for (const x of [0, 1e-9, 0.01, 0.3, 1, 2.5, 7.3, 20, 100]) expect(Math.abs(expNeg(x) - Math.exp(-x)) / Math.exp(-x)).toBeLessThan(1e-12);
  });

  it('encodes inputs compactly and decodes them back', () => {
    const list: [number, -1 | 1][] = [
      [0, 1],
      [0, -1],
      [17, 1],
      [400, -1],
    ];
    const codes = encodeInputs(list);
    expect(codes).toEqual([1, -1, 18, -384]);
    expect(decodeInputs(codes)).toEqual(list);
    expect(decodeInputs([3, 0])).toBeNull();
  });

  it('a recorded run replays to exactly the same result; edited inputs or numbers do not', async () => {
    const { w, inputs } = record(4242, 90);
    expect(w.over).toBe(true);
    const claimed = { score: w.score, stats: w.finalStats(), steps: w.steps };
    const codes = encodeInputs(inputs);
    const r = await replayRun(4242, codes, w.steps + 1, { chunk: 60, pause: () => Promise.resolve() });
    expect(r).not.toBeNull();
    expect(sameResult(r!, claimed)).toBe(true);
    // another seed, a dropped input or a padded score are all caught
    expect(sameResult((await replayRun(4243, codes, w.steps + 1))!, claimed)).toBe(false);
    expect(sameResult((await replayRun(4242, codes.slice(0, -5), w.steps + 1))!, claimed)).toBe(false);
    expect(sameResult(r!, { ...claimed, score: claimed.score + 1 })).toBe(false);
  }, 120_000);
});
