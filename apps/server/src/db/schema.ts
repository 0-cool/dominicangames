import { sql } from 'drizzle-orm';
import { boolean, char, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['user', 'admin']);
export const userStatus = pgEnum('user_status', ['active', 'suspended']);
export const paymentStatus = pgEnum('payment_status', ['created', 'pending', 'succeeded', 'failed', 'canceled', 'refunded']);
export const accessStatus = pgEnum('access_status', ['active', 'revoked']);
export const tokenType = pgEnum('token_type', ['verify_email', 'reset_password']);
/** DominicanGames catalog: published = playable by everyone · development = playable by admins only (QA) ·
 *  coming_soon = listed as “Próximamente”, never playable · hidden = not listed, not playable. */
export const gameStatus = pgEnum('game_status', ['published', 'development', 'coming_soon', 'hidden']);

/** Santo Domingo Open World — the first DominicanGames title (catalog id). */
export const SDOW_GAME_ID = 'santo-domingo-open-world';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 254 }).notNull().unique(),
  username: varchar('username', { length: 24 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  emailVerifiedAt: ts('email_verified_at'),
  role: userRole('role').notNull().default('user'),
  status: userStatus('status').notNull().default('active'),
  suspendedReason: text('suspended_reason'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  lastLoginAt: ts('last_login_at'),
  /** Preset avatar id (see @sd/shared AVATARS); null = initials avatar. */
  avatar: varchar('avatar', { length: 32 }),
  showInRankings: boolean('show_in_rankings').notNull().default(true),
  locale: varchar('locale', { length: 5 }).notNull().default('es'),
});

// ───────────── DominicanGames Core: game catalog ─────────────
export interface GameTheme {
  /** Main accent colour of the game's identity (hex). */
  accent: string;
  /** Secondary accent (hex), used for gradients. */
  accent2?: string;
  /** Key for original concept art rendered by the web client when no cover image exists. */
  art?: string;
}
export interface GameScreenshot {
  src: string;
  alt: string;
}

export const games = pgTable(
  'games',
  {
    id: varchar('id', { length: 64 }).primaryKey(), // URL slug, e.g. santo-domingo-open-world
    title: varchar('title', { length: 80 }).notNull(),
    tagline: varchar('tagline', { length: 160 }).notNull().default(''),
    description: text('description').notNull().default(''),
    status: gameStatus('status').notNull().default('coming_soon'),
    featured: boolean('featured').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(100),
    categories: jsonb('categories').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    platforms: jsonb('platforms').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    developer: varchar('developer', { length: 80 }).notNull().default('DominicanGames'),
    publisher: varchar('publisher', { length: 80 }).notNull().default('DominicanGames'),
    releaseLabel: varchar('release_label', { length: 60 }).notNull().default(''),
    /** Internal SPA route that launches the game (null when the game is not playable yet). */
    launchPath: varchar('launch_path', { length: 200 }),
    coverImage: varchar('cover_image', { length: 300 }),
    heroImage: varchar('hero_image', { length: 300 }),
    screenshots: jsonb('screenshots').$type<GameScreenshot[]>().notNull().default(sql`'[]'::jsonb`),
    theme: jsonb('theme').$type<GameTheme>().notNull().default(sql`'{"accent":"#ff2e4d"}'::jsonb`),
    /** Visitors may play without an account (arcade games such as El Tapón). */
    guestPlay: boolean('guest_play').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('games_status_idx').on(t.status, t.sortOrder)],
);

/** One row per game launch: “recently played”, “continue playing” and basic analytics. */
export const gameSessions = pgTable(
  'game_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    gameId: varchar('game_id', { length: 64 }).notNull().references(() => games.id, { onDelete: 'cascade' }),
    startedAt: ts('started_at').notNull().defaultNow(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    endedAt: ts('ended_at'),
  },
  (t) => [index('game_sessions_user_idx').on(t.userId, t.startedAt), index('game_sessions_game_idx').on(t.gameId, t.startedAt)],
);

/** Platform + per-game achievements unlocked by a player (first unlock time is kept). */
export const userAchievements = pgTable(
  'user_achievements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    achievementId: varchar('achievement_id', { length: 64 }).notNull(),
    gameId: varchar('game_id', { length: 64 }).references(() => games.id, { onDelete: 'cascade' }),
    unlockedAt: ts('unlocked_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('user_achievements_user_ach_uq').on(t.userId, t.achievementId)],
);

/** Community announcements, managed from the admin panel. */
export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 120 }).notNull(),
    body: text('body').notNull(),
    gameId: varchar('game_id', { length: 64 }).references(() => games.id, { onDelete: 'set null' }),
    linkUrl: varchar('link_url', { length: 300 }),
    linkLabel: varchar('link_label', { length: 40 }),
    published: boolean('published').notNull().default(true),
    pinned: boolean('pinned').notNull().default(false),
    publishedAt: ts('published_at').notNull().defaultNow(),
    createdBy: uuid('created_by'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('announcements_published_idx').on(t.published, t.publishedAt)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: varchar('id', { length: 64 }).primaryKey(), // SHA-256 of the opaque cookie token
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    ip: varchar('ip', { length: 64 }),
    userAgent: varchar('user_agent', { length: 300 }),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)],
);

export const emailTokens = pgTable(
  'email_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: tokenType('type').notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    expiresAt: ts('expires_at').notNull(),
    usedAt: ts('used_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('email_tokens_user_idx').on(t.userId, t.type)],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    provider: varchar('provider', { length: 32 }).notNull(),
    providerReference: varchar('provider_reference', { length: 128 }).unique(),
    idempotencyKey: varchar('idempotency_key', { length: 64 }).notNull().unique(),
    amount: integer('amount').notNull(), // minor units (centavos)
    itbis: integer('itbis').notNull().default(0),
    currency: char('currency', { length: 3 }).notNull(),
    status: paymentStatus('status').notNull().default('created'),
    paidAt: ts('paid_at'),
    failureReason: text('failure_reason'),
    refundedAt: ts('refunded_at'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('payments_user_idx').on(t.userId), index('payments_status_idx').on(t.status)],
);

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 32 }).notNull(),
    eventId: varchar('event_id', { length: 128 }).notNull(),
    paymentId: uuid('payment_id').references(() => payments.id),
    type: varchar('type', { length: 64 }).notNull(),
    payload: jsonb('payload').notNull(),
    receivedAt: ts('received_at').notNull().defaultNow(),
    processedAt: ts('processed_at'),
  },
  (t) => [uniqueIndex('webhook_events_provider_event_uq').on(t.provider, t.eventId)],
);

/**
 * LEGACY (pre-DominicanGames): lifetime RD$100 access purchases. Access to Santo Domingo Open World is free now;
 * this table is kept as the historical record of those purchases (they unlock the “Fundador” achievement) and as
 * the entitlement pattern DG Monetization can reuse for optional products. It never gates gameplay.
 */
export const gameAccess = pgTable('game_access', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  accessStatus: accessStatus('access_status').notNull(),
  accessType: varchar('access_type', { length: 32 }).notNull().default('LIFETIME'),
  activatedAt: ts('activated_at').notNull().defaultNow(),
  revokedAt: ts('revoked_at'),
  paymentId: uuid('payment_id').references(() => payments.id),
});

export const playerSaves = pgTable(
  'player_saves',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    gameId: varchar('game_id', { length: 64 }).notNull().references(() => games.id, { onDelete: 'cascade' }),
    saveData: jsonb('save_data').notNull(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('player_saves_user_game_uq').on(t.userId, t.gameId)],
);

export const missionProgress = pgTable(
  'mission_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    gameId: varchar('game_id', { length: 64 }).notNull().references(() => games.id, { onDelete: 'cascade' }),
    missionId: varchar('mission_id', { length: 40 }).notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    stats: jsonb('stats').$type<Record<string, number>>(),
    startedAt: ts('started_at').notNull().defaultNow(),
    completedAt: ts('completed_at'),
  },
  (t) => [uniqueIndex('mission_progress_user_game_mission_uq').on(t.userId, t.gameId, t.missionId)],
);

export const gameSettings = pgTable(
  'game_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    gameId: varchar('game_id', { length: 64 }).notNull().references(() => games.id, { onDelete: 'cascade' }),
    settingsJson: jsonb('settings_json').notNull(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('game_settings_user_game_uq').on(t.userId, t.gameId)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id'),
    action: varchar('action', { length: 64 }).notNull(),
    targetType: varchar('target_type', { length: 32 }),
    targetId: varchar('target_id', { length: 64 }),
    ip: varchar('ip', { length: 64 }),
    details: jsonb('details').$type<Record<string, unknown>>(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('audit_logs_created_idx').on(t.createdAt), index('audit_logs_target_idx').on(t.targetType, t.targetId)],
);

export const errorLogs = pgTable(
  'error_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: varchar('source', { length: 16 }).notNull(),
    message: text('message').notNull(),
    stack: text('stack'),
    context: jsonb('context').$type<Record<string, unknown>>(),
    userId: uuid('user_id'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('error_logs_created_idx').on(t.createdAt)],
);

export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  email: varchar('email', { length: 254 }).notNull(),
  category: varchar('category', { length: 24 }).notNull(),
  subject: varchar('subject', { length: 120 }).notNull(),
  message: text('message').notNull(),
  status: varchar('status', { length: 16 }).notNull().default('open'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 254 }).notNull(),
    ip: varchar('ip', { length: 64 }),
    success: boolean('success').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('login_attempts_email_idx').on(t.email, t.createdAt), index('login_attempts_ip_idx').on(t.ip, t.createdAt)],
);

export const devEmails = pgTable('dev_emails', {
  id: uuid('id').primaryKey().defaultRandom(),
  to: varchar('to', { length: 254 }).notNull(),
  subject: varchar('subject', { length: 200 }).notNull(),
  text: text('text').notNull(),
  html: text('html').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/**
 * Arcade runs (El Tapón and future arcade games): one row per started run. Guests can play and enter the
 * high-score table with a nickname; accounts appear with their username. A run can only be finished once, with
 * the secret returned when it started; the server checks the numbers (packages/shared/src/tapon.ts) and replays
 * the runs that would enter the table or unlock achievements (games/el-tapon/verify.ts).
 */
export const arcadeRuns = pgTable(
  'arcade_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gameId: varchar('game_id', { length: 64 })
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    /** Account that played the run; null for guests. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /** Nickname a guest chose for the high-score table. */
    guestName: varchar('guest_name', { length: 20 }),
    /** Seed issued by the server: the run can be replayed from it and the recorded inputs. */
    seed: integer('seed').notNull(),
    simVersion: integer('sim_version').notNull(),
    secretHash: char('secret_hash', { length: 64 }).notNull(),
    /** Keyed hash of the client IP (rate limiting only; the IP itself is never stored). */
    ipHash: char('ip_hash', { length: 64 }),
    /** started → saved | pending → verified | rejected (see games/el-tapon/api.ts). */
    status: varchar('status', { length: 12 }).notNull().default('started'),
    /** Hidden from the public tables by an administrator (moderation). */
    hidden: boolean('hidden').notNull().default(false),
    score: integer('score'),
    distanceM: integer('distance_m'),
    durationMs: integer('duration_ms'),
    stats: jsonb('stats').$type<Record<string, number>>(),
    /** { steps, inputs } recorded by the game, kept until the run is verified or rejected. */
    replay: jsonb('replay').$type<{ steps: number; inputs: number[] } | null>(),
    rejectReasons: jsonb('reject_reasons').$type<string[]>(),
    startedAt: ts('started_at').notNull().defaultNow(),
    finishedAt: ts('finished_at'),
    verifiedAt: ts('verified_at'),
  },
  (t) => [index('arcade_runs_board_idx').on(t.gameId, t.status, t.score), index('arcade_runs_user_idx').on(t.userId, t.gameId), index('arcade_runs_ip_idx').on(t.ipHash, t.startedAt)],
);
