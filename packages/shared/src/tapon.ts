import { z } from 'zod';

/**
 * El Tapón — contract shared by the game (packages/tapon), the web client and the server: run statistics,
 * scoring rules and the limits the server uses to reject impossible scores.
 */
export const TAPON_GAME_ID = 'el-tapon';

/** Points per bonus event (before the combo multiplier). See docs/EL_TAPON.md §2. */
export const TAPON_POINTS = {
  overtake: 5,
  closeCall: 50,
  squeeze: 75,
  plantainDodged: 10,
  passenger: 100,
  rideCompleted: 300,
} as const;

/** Highest combo multiplier and the physical limits of the game (used for plausibility checks). */
export const TAPON_LIMITS = {
  maxMultiplier: 5,
  /** The moto never goes faster than this (m/s); the client caps at 21 m/s. */
  maxSpeedMs: 23,
  maxLives: 3,
} as const;

const count = (max: number) => z.number().int().min(0).max(max);

export const taponStatsSchema = z.object({
  distanceM: count(500_000),
  /** Active play time (pauses excluded). */
  durationMs: count(6 * 3600_000),
  overtakes: count(200_000),
  closeCalls: count(50_000),
  squeezes: count(50_000),
  plantainsDodged: count(50_000),
  passengers: count(10_000),
  ridesCompleted: count(10_000),
  crashes: count(1000),
  /** Cascos picked up (each one gives back a life). */
  helmets: count(1000),
  potholes: count(10_000),
  closuresPassed: count(10_000),
  maxCombo: count(10_000),
});
export type TaponStats = z.infer<typeof taponStatsSchema>;

/** Base (×1) bonus points of a run. */
export function taponBaseBonus(s: TaponStats): number {
  const P = TAPON_POINTS;
  return (
    s.overtakes * P.overtake +
    s.closeCalls * P.closeCall +
    s.squeezes * P.squeeze +
    s.plantainsDodged * P.plantainDodged +
    s.passengers * P.passenger +
    s.ridesCompleted * P.rideCompleted
  );
}

/** A run's score must lie between these bounds (all bonuses at ×1 … all at the highest multiplier). */
export function taponScoreBounds(s: TaponStats): { min: number; max: number } {
  const base = taponBaseBonus(s);
  return { min: s.distanceM + base, max: s.distanceM + base * TAPON_LIMITS.maxMultiplier };
}

/**
 * Problems that make a run impossible (empty list = plausible). `elapsedMs` is server time since the run was
 * registered. Rates are generous upper bounds of what the game can produce (measured with a perfect bot and the
 * spawn rules); runs that enter the high-score table are also replayed on the server (sim/replay.ts).
 */
export function taponImplausible(score: number, s: TaponStats, elapsedMs: number): string[] {
  const out: string[] = [];
  const { min, max } = taponScoreBounds(s);
  const sec = s.durationMs / 1000;
  if (score < min || score > max) out.push('score_out_of_bounds');
  if (s.durationMs > elapsedMs + 5000) out.push('duration_longer_than_run');
  if (s.distanceM > sec * TAPON_LIMITS.maxSpeedMs + 50) out.push('too_fast');
  if (s.crashes > TAPON_LIMITS.maxLives + s.helmets) out.push('too_many_crashes');
  if (s.ridesCompleted > s.passengers) out.push('rides_without_passengers');
  if (s.squeezes > s.overtakes) out.push('squeezes_without_overtakes');
  // special events (passengers, cascos, closures, potholes) come at most every 3.2 s
  const events = sec / 3 + 3;
  if (s.passengers > events || s.helmets > events || s.closuresPassed > events || s.potholes > events * 3) out.push('too_many_events');
  if (s.overtakes > sec * 6 + 20 || s.closeCalls > sec * 2 + 10 || s.plantainsDodged > sec * 1.5 + 10) out.push('too_many_bonuses');
  // the combo only grows with these bonuses
  if (s.maxCombo > s.closeCalls + s.squeezes + s.plantainsDodged + s.passengers + s.ridesCompleted) out.push('combo_out_of_bounds');
  return out;
}

/** Longest run the server replays (longer runs are kept but never enter the table). */
export const TAPON_MAX_VERIFY_MS = 60 * 60_000;

/** What the game recorded to let the server re-play the run (inputs encoded by packages/tapon sim/replay.ts). */
export const taponReplaySchema = z.object({
  simVersion: z.number().int().min(1).max(1000),
  steps: z.number().int().min(1).max(6 * 3600 * 60),
  inputs: z.array(z.number().int().min(-1_000_000).max(1_000_000).refine((n) => n !== 0)).max(40_000),
});

/** Nickname for guests in the high-score table. */
export const guestNameSchema = z
  .string()
  .trim()
  .min(3, 'Mínimo 3 caracteres')
  .max(16, 'Máximo 16 caracteres')
  .regex(/^[\p{L}\p{N} _.-]+$/u, 'Solo letras, números, espacios, punto, guion y guion bajo');

export const taponFinishSchema = z.object({
  secret: z.string().min(20).max(100),
  score: z.number().int().min(0).max(50_000_000),
  stats: taponStatsSchema,
  replay: taponReplaySchema,
  /** Only for guests (accounts appear with their username). */
  guestName: guestNameSchema.optional(),
});
export type TaponFinishInput = z.infer<typeof taponFinishSchema>;

export interface TaponLeaderboardEntry {
  rank: number;
  name: string;
  avatar: string | null;
  guest: boolean;
  score: number;
  distanceM: number;
  at: string;
}

/** A run registered by the server: its seed makes the run replayable; the secret proves who started it. */
export interface TaponRunTicket {
  runId: string;
  secret: string;
  seed: number;
  simVersion: number;
}

/**
 * Result of submitting a run.
 *  - verified: replayed on the server, counts for the table and achievements;
 *  - pending: will be replayed shortly (shows up in the table once verified);
 *  - saved: kept in the player's history but not a candidate for the table (not a personal best / too low);
 *  - rejected: impossible or the replay does not match.
 */
export interface TaponFinishResult {
  status: 'verified' | 'pending' | 'saved' | 'rejected';
  /** Position in the all-time table (verified personal bests only). */
  rank: number | null;
  /** Position in this week's table. */
  weekRank: number | null;
  /** Best verified score of this player (account or guest nickname). */
  personalBest: number | null;
  /** Achievements unlocked by this run (accounts only). */
  unlocked: { id: string; title: string }[];
  reasons?: string[];
}

export interface TaponLeaderboard {
  period: 'all' | 'week';
  entries: TaponLeaderboardEntry[];
  /** The signed-in player's best and position (null for guests or players without a verified run). */
  me: { best: number; rank: number | null } | null;
}
