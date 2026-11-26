import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import type { Ctx } from '../app.ts';
import { payments } from '../db/schema.ts';
import { requireUser } from '../plugins/security.ts';
import { publicUser } from '../routes/auth.ts';
import { syncAchievements } from './achievements.ts';
import { isListed, toPublicGame } from './catalog.ts';
import { latestAnnouncements } from './community.ts';
import { recentlyPlayed } from './sessions.ts';

/**
 * Player dashboard (one request): identity, “Continuar jugando”, recently played, available and upcoming games,
 * per-game progress from each game module, achievements and announcements.
 */
export function dashboardRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  app.get('/api/platform/dashboard', async (req) => {
    const u = requireUser(req);
    const [recent, achievements, news, rows, user] = await Promise.all([recentlyPlayed(db, u.id), syncAchievements(db, ctx.modules, u.id), latestAnnouncements(db, 4), ctx.catalog.all(), publicUser(ctx, u)]);
    const games = rows.filter((g) => isListed(g, u)).map((g) => toPublicGame(g, u));
    const recentlyPlayedGames = recent
      .map((r) => ({ gameId: r.gameId, lastPlayedAt: r.lastPlayedAt.toISOString(), sessions: r.sessions, seconds: r.seconds }))
      .filter((r) => games.some((g) => g.id === r.gameId));
    // “Continuar jugando” = the most recently played game that is still available; otherwise the featured game.
    const last = recentlyPlayedGames.find((r) => games.find((g) => g.id === r.gameId)?.playable);
    const featured = games.find((g) => g.featured && g.playable) ?? games.find((g) => g.playable) ?? null;
    const progress = (await Promise.all(ctx.modules.map((m) => m.progress(db, u.id)))).filter((p) => p !== null);
    // Purchases made before DominicanGames became free (history only; nothing to pay).
    const history = await db
      .select({ id: payments.id, status: payments.status, amount: payments.amount, currency: payments.currency, provider: payments.provider, createdAt: payments.createdAt, paidAt: payments.paidAt })
      .from(payments)
      .where(eq(payments.userId, u.id))
      .orderBy(desc(payments.createdAt))
      .limit(20);
    return {
      user,
      continue: last ? { gameId: last.gameId, lastPlayedAt: last.lastPlayedAt, reason: 'recent' as const } : featured ? { gameId: featured.id, lastPlayedAt: null, reason: 'featured' as const } : null,
      recentlyPlayed: recentlyPlayedGames,
      games,
      progress,
      achievements,
      announcements: news,
      payments: history,
    };
  });
}
