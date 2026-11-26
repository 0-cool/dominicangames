import type { FastifyInstance } from 'fastify';
import type { AchievementView, Leaderboard } from '@sd/shared';
import type { Ctx } from '../app.ts';
import type { DB } from '../db/index.ts';

/**
 * DominicanGames Core ⇄ game integration contract (server side).
 *
 * Every game that runs on the platform is a module identified by its catalog id (`games.id`). The Core owns
 * identity, catalog, launch/session tracking, achievements, rankings, announcements and administration; a game
 * module only adds what is specific to that game. Register new modules in `games/index.ts`.
 * See docs/GAME_INTEGRATION.md.
 */
export interface AchievementDef extends Omit<AchievementView, 'unlockedAt' | 'gameId'> {
  /** Catalog id of the game, or null for platform achievements. */
  gameId: string | null;
  /** Hidden from players until they earn it (e.g. the legacy Fundador badge). */
  secret?: boolean;
}

export interface GameProgress {
  gameId: string;
  /** Short status line, e.g. “Misión 1 completada · 6 / 15 monumentos”. */
  summary: string;
  /** Label/value pairs rendered as stat tiles on the dashboard. */
  stats: { label: string; value: string }[];
  /** Per-mission / per-chapter progress. */
  milestones: { id: string; title: string; status: 'pending' | 'started' | 'completed' | 'failed'; detail?: string }[];
  /** 0–1 overall completion, when the game can estimate it. */
  completion: number | null;
  updatedAt: string | null;
}

export interface GameModule {
  /** Catalog id (must exist in the `games` table). */
  readonly id: string;
  /** Registers the game's own API (saves, assets, missions…). Guard every handler with `requireGameAccess`. */
  registerRoutes(app: FastifyInstance, ctx: Ctx): void;
  /** Achievements this game contributes to the platform. */
  readonly achievements: readonly AchievementDef[];
  /** Achievements the player has earned, with the time they were earned when known. */
  evaluateAchievements(db: DB, userId: string): Promise<{ id: string; at: Date | null }[]>;
  /** Progress summary for the player dashboard (null when the player never played). */
  progress(db: DB, userId: string): Promise<GameProgress | null>;
  /** Public leaderboards built from real player data (only players with show_in_rankings = true). */
  leaderboards?(db: DB, limit: number): Promise<Leaderboard[]>;
}
