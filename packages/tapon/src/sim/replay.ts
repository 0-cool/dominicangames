import type { TaponStats } from '@sd/shared';
import { World } from './world.ts';

/**
 * Run replays. The simulation is deterministic for a seed and a list of inputs applied at fixed step numbers
 * (it only uses exactly specified arithmetic, see config.expNeg), so the server can re-run a submitted run and
 * check that the score is real. Bump SIM_VERSION whenever a change alters how a run plays out.
 */
export const SIM_VERSION = 1;
/** The game always advances the world in steps of exactly 1/60 s. */
export const SIM_STEP = 1 / 60;

/** Inputs as [step, dir] pairs → compact numbers: sign = direction, |n| − 1 = steps since the previous input. */
export function encodeInputs(list: readonly (readonly [number, -1 | 1])[]): number[] {
  const out: number[] = [];
  let prev = 0;
  for (const [step, dir] of list) {
    out.push(dir * (step - prev + 1));
    prev = step;
  }
  return out;
}

export function decodeInputs(codes: readonly number[]): [number, -1 | 1][] | null {
  const out: [number, -1 | 1][] = [];
  let step = 0;
  for (const c of codes) {
    if (!Number.isInteger(c) || c === 0) return null;
    step += Math.abs(c) - 1;
    out.push([step, c > 0 ? 1 : -1]);
  }
  return out;
}

/** Records the player's inputs during a run (call `record` right where the game calls `world.move`). */
export class InputRecorder {
  private list: [number, -1 | 1][] = [];
  record(step: number, dir: -1 | 1) {
    this.list.push([step, dir]);
  }
  get count() {
    return this.list.length;
  }
  encode(): number[] {
    return encodeInputs(this.list);
  }
}

export interface ReplayResult {
  /** The run reached game over within the step budget. */
  over: boolean;
  steps: number;
  score: number;
  stats: TaponStats;
}

/**
 * Re-plays a run. `pause` (optional) is awaited every `chunk` steps so a server can keep serving requests while it
 * verifies a long run.
 */
export async function replayRun(seed: number, codes: readonly number[], maxSteps: number, opts: { chunk?: number; pause?: () => Promise<void> } = {}): Promise<ReplayResult | null> {
  const inputs = decodeInputs(codes);
  if (!inputs) return null;
  const w = new World(seed);
  const chunk = opts.chunk ?? 240;
  let i = 0;
  while (!w.over && w.steps < maxSteps) {
    while (i < inputs.length && inputs[i][0] === w.steps) w.move(inputs[i++][1]);
    // inputs must be in order and never point into the past
    if (i < inputs.length && inputs[i][0] < w.steps) return null;
    w.step(SIM_STEP);
    w.events.length = 0;
    if (opts.pause && w.steps % chunk === 0) await opts.pause();
  }
  return { over: w.over, steps: w.steps, score: w.score, stats: w.finalStats() };
}

/** True when a replay produced exactly the claimed result. */
export function sameResult(r: ReplayResult, claimed: { score: number; stats: TaponStats; steps: number }): boolean {
  if (!r.over || r.steps !== claimed.steps || r.score !== claimed.score) return false;
  const a = r.stats as unknown as Record<string, number>;
  const b = claimed.stats as unknown as Record<string, number>;
  return Object.keys(a).every((k) => a[k] === b[k]) && Object.keys(b).every((k) => a[k] === b[k]);
}
