import type { FastifyInstance } from 'fastify';
import { and, count, desc, eq, gt, ilike, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Ctx } from '../app.ts';
import { auditLogs, errorLogs, gameAccess, gameSessions, games, payments, sessions, supportTickets, users } from '../db/schema.ts';
import { recentlyPlayed, sessionSeconds } from '../platform/sessions.ts';
import { notFound } from '../lib/errors.ts';
import { requireAdmin } from '../plugins/security.ts';
import { audit } from '../services/audit.ts';

const page = z.object({ page: z.coerce.number().int().min(1).max(10_000).default(1), q: z.string().trim().max(100).optional(), status: z.string().max(20).optional() });
const uuid = z.uuid();

export function adminRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const PAGE = 25;

  // Platform analytics (real counts only) + per-game play analytics + the legacy RD$100 purchase history.
  app.get('/api/admin/metrics', async (req) => {
    requireAdmin(req);
    const day = new Date(Date.now() - 86400_000);
    const week = new Date(Date.now() - 7 * 86400_000);
    const [[u], [v], [new7], [act], [err24], [tickets], [founders], [rev], byStatus, perGame] = await Promise.all([
      db.select({ n: count() }).from(users),
      db.select({ n: count() }).from(users).where(eq(users.emailVerified, true)),
      db.select({ n: count() }).from(users).where(gt(users.createdAt, week)),
      db.select({ n: count() }).from(sessions).where(gt(sessions.lastSeenAt, day)),
      db.select({ n: count() }).from(errorLogs).where(gt(errorLogs.createdAt, day)),
      db.select({ n: count() }).from(supportTickets).where(eq(supportTickets.status, 'open')),
      db.select({ n: count() }).from(gameAccess).where(and(eq(gameAccess.accessStatus, 'active'), sql`${gameAccess.paymentId} is not null`)),
      db.select({ total: sql<number>`coalesce(sum(${payments.amount}), 0)::int` }).from(payments).where(eq(payments.status, 'succeeded')),
      db.select({ status: payments.status, n: count() }).from(payments).groupBy(payments.status),
      db
        .select({
          gameId: games.id,
          title: games.title,
          status: games.status,
          launches: sql<number>`count(${gameSessions.id})::int`,
          launches24h: sql<number>`count(${gameSessions.id}) filter (where ${gameSessions.startedAt} > ${day})::int`,
          launches7d: sql<number>`count(${gameSessions.id}) filter (where ${gameSessions.startedAt} > ${week})::int`,
          players: sql<number>`count(distinct ${gameSessions.userId})::int`,
          players7d: sql<number>`count(distinct ${gameSessions.userId}) filter (where ${gameSessions.startedAt} > ${week})::int`,
          playSeconds: sql<number>`coalesce(sum(${sessionSeconds}), 0)::int`,
        })
        .from(games)
        .leftJoin(gameSessions, eq(gameSessions.gameId, games.id))
        .groupBy(games.id, games.title, games.status, games.sortOrder)
        .orderBy(games.sortOrder),
    ]);
    const mem = process.memoryUsage();
    return {
      users: u.n,
      verifiedUsers: v.n,
      newUsers7d: new7.n,
      activeSessions24h: act.n,
      errors24h: err24.n,
      openTickets: tickets.n,
      games: perGame,
      monetization: { enabled: ctx.monetization.enabled, legacyFounders: founders.n, legacyRevenueMinor: rev.total, paymentsByStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.n])) },
      server: { uptimeSec: Math.round(process.uptime()), rssMB: Math.round(mem.rss / 1e6), heapMB: Math.round(mem.heapUsed / 1e6), node: process.version },
    };
  });

  app.get('/api/admin/users', async (req) => {
    requireAdmin(req);
    const { page: p, q } = page.parse(req.query);
    const where: SQL | undefined = q ? or(ilike(users.email, `%${q}%`), ilike(users.username, `%${q}%`)) : undefined;
    const rows = await db
      .select({ id: users.id, email: users.email, username: users.username, avatar: users.avatar, emailVerified: users.emailVerified, role: users.role, status: users.status, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt, founder: sql<boolean>`coalesce(${gameAccess.accessStatus} = 'active' and ${gameAccess.paymentId} is not null, false)` })
      .from(users)
      .leftJoin(gameAccess, eq(gameAccess.userId, users.id))
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(PAGE)
      .offset((p - 1) * PAGE);
    const [{ n }] = await db.select({ n: count() }).from(users).where(where);
    return { users: rows, total: n, page: p, pageSize: PAGE };
  });

  app.get<{ Params: { id: string } }>('/api/admin/users/:id', async (req) => {
    requireAdmin(req);
    const id = uuid.parse(req.params.id);
    const [u] = await db.select({ id: users.id, email: users.email, username: users.username, avatar: users.avatar, showInRankings: users.showInRankings, emailVerified: users.emailVerified, role: users.role, status: users.status, suspendedReason: users.suspendedReason, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt }).from(users).where(eq(users.id, id));
    if (!u) throw notFound();
    const [access] = await db.select().from(gameAccess).where(eq(gameAccess.userId, id));
    const pays = await db.select().from(payments).where(eq(payments.userId, id)).orderBy(desc(payments.createdAt));
    const log = await db.select().from(auditLogs).where(or(eq(auditLogs.actorUserId, id), and(eq(auditLogs.targetType, 'user'), eq(auditLogs.targetId, id)))).orderBy(desc(auditLogs.createdAt)).limit(50);
    const played = await recentlyPlayed(db, id);
    return { user: u, legacyAccess: access ?? null, games: played, payments: pays.map((p) => ({ ...p, metadata: undefined })), audit: log };
  });

  app.post<{ Params: { id: string }; Body: { reason?: string } }>('/api/admin/users/:id/suspend', async (req) => {
    const admin = requireAdmin(req);
    const id = uuid.parse(req.params.id);
    const reason = z.string().trim().min(3).max(300).parse(req.body?.reason ?? '');
    if (id === admin.id) throw notFound();
    const [u] = await db.update(users).set({ status: 'suspended', suspendedReason: reason, updatedAt: new Date() }).where(eq(users.id, id)).returning({ id: users.id });
    if (!u) throw notFound();
    await db.delete(sessions).where(eq(sessions.userId, id));
    await audit(db, { actorUserId: admin.id, action: 'admin.user_suspended', targetType: 'user', targetId: id, ip: req.ip, details: { reason } });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/admin/users/:id/restore', async (req) => {
    const admin = requireAdmin(req);
    const id = uuid.parse(req.params.id);
    const [u] = await db.update(users).set({ status: 'active', suspendedReason: null, updatedAt: new Date() }).where(eq(users.id, id)).returning({ id: users.id });
    if (!u) throw notFound();
    await audit(db, { actorUserId: admin.id, action: 'admin.user_restored', targetType: 'user', targetId: id, ip: req.ip });
    return { ok: true };
  });

  // Support action: confirm an e-mail address manually (e.g. the player lost access to the verification mail).
  app.post<{ Params: { id: string } }>('/api/admin/users/:id/verify-email', async (req) => {
    const admin = requireAdmin(req);
    const id = uuid.parse(req.params.id);
    const [u] = await db.update(users).set({ emailVerified: true, emailVerifiedAt: new Date(), updatedAt: new Date() }).where(and(eq(users.id, id), eq(users.emailVerified, false))).returning({ id: users.id });
    if (u) await audit(db, { actorUserId: admin.id, action: 'admin.user_email_verified', targetType: 'user', targetId: id, ip: req.ip });
    return { ok: true, changed: !!u };
  });

  app.get('/api/admin/payments', async (req) => {
    requireAdmin(req);
    const { page: p, status } = page.parse(req.query);
    const valid = ['created', 'pending', 'succeeded', 'failed', 'canceled', 'refunded'] as const;
    const where = status && (valid as readonly string[]).includes(status) ? eq(payments.status, status as (typeof valid)[number]) : undefined;
    const rows = await db
      .select({ id: payments.id, userId: payments.userId, email: users.email, provider: payments.provider, providerReference: payments.providerReference, amount: payments.amount, currency: payments.currency, status: payments.status, createdAt: payments.createdAt, paidAt: payments.paidAt, refundedAt: payments.refundedAt, failureReason: payments.failureReason })
      .from(payments)
      .innerJoin(users, eq(users.id, payments.userId))
      .where(where)
      .orderBy(desc(payments.createdAt))
      .limit(PAGE)
      .offset((p - 1) * PAGE);
    const [{ n }] = await db.select({ n: count() }).from(payments).where(where);
    return { payments: rows, total: n, page: p, pageSize: PAGE };
  });

  app.post<{ Params: { id: string } }>('/api/admin/payments/:id/refund', async (req) => {
    const admin = requireAdmin(req);
    return ctx.payments.refund(uuid.parse(req.params.id), admin.id, req.ip);
  });

  app.get('/api/admin/errors', async (req) => {
    requireAdmin(req);
    const { page: p } = page.parse(req.query);
    return { errors: await db.select().from(errorLogs).orderBy(desc(errorLogs.createdAt)).limit(PAGE).offset((p - 1) * PAGE) };
  });

  app.get('/api/admin/audit', async (req) => {
    requireAdmin(req);
    const { page: p } = page.parse(req.query);
    return { audit: await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(PAGE).offset((p - 1) * PAGE) };
  });

  app.get('/api/admin/tickets', async (req) => {
    requireAdmin(req);
    return { tickets: await db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt)).limit(100) };
  });
}
