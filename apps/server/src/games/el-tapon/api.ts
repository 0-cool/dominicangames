import { randomInt } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, desc, eq, gt, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { TAPON_GAME_ID, TAPON_MAX_VERIFY_MS, taponFinishSchema, taponImplausible, type TaponFinishResult, type TaponLeaderboard, type TaponLeaderboardEntry, type TaponRunTicket, type TaponStats } from '@sd/shared';
import { SIM_VERSION } from '@sd/tapon/sim';
import type { Ctx } from '../../app.ts';
import type { DB } from '../../db/index.ts';
import { arcadeRuns, userAchievements, users } from '../../db/schema.ts';
import { HttpError, badRequest, conflict, forbidden, notFound, unauthorized } from '../../lib/errors.ts';
import { hmacSha256, randomToken, safeEqual, sha256 } from '../../lib/crypto.ts';
import { limit } from '../../lib/limits.ts';
import { requireAdmin, type AuthUser } from '../../plugins/security.ts';
import { isPlayable, type GameRow } from '../../platform/catalog.ts';
import { syncAchievements } from '../../platform/achievements.ts';
import { audit } from '../../services/audit.ts';
import { nickProblem } from './names.ts';
import { ReplayVerifier } from './verify.ts';

const GAME = TAPON_GAME_ID;
const uuid = z.uuid();
/** How many places of each table are worth a replay check. */
const TABLE_SIZE = 100;
/** How long the finish request waits for the replay before answering “pending”. */
const VERIFY_WAIT_MS = 8000;
const runAgeLimitMs = 6 * 3600_000 + 10 * 60_000;

/** Who may play: guests when the catalog entry allows guest play, accounts when the game is playable for them. */
async function arcadeAccess(req: FastifyRequest, ctx: Ctx): Promise<{ user: AuthUser | null; game: GameRow }> {
  const user = req.user;
  if (user?.status === 'suspended') throw forbidden('suspended', 'Tu cuenta está suspendida. Contacta a soporte.');
  const game = await ctx.catalog.get(GAME);
  if (game && (user ? isPlayable(game, user) : game.guestPlay && isPlayable(game, null))) return { user, game };
  if (game && !user && game.status === 'published' && game.launchPath) throw unauthorized('Inicia sesión para jugar.');
  throw forbidden('game_unavailable', 'Este juego todavía no está disponible.');
}

/** Best verified, visible run per player (accounts that show in rankings + guests with a nickname). */
function bestsSql(week: boolean): SQL {
  return sql`
    select distinct on (x.pk) x.pk, x.user_id, x.guest_name, x.score, x.distance_m, x.finished_at
    from (
      select coalesce(r.user_id::text, 'g:' || lower(r.guest_name)) as pk, r.user_id, r.guest_name, r.score, r.distance_m, r.finished_at
      from arcade_runs r
      left join users u on u.id = r.user_id
      where r.game_id = ${GAME} and r.status = 'verified' and not r.hidden
        and (r.user_id is null or (u.show_in_rankings and u.status = 'active'))
        and (r.user_id is not null or r.guest_name is not null)
        ${week ? sql`and r.finished_at > now() - interval '7 days'` : sql``}
    ) x
    order by x.pk, x.score desc, x.finished_at asc`;
}

interface BestRow extends Record<string, unknown> {
  user_id: string | null;
  guest_name: string | null;
  score: number;
  distance_m: number;
  finished_at: Date | string;
  username: string | null;
  avatar: string | null;
}

export async function taponTable(db: DB, week: boolean, n: number): Promise<TaponLeaderboardEntry[]> {
  const r = await db.execute<BestRow>(sql`select b.*, u.username, u.avatar from (${bestsSql(week)}) b left join users u on u.id = b.user_id order by b.score desc, b.finished_at asc limit ${n}`);
  const out: TaponLeaderboardEntry[] = [];
  r.rows.forEach((row, i) => {
    const prev = out[i - 1];
    out.push({
      rank: prev && prev.score === Number(row.score) ? prev.rank : i + 1,
      name: row.user_id ? (row.username ?? '—') : (row.guest_name ?? '—'),
      avatar: row.user_id ? row.avatar : null,
      guest: !row.user_id,
      score: Number(row.score),
      distanceM: Number(row.distance_m),
      at: new Date(row.finished_at).toISOString(),
    });
  });
  return out;
}

/** Position a score would have in a table (ties share the place). */
async function rankOf(db: DB, week: boolean, score: number): Promise<number> {
  const r = await db.execute<{ n: number }>(sql`select count(*)::int as n from (${bestsSql(week)}) b where b.score > ${score}`);
  return Number(r.rows[0]?.n ?? 0) + 1;
}

/** Score of the last place of a full table (null while the table has room). */
async function cutOf(db: DB, week: boolean): Promise<number | null> {
  const r = await db.execute<{ score: number }>(sql`select b.score from (${bestsSql(week)}) b order by b.score desc offset ${TABLE_SIZE - 1} limit 1`);
  return r.rows[0] ? Number(r.rows[0].score) : null;
}

/** A player's best verified score (account, or guest nickname), optionally only this week. */
async function bestOf(db: DB, who: { userId: string | null; guestName: string | null }, week: boolean): Promise<number | null> {
  const owner = who.userId ? eq(arcadeRuns.userId, who.userId) : and(isNull(arcadeRuns.userId), sql`lower(${arcadeRuns.guestName}) = lower(${who.guestName ?? ''})`);
  const [r] = await db
    .select({ best: sql<number | null>`max(${arcadeRuns.score})` })
    .from(arcadeRuns)
    .where(and(eq(arcadeRuns.gameId, GAME), eq(arcadeRuns.status, 'verified'), eq(arcadeRuns.hidden, false), owner, week ? sql`${arcadeRuns.finishedAt} > now() - interval '7 days'` : undefined));
  return r?.best === null || r?.best === undefined ? null : Number(r.best);
}

export interface TaponRunCheck {
  /** Achievement ids a single run with these numbers earns. */
  achievementsFor(run: { score: number; stats: TaponStats }): string[];
  readonly achievements: readonly { id: string; title: string }[];
}

/**
 * El Tapón — arcade API. Guests and accounts register a run (seed + secret), play it in the browser and submit the
 * result once. Every submission is checked for plausibility; the ones that would enter the high-score tables or
 * unlock achievements are replayed on the server before they count. Administrators can hide entries.
 */
export function registerTaponApi(app: FastifyInstance, ctx: Ctx, rules: TaponRunCheck) {
  const { db, cfg } = ctx;
  const verifier = new ReplayVerifier(db, GAME);
  app.addHook('onReady', async () => verifier.kick());
  app.addHook('onClose', async () => verifier.stop());
  const ipHash = (req: FastifyRequest) => hmacSha256(cfg.CSRF_SECRET, `arcade-ip:${req.ip}`);
  let lastCleanup = 0;
  // Public high-score tables, cached briefly (every game-over screen asks for them); cleared when a run counts.
  const cache = new Map<string, { at: number; entries: TaponLeaderboardEntry[] }>();

  app.post('/api/arcade/el-tapon/runs', { config: limit(cfg, 40, '1 minute') }, async (req, reply) => {
    const { user } = await arcadeAccess(req, ctx);
    const ip = ipHash(req);
    const [recent] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(arcadeRuns)
      .where(and(eq(arcadeRuns.ipHash, ip), gt(arcadeRuns.startedAt, new Date(Date.now() - 3600_000))));
    if ((recent?.n ?? 0) >= Math.ceil(300 * cfg.RATE_LIMIT_SCALE)) throw new HttpError(429, 'rate_limited', 'Demasiadas partidas seguidas. Descansa un momento.');
    if (Date.now() - lastCleanup > 10 * 60_000) {
      lastCleanup = Date.now();
      // runs that were registered but never finished (closed tab, restarted run…)
      await db.delete(arcadeRuns).where(and(eq(arcadeRuns.status, 'started'), sql`${arcadeRuns.startedAt} < now() - interval '1 day'`));
    }
    const secret = randomToken(24);
    const seed = randomInt(1, 2 ** 31 - 1);
    const [row] = await db.insert(arcadeRuns).values({ gameId: GAME, userId: user?.id ?? null, seed, simVersion: SIM_VERSION, secretHash: sha256(secret), ipHash: ip }).returning({ id: arcadeRuns.id });
    reply.code(201);
    return { runId: row.id, secret, seed, simVersion: SIM_VERSION } satisfies TaponRunTicket;
  });

  app.post<{ Params: { id: string } }>('/api/arcade/el-tapon/runs/:id/finish', { bodyLimit: 512 * 1024, config: limit(cfg, 30, '1 minute') }, async (req): Promise<TaponFinishResult> => {
    if (!uuid.safeParse(req.params.id).success) throw notFound('Partida no encontrada.');
    const body = taponFinishSchema.parse(req.body);
    const [run] = await db.select().from(arcadeRuns).where(and(eq(arcadeRuns.id, req.params.id), eq(arcadeRuns.gameId, GAME)));
    if (!run || !safeEqual(sha256(body.secret), run.secretHash)) throw notFound('Partida no encontrada.');
    if (run.userId && req.user?.id !== run.userId) throw forbidden('not_your_run', 'Esta partida es de otra cuenta.');
    await arcadeAccess(req, ctx);
    if (run.status !== 'started') throw conflict('already_finished', 'Esta partida ya se guardó.');
    if (body.replay.simVersion !== run.simVersion || run.simVersion !== SIM_VERSION) throw conflict('old_version', 'Hay una versión nueva de El Tapón. Recarga la página para que tus próximas partidas cuenten.');

    // guests appear with a nickname: checked before anything is stored, so they can pick another one
    const guestName = run.userId ? null : (body.guestName ?? null);
    if (!run.userId) {
      if (!guestName) throw badRequest('guest_name_required', 'Escribe un apodo para la tabla de récords.');
      const problem = nickProblem(guestName);
      if (problem) throw badRequest('guest_name_invalid', problem === 'reserved' ? 'Ese apodo está reservado. Elige otro.' : 'Ese apodo no está permitido. Elige otro.');
      const [taken] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.username}) = lower(${guestName})`);
      if (taken) throw conflict('guest_name_taken', 'Ese apodo es el nombre de una cuenta registrada. Elige otro o entra con tu cuenta.');
    }

    const s = body.stats;
    const elapsed = Date.now() - run.startedAt.getTime();
    const reasons = taponImplausible(body.score, s, elapsed);
    if (Math.abs((body.replay.steps * 1000) / 60 - s.durationMs) > 50) reasons.push('steps_mismatch');
    if (elapsed > runAgeLimitMs) reasons.push('expired');
    const base = { score: body.score, distanceM: s.distanceM, durationMs: s.durationMs, stats: s as unknown as Record<string, number>, guestName, finishedAt: new Date() };
    const who = { userId: run.userId, guestName };
    if (reasons.length) {
      await db.update(arcadeRuns).set({ ...base, status: 'rejected', rejectReasons: reasons }).where(eq(arcadeRuns.id, run.id));
      req.log.warn({ runId: run.id, reasons }, 'el-tapon run rejected');
      return { status: 'rejected', rank: null, weekRank: null, personalBest: await bestOf(db, who, false), unlocked: [], reasons };
    }

    // Is this run worth a replay? Personal bests that make one of the tables, or new achievements.
    const [best, weekBest, cut, weekCut] = await Promise.all([bestOf(db, who, false), bestOf(db, who, true), cutOf(db, false), cutOf(db, true)]);
    const table = (best === null || body.score > best) && (cut === null || body.score > cut);
    const weekTable = (weekBest === null || body.score > weekBest) && (weekCut === null || body.score > weekCut);
    let newAchievements: string[] = [];
    if (run.userId) {
      const have = new Set((await db.select({ id: userAchievements.achievementId }).from(userAchievements).where(eq(userAchievements.userId, run.userId))).map((r) => r.id));
      newAchievements = rules.achievementsFor({ score: body.score, stats: s }).filter((id) => !have.has(id));
    }
    const eligible = (table || weekTable || newAchievements.length > 0) && s.durationMs <= TAPON_MAX_VERIFY_MS;
    if (!eligible) {
      await db.update(arcadeRuns).set({ ...base, status: 'saved' }).where(eq(arcadeRuns.id, run.id));
      return { status: 'saved', rank: null, weekRank: null, personalBest: best, unlocked: [] };
    }
    const [busy] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(arcadeRuns)
      .where(and(eq(arcadeRuns.gameId, GAME), eq(arcadeRuns.status, 'pending'), eq(arcadeRuns.ipHash, run.ipHash ?? '')));
    if ((busy?.n ?? 0) >= 5) throw new HttpError(429, 'verify_busy', 'Estamos verificando tus partidas anteriores. Intenta guardar de nuevo en un minuto.');

    await db
      .update(arcadeRuns)
      .set({ ...base, status: 'pending', replay: { steps: body.replay.steps, inputs: body.replay.inputs } })
      .where(eq(arcadeRuns.id, run.id));
    const outcome = await verifier.wait(run.id, VERIFY_WAIT_MS);
    if (outcome === null) return { status: 'pending', rank: null, weekRank: null, personalBest: best, unlocked: [] };
    if (outcome !== 'verified') {
      const [row] = await db.select({ reasons: arcadeRuns.rejectReasons }).from(arcadeRuns).where(eq(arcadeRuns.id, run.id));
      return { status: outcome === 'rejected' ? 'rejected' : 'saved', rank: null, weekRank: null, personalBest: best, unlocked: [], reasons: row?.reasons ?? undefined };
    }
    cache.clear();
    let unlocked: { id: string; title: string }[] = [];
    if (run.userId) {
      await syncAchievements(db, ctx.modules, run.userId);
      unlocked = rules.achievements.filter((a) => newAchievements.includes(a.id)).map((a) => ({ id: a.id, title: a.title }));
    }
    const [pb, wpb] = await Promise.all([bestOf(db, who, false), bestOf(db, who, true)]);
    const visible = !run.userId || (req.user?.showInRankings ?? false);
    return {
      status: 'verified',
      rank: visible && pb !== null ? await rankOf(db, false, pb) : null,
      weekRank: visible && wpb !== null ? await rankOf(db, true, wpb) : null,
      personalBest: pb,
      unlocked,
    };
  });

  app.get<{ Querystring: { period?: string; limit?: string } }>('/api/arcade/el-tapon/leaderboard', { config: limit(cfg, 120, '1 minute') }, async (req): Promise<TaponLeaderboard> => {
    const period = req.query.period === 'week' ? 'week' : 'all';
    const n = Math.min(TABLE_SIZE, Math.max(1, Number.parseInt(req.query.limit ?? '10', 10) || 10));
    const key = `${period}:${n}`;
    let hit = cache.get(key);
    if (!hit || Date.now() - hit.at > 5000) {
      hit = { at: Date.now(), entries: await taponTable(db, period === 'week', n) };
      cache.set(key, hit);
    }
    let me: TaponLeaderboard['me'] = null;
    if (req.user) {
      const best = await bestOf(db, { userId: req.user.id, guestName: null }, period === 'week');
      if (best !== null) me = { best, rank: req.user.showInRankings ? await rankOf(db, period === 'week', best) : null };
    }
    return { period, entries: hit.entries, me };
  });

  // ───────────── Administration: moderation of the public tables ─────────────
  app.get<{ Querystring: { status?: string; limit?: string } }>('/api/admin/arcade/runs', async (req) => {
    requireAdmin(req);
    const n = Math.min(300, Math.max(1, Number.parseInt(req.query.limit ?? '100', 10) || 100));
    const statuses = ['saved', 'pending', 'verified', 'rejected'];
    const status = statuses.includes(req.query.status ?? '') ? [req.query.status as string] : statuses;
    const rows = await db
      .select({
        id: arcadeRuns.id,
        gameId: arcadeRuns.gameId,
        userId: arcadeRuns.userId,
        username: users.username,
        guestName: arcadeRuns.guestName,
        status: arcadeRuns.status,
        hidden: arcadeRuns.hidden,
        score: arcadeRuns.score,
        distanceM: arcadeRuns.distanceM,
        durationMs: arcadeRuns.durationMs,
        reasons: arcadeRuns.rejectReasons,
        finishedAt: arcadeRuns.finishedAt,
      })
      .from(arcadeRuns)
      .leftJoin(users, eq(users.id, arcadeRuns.userId))
      .where(and(eq(arcadeRuns.gameId, GAME), inArray(arcadeRuns.status, status), ne(arcadeRuns.status, 'started')))
      .orderBy(desc(arcadeRuns.finishedAt))
      .limit(n);
    return {
      runs: rows.map((r) => ({ ...r, name: r.username ?? r.guestName ?? '—', guest: !r.userId, finishedAt: r.finishedAt?.toISOString() ?? null, username: undefined, guestName: undefined })),
    };
  });

  app.patch<{ Params: { id: string } }>('/api/admin/arcade/runs/:id', async (req) => {
    const admin = requireAdmin(req);
    const id = uuid.parse(req.params.id);
    const { hidden } = z.object({ hidden: z.boolean() }).parse(req.body);
    const [row] = await db.update(arcadeRuns).set({ hidden }).where(eq(arcadeRuns.id, id)).returning({ id: arcadeRuns.id, guestName: arcadeRuns.guestName, userId: arcadeRuns.userId, score: arcadeRuns.score });
    if (!row) throw notFound();
    cache.clear();
    await audit(db, { actorUserId: admin.id, action: hidden ? 'admin.arcade_run_hidden' : 'admin.arcade_run_shown', targetType: 'arcade_run', targetId: id, ip: req.ip, details: { game: GAME, guestName: row.guestName, userId: row.userId, score: row.score } });
    return { ok: true, hidden };
  });
}
