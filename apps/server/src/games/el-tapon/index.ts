import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { TAPON_GAME_ID, type Leaderboard, type TaponStats } from '@sd/shared';
import { AVENUES, STAGE_M } from '@sd/tapon/sim';
import type { Ctx } from '../../app.ts';
import type { DB } from '../../db/index.ts';
import { arcadeRuns } from '../../db/schema.ts';
import type { AchievementDef, GameModule, GameProgress } from '../../platform/modules.ts';
import { registerTaponApi, taponTable } from './api.ts';

const GAME = TAPON_GAME_ID;

/** Single-run achievements: they only count runs the server replayed (status `verified`). */
const RULES: { def: AchievementDef; test: (r: { score: number; stats: TaponStats }) => boolean; sql: ReturnType<typeof sql> }[] = [
  { def: { id: 'tapon_primer_tapon', gameId: GAME, title: 'Primer tapón', description: 'Termina tu primera carrera de El Tapón.', icon: 'moto', points: 10 }, test: () => true, sql: sql`true` },
  { def: { id: 'tapon_kilometro', gameId: GAME, title: 'Un kilómetro de tapón', description: 'Recorre 1 km en una sola carrera.', icon: 'flag', points: 15 }, test: (r) => r.stats.distanceM >= 1000, sql: sql`distance_m >= 1000` },
  { def: { id: 'tapon_rey', gameId: GAME, title: 'Rey del tapón', description: 'Recorre 3 km en una sola carrera.', icon: 'crown', points: 40 }, test: (r) => r.stats.distanceM >= 3000, sql: sql`distance_m >= 3000` },
  { def: { id: 'tapon_cinco_mil', gameId: GAME, title: 'Cinco mil', description: 'Haz 5.000 puntos en una carrera.', icon: 'star', points: 20 }, test: (r) => r.score >= 5000, sql: sql`score >= 5000` },
  { def: { id: 'tapon_motoconchista', gameId: GAME, title: 'Motoconchista de confianza', description: 'Completa 3 viajes con pasajero en una carrera.', icon: 'walk', points: 25 }, test: (r) => r.stats.ridesCompleted >= 3, sql: sql`(stats->>'ridesCompleted')::int >= 3` },
  { def: { id: 'tapon_platanos', gameId: GAME, title: 'Esquiva-plátanos', description: 'Esquiva 10 plátanos de la platanera en una carrera.', icon: 'trophy', points: 15 }, test: (r) => r.stats.plantainsDodged >= 10, sql: sql`(stats->>'plantainsDodged')::int >= 10` },
  { def: { id: 'tapon_por_un_pelo', gameId: GAME, title: 'Por un pelo', description: 'Cámbiate de carril por un pelo 3 veces en una carrera.', icon: 'speed', points: 20 }, test: (r) => r.stats.closeCalls >= 3, sql: sql`(stats->>'closeCalls')::int >= 3` },
  { def: { id: 'tapon_en_racha', gameId: GAME, title: 'En racha', description: 'Alcanza el multiplicador ×3 encadenando bonos.', icon: 'timer', points: 20 }, test: (r) => r.stats.maxCombo >= 4, sql: sql`(stats->>'maxCombo')::int >= 4` },
];

const fmtKm = (m: number) => (m >= 1000 ? `${(m / 1000).toLocaleString('es-DO', { maximumFractionDigits: 2 })} km` : `${Math.round(m)} m`);
const fmtPts = (n: number) => `${Math.round(n).toLocaleString('es-DO')} pts`;

/** El Tapón as a DominicanGames game module (arcade: guest play + high-score tables). */
class ElTapon implements GameModule {
  readonly id = GAME;
  readonly achievements = RULES.map((r) => r.def);

  registerRoutes(app: FastifyInstance, ctx: Ctx) {
    registerTaponApi(app, ctx, {
      achievements: this.achievements,
      achievementsFor: (run) => RULES.filter((r) => r.test(run)).map((r) => r.def.id),
    });
  }

  async evaluateAchievements(db: DB, userId: string) {
    const cols = sql.join(
      RULES.map((r, i) => sql`min(finished_at) filter (where ${r.sql}) as ${sql.raw(`a${i}`)}`),
      sql`, `,
    );
    const res = await db.execute<Record<string, Date | string | null>>(sql`select ${cols} from arcade_runs where game_id = ${GAME} and user_id = ${userId} and status = 'verified'`);
    const row = res.rows[0] ?? {};
    return RULES.flatMap((r, i) => {
      const at = row[`a${i}`];
      return at ? [{ id: r.def.id, at: new Date(at) }] : [];
    });
  }

  async progress(db: DB, userId: string): Promise<GameProgress | null> {
    const counted = ['saved', 'pending', 'verified'];
    const [agg] = await db
      .select({
        runs: sql<number>`count(*)::int`,
        best: sql<number | null>`max(${arcadeRuns.score}) filter (where ${arcadeRuns.status} = 'verified')`,
        bestDistance: sql<number | null>`max(${arcadeRuns.distanceM})`,
        totalDistance: sql<number>`coalesce(sum(${arcadeRuns.distanceM}), 0)::bigint`,
        rides: sql<number>`coalesce(sum((${arcadeRuns.stats}->>'ridesCompleted')::int), 0)::int`,
        plantains: sql<number>`coalesce(sum((${arcadeRuns.stats}->>'plantainsDodged')::int), 0)::int`,
        playMs: sql<number>`coalesce(sum(${arcadeRuns.durationMs}), 0)::bigint`,
        last: sql<Date | null>`max(${arcadeRuns.finishedAt})`,
      })
      .from(arcadeRuns)
      .where(and(eq(arcadeRuns.gameId, GAME), eq(arcadeRuns.userId, userId), inArray(arcadeRuns.status, counted)));
    if (!agg || !agg.runs) return null;
    const bestDistance = Number(agg.bestDistance ?? 0);
    const totalDistance = Number(agg.totalDistance);
    const minutes = Math.round(Number(agg.playMs) / 60_000);
    // milestones: the avenues of the run (one every STAGE_M metres), reached in the best run
    const milestones = AVENUES.map((name, i) => {
      const reached = bestDistance >= i * STAGE_M;
      return { id: `avenida_${i}`, title: i === 0 ? `Arrancar en la ${name}` : `Llegar a la ${name}`, status: (reached ? 'completed' : 'pending') as GameProgress['milestones'][number]['status'], detail: i === 0 ? undefined : `${(i * STAGE_M).toLocaleString('es-DO')} m` };
    });
    const best = agg.best === null ? null : Number(agg.best);
    return {
      gameId: GAME,
      summary: [best !== null ? `Récord ${fmtPts(best)}` : 'Sin récord verificado todavía', `${agg.runs} ${agg.runs === 1 ? 'carrera' : 'carreras'}`].join(' · '),
      completion: Math.min(1, bestDistance / (STAGE_M * (AVENUES.length - 1))),
      updatedAt: agg.last ? new Date(agg.last).toISOString() : null,
      milestones,
      stats: [
        { label: 'Récord', value: best !== null ? fmtPts(best) : '—' },
        { label: 'Mejor distancia', value: fmtKm(bestDistance) },
        { label: 'Carreras', value: String(agg.runs) },
        { label: 'Distancia total', value: fmtKm(totalDistance) },
        { label: 'Viajes con pasajero', value: String(agg.rides) },
        { label: 'Tiempo en el tapón', value: minutes < 1 ? '< 1 min' : `${minutes} min` },
      ],
    };
  }

  /** Community page: the all-time table (accounts that show in rankings + guests with a nickname). */
  async leaderboards(db: DB, limit: number): Promise<Leaderboard[]> {
    const rows = await taponTable(db, false, limit);
    return [
      {
        id: 'tapon_records',
        gameId: GAME,
        title: 'El Tapón — Récords',
        description: 'Mejores puntuaciones verificadas. Los invitados aparecen con su apodo.',
        unit: 'puntos',
        entries: rows.map((r) => ({ rank: r.rank, username: r.name, avatar: r.avatar, value: r.score, display: fmtPts(r.score), guest: r.guest })),
      },
    ];
  }
}

export const elTapon = new ElTapon();
