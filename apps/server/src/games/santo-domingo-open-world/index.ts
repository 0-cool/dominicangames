import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Leaderboard, SaveData } from '@sd/shared';
import type { Ctx } from '../../app.ts';
import type { DB } from '../../db/index.ts';
import { gameSessions, missionProgress, playerSaves, SDOW_GAME_ID, users } from '../../db/schema.ts';
import type { AchievementDef, GameModule, GameProgress } from '../../platform/modules.ts';
import { registerSdowApi } from './api.ts';

const GAME = SDOW_GAME_ID;
const MISSIONS: { id: string; title: string }[] = [
  { id: 'm001_bienvenido', title: 'Bienvenido a Santo Domingo' },
  { id: 'reto_malecon', title: 'Reto del Malecón' },
];

const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'sdow_primera_vuelta', gameId: GAME, title: 'Primera vuelta', description: 'Entra por primera vez a Santo Domingo Open World.', icon: 'flag', points: 10 },
  { id: 'sdow_bienvenido', gameId: GAME, title: 'Bienvenido a Santo Domingo', description: 'Completa el encargo de Don Ramón.', icon: 'moto', points: 30 },
  { id: 'sdow_reto_malecon', gameId: GAME, title: 'Rey del Malecón', description: 'Completa el Reto del Malecón contra reloj.', icon: 'timer', points: 40 },
  { id: 'sdow_explorador', gameId: GAME, title: 'Explorador colonial', description: 'Descubre 5 monumentos.', icon: 'landmark', points: 20 },
  { id: 'sdow_patrimonio', gameId: GAME, title: 'Patrimonio completo', description: 'Descubre todos los monumentos de la ciudad.', icon: 'crown', points: 60 },
  { id: 'sdow_kilometros', gameId: GAME, title: 'Kilómetros de calle', description: 'Recorre 10 km en vehículo.', icon: 'car', points: 20 },
  { id: 'sdow_a_pie', gameId: GAME, title: 'A pie por la capital', description: 'Camina 2 km por la ciudad.', icon: 'walk', points: 10 },
  { id: 'sdow_velocidad', gameId: GAME, title: 'Pura velocidad', description: 'Alcanza 120 km/h.', icon: 'speed', points: 15 },
];

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')} min`;
const fmtKm = (m: number) => (m >= 1000 ? `${(m / 1000).toLocaleString('es-DO', { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`);
const fmtDuration = (sec: number) => {
  if (sec < 60) return `${Math.round(sec)} s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};

/** Santo Domingo Open World as a DominicanGames game module. */
class SantoDomingoOpenWorld implements GameModule {
  readonly id = GAME;
  readonly achievements = ACHIEVEMENTS;
  private landmarkTotal = 15;

  registerRoutes(app: FastifyInstance, ctx: Ctx) {
    // Read the real landmark count from the generated world data when it exists.
    const manifest = resolve(ctx.cfg.GAME_DATA_DIR, 'world', 'manifest.json');
    if (existsSync(manifest)) {
      try {
        const n = (JSON.parse(readFileSync(manifest, 'utf8')) as { landmarks?: unknown[] }).landmarks?.length;
        if (n) this.landmarkTotal = n;
      } catch {
        /* keep default */
      }
    }
    registerSdowApi(app, ctx);
  }

  private async load(db: DB, userId: string) {
    const [save] = await db.select().from(playerSaves).where(and(eq(playerSaves.userId, userId), eq(playerSaves.gameId, GAME)));
    const missions = await db.select().from(missionProgress).where(and(eq(missionProgress.userId, userId), eq(missionProgress.gameId, GAME)));
    const [first] = await db
      .select({ at: gameSessions.startedAt })
      .from(gameSessions)
      .where(and(eq(gameSessions.userId, userId), eq(gameSessions.gameId, GAME)))
      .orderBy(asc(gameSessions.startedAt))
      .limit(1);
    return { save: save ? { data: save.saveData as SaveData, updatedAt: save.updatedAt } : null, missions, firstSession: first?.at ?? null };
  }

  async evaluateAchievements(db: DB, userId: string) {
    const { save, missions, firstSession } = await this.load(db, userId);
    const out: { id: string; at: Date | null }[] = [];
    if (firstSession || save) out.push({ id: 'sdow_primera_vuelta', at: firstSession ?? save?.updatedAt ?? null });
    const done = (id: string) => missions.find((m) => m.missionId === id && m.status === 'completed');
    const m1 = done('m001_bienvenido');
    if (m1) out.push({ id: 'sdow_bienvenido', at: m1.completedAt });
    const trial = done('reto_malecon');
    if (trial) out.push({ id: 'sdow_reto_malecon', at: trial.completedAt });
    if (save) {
      const d = save.data;
      const n = d.discoveredLandmarks?.length ?? 0;
      if (n >= 5) out.push({ id: 'sdow_explorador', at: save.updatedAt });
      if (n >= this.landmarkTotal) out.push({ id: 'sdow_patrimonio', at: save.updatedAt });
      if ((d.stats?.distanceDriven ?? 0) >= 10_000) out.push({ id: 'sdow_kilometros', at: save.updatedAt });
      if ((d.stats?.distanceWalked ?? 0) >= 2_000) out.push({ id: 'sdow_a_pie', at: save.updatedAt });
      if ((d.stats?.topSpeedKmh ?? 0) >= 120) out.push({ id: 'sdow_velocidad', at: save.updatedAt });
    }
    return out;
  }

  async progress(db: DB, userId: string): Promise<GameProgress | null> {
    const { save, missions, firstSession } = await this.load(db, userId);
    if (!save && !missions.length && !firstSession) return null;
    const d = save?.data;
    const landmarks = d?.discoveredLandmarks?.length ?? 0;
    const milestones = MISSIONS.map((m) => {
      const row = missions.find((x) => x.missionId === m.id);
      const t = row?.stats?.timeSec;
      return { id: m.id, title: m.title, status: (row?.status ?? 'pending') as GameProgress['milestones'][number]['status'], detail: row?.status === 'completed' && t ? fmtTime(t) : undefined };
    });
    const completedMissions = milestones.filter((m) => m.status === 'completed').length;
    const completion = Math.min(1, (completedMissions / MISSIONS.length) * 0.5 + (landmarks / this.landmarkTotal) * 0.5);
    const summary = [completedMissions ? `${completedMissions} de ${MISSIONS.length} misiones` : 'Misión 1 pendiente', `${landmarks} / ${this.landmarkTotal} monumentos`].join(' · ');
    return {
      gameId: GAME,
      summary,
      completion,
      updatedAt: save?.updatedAt.toISOString() ?? null,
      milestones,
      stats: d
        ? [
            { label: 'Dinero', value: `RD$${Math.round(d.money).toLocaleString('es-DO')}` },
            { label: 'Monumentos', value: `${landmarks} / ${this.landmarkTotal}` },
            { label: 'Tiempo de juego', value: fmtDuration(d.stats.playTimeSec) },
            { label: 'En vehículo', value: fmtKm(d.stats.distanceDriven) },
            { label: 'A pie', value: fmtKm(d.stats.distanceWalked) },
            { label: 'Vel. máxima', value: `${Math.round(d.stats.topSpeedKmh)} km/h` },
          ]
        : [],
    };
  }

  async leaderboards(db: DB, limit: number): Promise<Leaderboard[]> {
    const visible = and(eq(users.showInRankings, true), eq(users.status, 'active'));
    const timeExpr = sql<number>`(${missionProgress.stats}->>'timeSec')::float`;
    const trial = await db
      .select({ username: users.username, avatar: users.avatar, value: timeExpr })
      .from(missionProgress)
      .innerJoin(users, eq(users.id, missionProgress.userId))
      .where(and(visible, eq(missionProgress.gameId, GAME), eq(missionProgress.missionId, 'reto_malecon'), eq(missionProgress.status, 'completed'), sql`${missionProgress.stats}->>'timeSec' is not null`))
      .orderBy(asc(timeExpr))
      .limit(limit);
    const lmExpr = sql<number>`coalesce(jsonb_array_length(${playerSaves.saveData}->'discoveredLandmarks'), 0)`;
    const kmExpr = sql<number>`coalesce((${playerSaves.saveData}->'stats'->>'distanceDriven')::float, 0)`;
    const explorers = await db
      .select({ username: users.username, avatar: users.avatar, value: lmExpr, km: kmExpr })
      .from(playerSaves)
      .innerJoin(users, eq(users.id, playerSaves.userId))
      .where(and(visible, eq(playerSaves.gameId, GAME), sql`${lmExpr} > 0`))
      .orderBy(sql`${lmExpr} desc`, sql`${kmExpr} desc`)
      .limit(limit);
    return [
      {
        id: 'sdow_reto_malecon',
        gameId: GAME,
        title: 'Reto del Malecón',
        description: 'Mejores tiempos del contrarreloj entre el Obelisco y la Fortaleza Ozama.',
        unit: 'tiempo',
        entries: trial.map((r, i) => ({ rank: i + 1, username: r.username, avatar: r.avatar, value: Number(r.value), display: fmtTime(Number(r.value)) })),
      },
      {
        id: 'sdow_exploradores',
        gameId: GAME,
        title: 'Exploradores de la capital',
        description: 'Quién ha descubierto más monumentos de Santo Domingo.',
        unit: 'monumentos',
        entries: explorers.map((r, i) => ({ rank: i + 1, username: r.username, avatar: r.avatar, value: Number(r.value), display: `${Number(r.value)} / ${this.landmarkTotal}` })),
      },
    ];
  }
}

export const santoDomingoOpenWorld = new SantoDomingoOpenWorld();
