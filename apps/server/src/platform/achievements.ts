import { and, eq, isNotNull } from 'drizzle-orm';
import type { AchievementView } from '@sd/shared';
import type { DB } from '../db/index.ts';
import { gameAccess, payments, userAchievements, users } from '../db/schema.ts';
import type { AchievementDef, GameModule } from './modules.ts';

/** Platform-wide achievements (every game module adds its own). All are derived from real account data. */
export const PLATFORM_ACHIEVEMENTS: AchievementDef[] = [
  { id: 'dg_bienvenido', gameId: null, title: 'Bienvenido a DominicanGames', description: 'Crea tu cuenta de DominicanGames.', icon: 'star', points: 5 },
  { id: 'dg_verificado', gameId: null, title: 'Cuenta verificada', description: 'Confirma tu correo electrónico.', icon: 'shield', points: 5 },
  // Secret: only players who supported the game before it became free have it, so nobody else sees it as a goal.
  { id: 'dg_fundador', gameId: null, title: 'Fundador', description: 'Apoyaste Santo Domingo Open World desde sus inicios.', icon: 'crown', points: 50, secret: true },
];

export function allAchievementDefs(modules: readonly GameModule[]): AchievementDef[] {
  return [...PLATFORM_ACHIEVEMENTS, ...modules.flatMap((m) => m.achievements)];
}

async function platformUnlocks(db: DB, userId: string): Promise<{ id: string; at: Date | null }[]> {
  const [u] = await db.select({ createdAt: users.createdAt, verified: users.emailVerified, verifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, userId));
  if (!u) return [];
  const out: { id: string; at: Date | null }[] = [{ id: 'dg_bienvenido', at: u.createdAt }];
  if (u.verified) out.push({ id: 'dg_verificado', at: u.verifiedAt });
  const [legacy] = await db
    .select({ paidAt: payments.paidAt, activatedAt: gameAccess.activatedAt })
    .from(gameAccess)
    .leftJoin(payments, eq(payments.id, gameAccess.paymentId))
    .where(and(eq(gameAccess.userId, userId), eq(gameAccess.accessStatus, 'active'), isNotNull(gameAccess.paymentId)));
  if (legacy) out.push({ id: 'dg_fundador', at: legacy.paidAt ?? legacy.activatedAt });
  return out;
}

/**
 * Evaluates every achievement for a player, stores the new unlocks (first unlock time is never overwritten)
 * and returns the full list for display.
 */
export async function syncAchievements(db: DB, modules: readonly GameModule[], userId: string): Promise<{ list: AchievementView[]; points: number; unlocked: number; total: number }> {
  const defs = allAchievementDefs(modules);
  const earned = [...(await platformUnlocks(db, userId)), ...(await Promise.all(modules.map((m) => m.evaluateAchievements(db, userId)))).flat()];
  if (earned.length) {
    await db
      .insert(userAchievements)
      .values(earned.map((e) => ({ userId, achievementId: e.id, gameId: defs.find((d) => d.id === e.id)?.gameId ?? null, unlockedAt: e.at ?? new Date() })))
      .onConflictDoNothing();
  }
  // The Fundador badge follows the purchase: a refunded legacy payment removes it.
  if (!earned.some((e) => e.id === 'dg_fundador')) {
    await db.delete(userAchievements).where(and(eq(userAchievements.userId, userId), eq(userAchievements.achievementId, 'dg_fundador')));
  }
  const rows = await db.select().from(userAchievements).where(eq(userAchievements.userId, userId));
  const at = new Map(rows.map((r) => [r.achievementId, r.unlockedAt]));
  // Secret achievements are listed (and counted) only once earned.
  const visible = defs.filter((d) => !d.secret || at.has(d.id));
  const list = visible.map(({ secret: _secret, ...d }) => ({ ...d, unlockedAt: at.get(d.id)?.toISOString() ?? null }));
  const unlockedList = list.filter((a) => a.unlockedAt);
  return { list, points: unlockedList.reduce((s, a) => s + a.points, 0), unlocked: unlockedList.length, total: visible.length };
}
