import type { FastifyInstance } from 'fastify';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { gameSettingsSchema, missionProgressSchema, saveDataSchema } from '@sd/shared';
import type { Ctx } from '../../app.ts';
import { limit } from '../../lib/limits.ts';
import { gameSettings, missionProgress, playerSaves, SDOW_GAME_ID } from '../../db/schema.ts';
import { notFound } from '../../lib/errors.ts';
import { requireUser } from '../../plugins/security.ts';
import { isPlayable, requireGameAccess } from '../../platform/catalog.ts';

const GAME = SDOW_GAME_ID;

/**
 * Santo Domingo Open World — game API. The paths (/api/game/*) are the ones the engine host has always used, so
 * the existing game client and its saves keep working unchanged. Every call requires a signed-in DominicanGames
 * account and a playable catalog entry; there is no payment check (the game is free).
 */
export function registerSdowApi(app: FastifyInstance, ctx: Ctx) {
  const { db, cfg } = ctx;
  const root = resolve(cfg.GAME_DATA_DIR);

  /** Kept for compatibility: access is free for every signed-in account while the game is published. */
  app.get('/api/game/access', async (req) => {
    const u = requireUser(req);
    const game = await ctx.catalog.get(GAME);
    return { access: 'free' as const, gameId: GAME, canPlay: !!game && isPlayable(game, u), emailVerified: u.emailVerified };
  });

  // World data streamed by the engine (GLB chunks + JSON).
  app.get<{ Params: { '*': string } }>('/api/game/assets/*', { config: limit(ctx.cfg, 2000, '1 minute') }, async (req, reply) => {
    await requireGameAccess(req, ctx, GAME);
    const rel = req.params['*'] ?? '';
    if (!/^[a-zA-Z0-9_./-]+$/.test(rel) || rel.includes('..')) throw notFound();
    const file = resolve(root, rel);
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) throw notFound();
    const st = statSync(file);
    const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    reply.header('Cache-Control', 'private, max-age=3600');
    reply.header('ETag', etag);
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();
    reply.type(file.endsWith('.json') ? 'application/json' : file.endsWith('.glb') ? 'model/gltf-binary' : 'application/octet-stream');
    return reply.send(createReadStream(file));
  });

  app.get('/api/game/save', async (req) => {
    const { user } = await requireGameAccess(req, ctx, GAME);
    const [s] = await db.select().from(playerSaves).where(and(eq(playerSaves.userId, user.id), eq(playerSaves.gameId, GAME)));
    return { save: s?.saveData ?? null, updatedAt: s?.updatedAt ?? null };
  });

  app.put('/api/game/save', { bodyLimit: 64 * 1024, config: limit(ctx.cfg, 30, '1 minute') }, async (req) => {
    const { user } = await requireGameAccess(req, ctx, GAME);
    const data = saveDataSchema.parse(req.body);
    await db
      .insert(playerSaves)
      .values({ userId: user.id, gameId: GAME, saveData: data })
      .onConflictDoUpdate({ target: [playerSaves.userId, playerSaves.gameId], set: { saveData: data, updatedAt: new Date() } });
    return { ok: true };
  });

  app.get('/api/game/missions', async (req) => {
    const { user } = await requireGameAccess(req, ctx, GAME);
    return { missions: await db.select().from(missionProgress).where(and(eq(missionProgress.userId, user.id), eq(missionProgress.gameId, GAME))) };
  });

  app.post('/api/game/missions', { config: limit(ctx.cfg, 30, '1 minute') }, async (req) => {
    const { user } = await requireGameAccess(req, ctx, GAME);
    const m = missionProgressSchema.parse(req.body);
    const [existing] = await db
      .select()
      .from(missionProgress)
      .where(and(eq(missionProgress.userId, user.id), eq(missionProgress.gameId, GAME), eq(missionProgress.missionId, m.missionId)));
    if (existing?.status === 'completed' && m.status !== 'completed') return { ok: true, mission: existing };
    // A repeated completion keeps the best (fastest) run — that is what the leaderboards show.
    const prevTime = existing?.status === 'completed' ? existing.stats?.timeSec : undefined;
    const newTime = m.stats?.timeSec;
    const keepPrevious = prevTime !== undefined && (newTime === undefined || newTime >= prevTime);
    const values = {
      status: m.status,
      stats: keepPrevious ? existing!.stats : (m.stats ?? existing?.stats ?? null),
      completedAt: m.status === 'completed' ? (existing?.completedAt ?? new Date()) : null,
    };
    const [row] = existing
      ? await db.update(missionProgress).set(values).where(eq(missionProgress.id, existing.id)).returning()
      : await db.insert(missionProgress).values({ userId: user.id, gameId: GAME, missionId: m.missionId, ...values }).returning();
    return { ok: true, mission: row };
  });

  // Settings can be edited from the website too (Account → Game settings), so they only need a session.
  app.get('/api/game/settings', async (req) => {
    const u = requireUser(req);
    const [s] = await db.select().from(gameSettings).where(and(eq(gameSettings.userId, u.id), eq(gameSettings.gameId, GAME)));
    return { settings: s?.settingsJson ?? null };
  });

  app.put('/api/game/settings', { bodyLimit: 16 * 1024 }, async (req) => {
    const u = requireUser(req);
    const settings = gameSettingsSchema.parse(req.body);
    await db
      .insert(gameSettings)
      .values({ userId: u.id, gameId: GAME, settingsJson: settings })
      .onConflictDoUpdate({ target: [gameSettings.userId, gameSettings.gameId], set: { settingsJson: settings, updatedAt: new Date() } });
    return { ok: true };
  });
}
