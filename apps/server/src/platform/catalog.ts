import type { FastifyInstance, FastifyRequest } from 'fastify';
import { asc, eq } from 'drizzle-orm';
import { gameInputSchema, gameUpdateSchema, type PublicGame } from '@sd/shared';
import type { Ctx } from '../app.ts';
import type { DB } from '../db/index.ts';
import { games } from '../db/schema.ts';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.ts';
import { requireAdmin, requireUser, type AuthUser } from '../plugins/security.ts';
import { audit } from '../services/audit.ts';

export type GameRow = typeof games.$inferSelect;

/**
 * DominicanGames Core — game catalog. Every game (available, in development or upcoming) is a row in `games`,
 * editable from the admin panel; the homepage, catalog, dashboard, sitemap and launch authorization all read
 * from here, so adding a game never requires redesigning a page.
 */
export class CatalogService {
  private cache: { at: number; rows: GameRow[] } | null = null;
  constructor(private readonly db: DB) {}

  /** All games ordered for display. Cached briefly: game asset requests check the catalog on every call. */
  async all(): Promise<GameRow[]> {
    if (this.cache && Date.now() - this.cache.at < 15_000) return this.cache.rows;
    const rows = await this.db.select().from(games).orderBy(asc(games.sortOrder), asc(games.title));
    this.cache = { at: Date.now(), rows };
    return rows;
  }

  async get(id: string): Promise<GameRow | null> {
    return (await this.all()).find((g) => g.id === id) ?? null;
  }

  invalidate() {
    this.cache = null;
  }
}

/** Published games are playable by every signed-in player; games in development only by administrators. */
export function isPlayable(g: GameRow, user: Pick<AuthUser, 'role'> | null): boolean {
  if (!g.launchPath) return false;
  if (g.status === 'published') return true;
  return g.status === 'development' && user?.role === 'admin';
}

/** Visible in the public catalog (development builds are listed for administrators only). */
export function isListed(g: GameRow, user: Pick<AuthUser, 'role'> | null): boolean {
  if (g.status === 'hidden') return false;
  if (g.status === 'development') return user?.role === 'admin';
  return true;
}

export function toPublicGame(g: GameRow, user: Pick<AuthUser, 'role'> | null): PublicGame {
  return {
    id: g.id,
    title: g.title,
    tagline: g.tagline,
    description: g.description,
    status: g.status,
    featured: g.featured,
    sortOrder: g.sortOrder,
    categories: g.categories,
    platforms: g.platforms,
    developer: g.developer,
    publisher: g.publisher,
    releaseLabel: g.releaseLabel,
    launchPath: isPlayable(g, user) || g.status === 'published' ? g.launchPath : null,
    coverImage: g.coverImage,
    heroImage: g.heroImage,
    screenshots: g.screenshots,
    theme: g.theme,
    guestPlay: g.guestPlay,
    playable: isPlayable(g, user),
    updatedAt: g.updatedAt.toISOString(),
  };
}

/**
 * Authorization for every game API call: a signed-in, non-suspended DominicanGames account and a game that is
 * playable. There is NO payment or subscription check — access to published games is free.
 */
export async function requireGameAccess(req: FastifyRequest, ctx: Pick<Ctx, 'catalog'>, gameId: string): Promise<{ user: AuthUser; game: GameRow }> {
  const user = requireUser(req);
  const game = await ctx.catalog.get(gameId);
  if (!game || !isPlayable(game, user)) throw forbidden('game_unavailable', 'Este juego todavía no está disponible.');
  return { user, game };
}

export function catalogRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, catalog } = ctx;

  app.get('/api/platform/games', async (req) => {
    const rows = await catalog.all();
    return { games: rows.filter((g) => isListed(g, req.user)).map((g) => toPublicGame(g, req.user)) };
  });

  app.get<{ Params: { id: string } }>('/api/platform/games/:id', async (req) => {
    const g = await catalog.get(req.params.id);
    if (!g || (!isListed(g, req.user) && req.user?.role !== 'admin')) throw notFound('Juego no encontrado.');
    return { game: toPublicGame(g, req.user) };
  });

  // ───────────── Administration (authorized on the server for every call) ─────────────
  app.get('/api/admin/games', async (req) => {
    const admin = requireAdmin(req);
    const rows = await catalog.all();
    return { games: rows.map((g) => toPublicGame(g, admin)) };
  });

  app.post('/api/admin/games', async (req, reply) => {
    const admin = requireAdmin(req);
    const input = gameInputSchema.parse(req.body);
    if ((input.status === 'published' || input.status === 'development') && !input.launchPath) throw badRequest('launch_path_required', 'Un juego disponible necesita una ruta de lanzamiento.');
    const [exists] = await db.select({ id: games.id }).from(games).where(eq(games.id, input.id));
    if (exists) throw conflict('game_exists', 'Ya existe un juego con ese identificador.');
    const [row] = await db.insert(games).values(input).returning();
    catalog.invalidate();
    await audit(db, { actorUserId: admin.id, action: 'admin.game_created', targetType: 'game', targetId: row.id, ip: req.ip, details: { status: row.status, title: row.title } });
    reply.code(201);
    return { game: toPublicGame(row, admin) };
  });

  app.patch<{ Params: { id: string } }>('/api/admin/games/:id', async (req) => {
    const admin = requireAdmin(req);
    const current = await db.select().from(games).where(eq(games.id, req.params.id));
    if (!current[0]) throw notFound('Juego no encontrado.');
    const patch = gameUpdateSchema.parse(req.body);
    const next = { ...current[0], ...patch };
    if ((next.status === 'published' || next.status === 'development') && !next.launchPath) throw badRequest('launch_path_required', 'Un juego disponible necesita una ruta de lanzamiento.');
    const [row] = await db
      .update(games)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(games.id, req.params.id))
      .returning();
    catalog.invalidate();
    await audit(db, { actorUserId: admin.id, action: 'admin.game_updated', targetType: 'game', targetId: row.id, ip: req.ip, details: { fields: Object.keys(patch), status: row.status, featured: row.featured } });
    return { game: toPublicGame(row, admin) };
  });
}
