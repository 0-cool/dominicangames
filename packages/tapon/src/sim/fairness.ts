import { FAIR, LANE_CHANGE_S } from '../config.ts';

/**
 * Fairness guarantee: "never an unavoidable crash".
 *
 * Before the game changes the road (a new vehicle, a lane change, a sudden stop, a dropped plantain, a closure…)
 * it asks `hasEscape` whether the player would still have at least one collision-free way through the next few
 * seconds, given their real lane-change time and a short reaction delay. If not, the change is skipped or
 * postponed. The model predicts every object with its current behaviour (constant speed, planned stops and lane
 * changes) and car-following (nobody drives through the car in front of it).
 */

/** What the model needs to know about one object on the road. */
export interface PredEnt {
  id?: number;
  /** Rear edge (m) and hitbox interval relative to it (m). */
  x: number;
  hb0: number;
  hb1: number;
  v: number;
  vCruise: number;
  /** Lane it is in (or moving to) and the lane it comes from while changing. */
  lane: number;
  laneFrom: number;
  /** Seconds before a planned lane change starts (−1: none) and its duration. */
  blinkLeft: number;
  changeLeft: number;
  changeDur: number;
  changeTo: number;
  /** Planned stop: seconds left stopped (counting the braking), −1 none. */
  stopLeft: number;
  isStatic: boolean;
}

export interface PredPlayer {
  /** Hitbox interval in absolute metres now. */
  x0: number;
  x1: number;
  v: number;
  /** Current acceleration (m/s²) and top speed: the moto keeps speeding up during a run. */
  a?: number;
  vMax?: number;
  lanePos: number;
  laneTarget: number;
}

const LANES = 3;

/** Lanes an object occupies at a given state (two while changing lane). */
function lanesOf(e: { lane: number; laneFrom: number; changing: boolean }): number[] {
  return e.changing && e.laneFrom !== e.lane ? [e.laneFrom, e.lane] : [e.lane];
}

interface SimEnt {
  x: number;
  hb0: number;
  hb1: number;
  v: number;
  vCruise: number;
  lane: number;
  laneFrom: number;
  changing: boolean;
  blinkLeft: number;
  changeLeft: number;
  changeDur: number;
  changeTo: number;
  stopLeft: number;
  isStatic: boolean;
}

/**
 * Blocked lanes for the player at each time step: `free[k][lane]`.
 * Exported for tests and for the bot.
 */
export function predictFree(player: PredPlayer, ents: PredEnt[], horizonS: number = FAIR.horizonS, dt: number = FAIR.stepS, margin: number = FAIR.margin): boolean[][] {
  const steps = Math.ceil(horizonS / dt);
  const sim: SimEnt[] = ents.map((e) => ({
    ...e,
    changing: e.changeLeft > 0,
  }));
  const free: boolean[][] = [];
  for (let k = 0; k <= steps; k++) {
    const t = k * dt;
    const tA = player.a && player.a > 0 ? Math.min(t, ((player.vMax ?? 99) - player.v) / player.a) : 0;
    const travel = player.v * t + 0.5 * (player.a ?? 0) * tA * tA + (player.a ?? 0) * tA * (t - tA);
    const px0 = player.x0 + travel - margin;
    const px1 = player.x1 + travel + margin;
    const row = [true, true, true];
    for (const e of sim) {
      const a = e.x + e.hb0;
      const b = e.x + e.hb1;
      if (b < px0 || a > px1) continue;
      for (const l of lanesOf(e)) row[l] = false;
    }
    free.push(row);
    if (k === steps) break;
    // advance the model by dt
    for (const e of sim) {
      if (e.isStatic) continue;
      if (e.stopLeft > 0) {
        e.v = Math.max(0, e.v - 9 * dt);
        e.stopLeft -= dt;
      } else if (e.v < e.vCruise) e.v = Math.min(e.vCruise, e.v + 2.5 * dt);
      if (e.blinkLeft > 0) {
        e.blinkLeft -= dt;
        if (e.blinkLeft <= 0) {
          e.laneFrom = e.lane;
          e.lane = e.changeTo;
          e.changing = true;
          e.changeLeft = e.changeDur;
        }
      } else if (e.changing) {
        e.changeLeft -= dt;
        if (e.changeLeft <= 0) e.changing = false;
      }
      e.x += e.v * dt;
    }
    followClamp(sim, (e) => lanesOf(e));
  }
  return free;
}

/** Gap kept behind the object in front (m). The world uses the very same rule, so predictions match. */
export const FOLLOW_GAP = 1.0;

/**
 * Car-following as a kinematic clamp: a vehicle never gets closer than FOLLOW_GAP to what is ahead of it in any
 * lane it occupies, and takes that object's speed when it catches up. Shared by the world and the model.
 */
export function followClamp<T extends { x: number; hb0: number; hb1: number; v: number; isStatic?: boolean }>(list: T[], lanes: (e: T) => number[]) {
  for (let l = 0; l < LANES; l++) {
    const inLane = list.filter((e) => lanes(e).includes(l)).sort((p, q) => q.x - p.x);
    for (let i = 1; i < inLane.length; i++) {
      const lead = inLane[i - 1];
      const e = inLane[i];
      if (e.isStatic) continue;
      const maxFront = lead.x + lead.hb0 - FOLLOW_GAP;
      if (e.x + e.hb1 > maxFront) {
        e.x = maxFront - e.hb1;
        e.v = Math.min(e.v, lead.v);
      }
    }
  }
}

/** Is there a collision-free way through the next `horizonS` seconds? */
export function hasEscape(player: PredPlayer, ents: PredEnt[], opts: { horizonS?: number; reactS?: number; margin?: number } = {}): boolean {
  const dt = FAIR.stepS;
  const free = predictFree(player, ents, opts.horizonS ?? FAIR.horizonS, dt, opts.margin ?? FAIR.margin);
  return pathFrom(player, free, Math.round((opts.reactS ?? FAIR.reactS) / dt)) !== null;
}

/**
 * Search lane states over time. Returns the path as [step, lane] pairs (a lane change starts at the step of the
 * pair before a lane switch), or null when every path crashes.
 */
export function pathFrom(player: PredPlayer, free: boolean[][], reactSteps: number): [number, number][] | null {
  const dt = FAIR.stepS;
  const N = free.length - 1;
  const m = Math.max(1, Math.ceil(LANE_CHANGE_S / dt));
  // reach[k][l] = previous state index for path reconstruction (−2 = unreached)
  const reach: number[][] = Array.from({ length: N + 1 }, () => [-2, -2, -2]);
  const allFree = (l: number, k0: number, k1: number) => {
    for (let k = k0; k <= Math.min(N, k1); k++) if (!free[k][l]) return false;
    return true;
  };
  const transitioning = Math.abs(player.lanePos - player.laneTarget) > 1e-3;
  if (transitioning) {
    const from = player.laneTarget > player.lanePos ? Math.floor(player.lanePos) : Math.ceil(player.lanePos);
    const k0 = Math.min(N, Math.ceil((Math.abs(player.laneTarget - player.lanePos) * LANE_CHANGE_S) / dt));
    if (!allFree(player.laneTarget, 0, k0) || !allFree(from, 0, k0)) return null;
    reach[k0][player.laneTarget] = -1;
  } else {
    const l = player.laneTarget;
    if (!free[0][l]) return null;
    reach[0][l] = -1;
  }
  for (let k = 0; k < N; k++) {
    for (let l = 0; l < 3; l++) {
      if (reach[k][l] === -2) continue;
      if (free[k + 1][l] && reach[k + 1][l] === -2) reach[k + 1][l] = k * 3 + l;
      if (k < reactSteps) continue;
      for (const l2 of [l - 1, l + 1]) {
        if (l2 < 0 || l2 > 2) continue;
        const k2 = Math.min(N, k + m);
        if (reach[k2][l2] !== -2) continue;
        if (allFree(l, k, k2) && allFree(l2, k, k2)) reach[k2][l2] = k * 3 + l;
      }
    }
  }
  // The last second of the horizon only has to be reachable: whatever comes after it is checked again (and
  // repaired) as time goes on, so objects entering at the very edge of the prediction don't count as traps.
  const end = Math.max(1, N - Math.round(1 / dt));
  const done = (k: number) => reach[k].some((v) => v !== -2);
  let last = N;
  while (last > end && !done(last)) last--;
  for (let l = 0; l < 3; l++) {
    if (reach[last][l] === -2) continue;
    // reconstruct the lane sequence
    const seq: [number, number][] = [];
    let k = last;
    let lane = l;
    while (k >= 0 && reach[k][lane] !== -1) {
      seq.push([k, lane]);
      const prev = reach[k][lane];
      k = Math.floor(prev / 3);
      lane = prev % 3;
    }
    seq.push([k, lane]);
    return seq.reverse();
  }
  return null;
}

/**
 * A driver's plan (attract-mode autopilot and test bots; the world itself only uses `pathFrom` to know that a way
 * out exists). Same model and rules as `pathFrom`, but it picks the escape with the fewest lane changes, ending in
 * `prefer` when that costs nothing more, so consecutive plans agree instead of zigzagging between equal lanes.
 * Returns [step, lane] pairs (a lane change appears as a jump of LANE_CHANGE_S worth of steps) or null.
 */
export function planPath(player: PredPlayer, free: boolean[][], prefer: number): [number, number][] | null {
  const dt = FAIR.stepS;
  const N = free.length - 1;
  const m = Math.max(1, Math.ceil(LANE_CHANGE_S / dt));
  const INF = 1e9;
  const cost: number[][] = Array.from({ length: N + 1 }, () => [INF, INF, INF]);
  const prev: number[][] = Array.from({ length: N + 1 }, () => [-2, -2, -2]);
  const allFree = (l: number, k0: number, k1: number) => {
    for (let k = k0; k <= Math.min(N, k1); k++) if (!free[k][l]) return false;
    return true;
  };
  let k0 = 0;
  if (Math.abs(player.lanePos - player.laneTarget) > 1e-3) {
    const from = player.laneTarget > player.lanePos ? Math.floor(player.lanePos) : Math.ceil(player.lanePos);
    k0 = Math.min(N, Math.ceil((Math.abs(player.laneTarget - player.lanePos) * LANE_CHANGE_S) / dt));
    if (!allFree(player.laneTarget, 0, k0) || !allFree(from, 0, k0)) return null;
  } else if (!free[0][player.laneTarget]) return null;
  cost[k0][player.laneTarget] = 0;
  prev[k0][player.laneTarget] = -1;
  for (let k = k0; k < N; k++) {
    for (let l = 0; l < 3; l++) {
      const c = cost[k][l];
      if (c >= INF) continue;
      if (free[k + 1][l] && c < cost[k + 1][l]) {
        cost[k + 1][l] = c;
        prev[k + 1][l] = k * 3 + l;
      }
      for (const l2 of [l - 1, l + 1]) {
        if (l2 < 0 || l2 > 2) continue;
        const k2 = Math.min(N, k + m);
        if (c + 1 < cost[k2][l2] && allFree(l, k, k2) && allFree(l2, k, k2)) {
          cost[k2][l2] = c + 1;
          prev[k2][l2] = k * 3 + l;
        }
      }
    }
  }
  const end = Math.max(1, N - Math.round(1 / dt));
  let last = N;
  while (last > end && cost[last].every((c) => c >= INF)) last--;
  let best = -1;
  for (const l of [prefer, ...[0, 1, 2].filter((x) => x !== prefer)]) if (cost[last][l] < INF && (best < 0 || cost[last][l] < cost[last][best])) best = l;
  if (best < 0) return null;
  const seq: [number, number][] = [];
  let k = last;
  let lane = best;
  while (k >= 0 && prev[k][lane] !== -1) {
    seq.push([k, lane]);
    const pv = prev[k][lane];
    k = Math.floor(pv / 3);
    lane = pv % 3;
  }
  seq.push([k, lane]);
  return seq.reverse();
}
