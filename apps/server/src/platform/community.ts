import type { FastifyInstance } from 'fastify';
import { and, desc, eq, sql } from 'drizzle-orm';
import { announcementInputSchema, announcementUpdateSchema, type AnnouncementView, type Leaderboard } from '@sd/shared';
import { z } from 'zod';
import type { Ctx } from '../app.ts';
import type { DB } from '../db/index.ts';
import { announcements, userAchievements, users } from '../db/schema.ts';
import { notFound } from '../lib/errors.ts';
import { requireAdmin } from '../plugins/security.ts';
import { audit } from '../services/audit.ts';
import { allAchievementDefs } from './achievements.ts';

const uuid = z.uuid();

export function toAnnouncementView(a: typeof announcements.$inferSelect): AnnouncementView {
  return { id: a.id, title: a.title, body: a.body, gameId: a.gameId, linkUrl: a.linkUrl, linkLabel: a.linkLabel, pinned: a.pinned, publishedAt: a.publishedAt.toISOString() };
}

export async function latestAnnouncements(db: DB, n: number) {
  const rows = await db.select().from(announcements).where(eq(announcements.published, true)).orderBy(desc(announcements.pinned), desc(announcements.publishedAt)).limit(n);
  return rows.map(toAnnouncementView);
}

/** “Jugadores destacados”: DominicanGames points = sum of unlocked achievement points (real data only). */
async function pointsLeaderboard(ctx: Ctx, limit: number): Promise<Leaderboard> {
  const defs = allAchievementDefs(ctx.modules);
  const cases = sql.join(
    defs.map((d) => sql`when ${d.id} then ${sql.raw(String(Math.trunc(d.points)))}`),
    sql` `,
  );
  const points = sql<number>`sum(case ${userAchievements.achievementId} ${cases} else 0 end)::int`;
  const rows = await ctx.db
    .select({ username: users.username, avatar: users.avatar, value: points })
    .from(userAchievements)
    .innerJoin(users, eq(users.id, userAchievements.userId))
    .where(and(eq(users.showInRankings, true), eq(users.status, 'active')))
    .groupBy(users.id, users.username, users.avatar)
    .orderBy(desc(points), users.username)
    .limit(limit);
  return {
    id: 'dg_puntos',
    gameId: null,
    title: 'Jugadores destacados',
    description: 'Puntos DominicanGames: la suma de los logros desbloqueados en todos los juegos.',
    unit: 'puntos',
    entries: rows.map((r, i) => ({ rank: i + 1, username: r.username, avatar: r.avatar, value: r.value, display: `${r.value.toLocaleString('es-DO')} pts` })),
  };
}

/** Public community data (rankings + announcements). Usernames and avatars only — never e-mails. */
export function communityRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  app.get('/api/platform/community', async () => {
    const boards = [await pointsLeaderboard(ctx, 10), ...(await Promise.all(ctx.modules.map((m) => m.leaderboards?.(db, 10) ?? Promise.resolve([])))).flat()];
    // Achievement definitions (what can be unlocked) — real platform data, no per-player info.
    const achievements = allAchievementDefs(ctx.modules)
      .filter((d) => !d.secret)
      .map(({ secret: _secret, ...d }) => ({ ...d, unlockedAt: null }));
    return { leaderboards: boards, announcements: await latestAnnouncements(db, 6), achievements };
  });

  app.get('/api/platform/announcements', async () => ({ announcements: await latestAnnouncements(db, 20) }));

  // ───────────── Administration ─────────────
  app.get('/api/admin/announcements', async (req) => {
    requireAdmin(req);
    const rows = await db.select().from(announcements).orderBy(desc(announcements.publishedAt)).limit(100);
    return { announcements: rows.map((a) => ({ ...toAnnouncementView(a), published: a.published })) };
  });

  app.post('/api/admin/announcements', async (req, reply) => {
    const admin = requireAdmin(req);
    const input = announcementInputSchema.parse(req.body);
    const [row] = await db.insert(announcements).values({ ...input, createdBy: admin.id }).returning();
    await audit(db, { actorUserId: admin.id, action: 'admin.announcement_created', targetType: 'announcement', targetId: row.id, ip: req.ip, details: { title: row.title } });
    reply.code(201);
    return { announcement: { ...toAnnouncementView(row), published: row.published } };
  });

  app.patch<{ Params: { id: string } }>('/api/admin/announcements/:id', async (req) => {
    const admin = requireAdmin(req);
    const id = uuid.parse(req.params.id);
    const patch = announcementUpdateSchema.parse(req.body);
    const [row] = await db.update(announcements).set({ ...patch, updatedAt: new Date() }).where(eq(announcements.id, id)).returning();
    if (!row) throw notFound();
    await audit(db, { actorUserId: admin.id, action: 'admin.announcement_updated', targetType: 'announcement', targetId: id, ip: req.ip, details: { fields: Object.keys(patch) } });
    return { announcement: { ...toAnnouncementView(row), published: row.published } };
  });

  app.delete<{ Params: { id: string } }>('/api/admin/announcements/:id', async (req) => {
    const admin = requireAdmin(req);
    const id = uuid.parse(req.params.id);
    const [row] = await db.delete(announcements).where(eq(announcements.id, id)).returning({ id: announcements.id, title: announcements.title });
    if (!row) throw notFound();
    await audit(db, { actorUserId: admin.id, action: 'admin.announcement_deleted', targetType: 'announcement', targetId: id, ip: req.ip, details: { title: row.title } });
    return { ok: true };
  });
}
