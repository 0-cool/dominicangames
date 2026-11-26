import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { sessionStartSchema } from '@sd/shared';
import type { Ctx } from '../app.ts';
import type { DB } from '../db/index.ts';
import { gameSessions } from '../db/schema.ts';
import { limit } from '../lib/limits.ts';
import { notFound } from '../lib/errors.ts';
import { requireUser } from '../plugins/security.ts';
import { requireGameAccess } from './catalog.ts';

const uuidRe = /^[0-9a-f-]{36}$/;
/** A session that stops sending heartbeats is considered over; its length is capped for statistics. */
export const SESSION_MAX_SEC = 12 * 3600;

/** Seconds actually played in a session (last heartbeat − start), capped. */
// (coalesce: in LEFT JOINs a missing session must count 0 — LEAST() ignores NULLs and would return the cap)
export const sessionSeconds = sql<number>`least(coalesce(extract(epoch from (${gameSessions.lastSeenAt} - ${gameSessions.startedAt})), 0), ${SESSION_MAX_SEC})`;

/** Per-game summary of a player's launches, most recent first. */
export async function recentlyPlayed(db: DB, userId: string) {
  return db
    .select({
      gameId: gameSessions.gameId,
      lastPlayedAt: sql<Date>`max(${gameSessions.startedAt})`.mapWith((v: string | Date) => new Date(v)),
      sessions: sql<number>`count(*)::int`,
      seconds: sql<number>`coalesce(sum(${sessionSeconds}), 0)::int`,
    })
    .from(gameSessions)
    .where(eq(gameSessions.userId, userId))
    .groupBy(gameSessions.gameId)
    .orderBy(desc(sql`max(${gameSessions.startedAt})`));
}

/**
 * Platform launch tracking used by every game: start → heartbeat (every minute) → end.
 * Powers “Continuar jugando”, “Jugados recientemente”, play time and admin analytics.
 */
export function sessionRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  app.post('/api/platform/sessions', { config: limit(ctx.cfg, 30, '1 minute') }, async (req, reply) => {
    const { gameId } = sessionStartSchema.parse(req.body);
    const { user, game } = await requireGameAccess(req, ctx, gameId);
    // close any session of this player left open in another tab/device more than a minute ago
    await db
      .update(gameSessions)
      .set({ endedAt: new Date() })
      .where(and(eq(gameSessions.userId, user.id), isNull(gameSessions.endedAt), sql`${gameSessions.lastSeenAt} < now() - interval '1 minute'`));
    const [row] = await db.insert(gameSessions).values({ userId: user.id, gameId: game.id }).returning({ id: gameSessions.id, startedAt: gameSessions.startedAt });
    reply.code(201);
    return { sessionId: row.id, startedAt: row.startedAt };
  });

  const touch = (end: boolean) => async (req: FastifyRequest<{ Params: { id: string } }>) => {
    const user = requireUser(req);
    if (!uuidRe.test(req.params.id)) throw notFound();
    const now = new Date();
    const [row] = await db
      .update(gameSessions)
      .set(end ? { lastSeenAt: now, endedAt: now } : { lastSeenAt: now })
      .where(and(eq(gameSessions.id, req.params.id), eq(gameSessions.userId, user.id), isNull(gameSessions.endedAt), gt(gameSessions.startedAt, new Date(Date.now() - SESSION_MAX_SEC * 1000))))
      .returning({ id: gameSessions.id });
    return { ok: !!row };
  };
  app.post<{ Params: { id: string } }>('/api/platform/sessions/:id/heartbeat', { config: limit(ctx.cfg, 20, '1 minute') }, touch(false));
  app.post<{ Params: { id: string } }>('/api/platform/sessions/:id/end', { config: limit(ctx.cfg, 20, '1 minute') }, touch(true));
}
