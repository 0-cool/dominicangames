import type { FastifyInstance } from 'fastify';
import { and, count, desc, eq, gt, isNull, ne, or } from 'drizzle-orm';
import { hash, verify } from '@node-rs/argon2';
import { changePasswordSchema, forgotPasswordSchema, loginSchema, profileUpdateSchema, registerSchema, resetPasswordSchema, verifyEmailSchema, type PublicUser } from '@sd/shared';
import type { Ctx } from '../app.ts';
import { limit } from '../lib/limits.ts';
import { emailTokens, gameAccess, loginAttempts, missionProgress, payments, playerSaves, sessions, SDOW_GAME_ID, users } from '../db/schema.ts';
import { randomToken, sha256 } from '../lib/crypto.ts';
import { badRequest, conflict, forbidden, tooMany, unauthorized } from '../lib/errors.ts';
import { clearSessionCookie, createSession, requireUser, type AuthUser } from '../plugins/security.ts';
import { audit } from '../services/audit.ts';
import { templates } from '../services/email.ts';

// OWASP-recommended argon2id parameters (19 MiB, t=2, p=1)
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 as const };
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hash(randomToken(), ARGON));

/** The account as returned to the web client. `founder` = bought the original RD$100 access (cosmetic badge). */
export async function publicUser(ctx: Pick<Ctx, 'db'>, u: AuthUser): Promise<PublicUser> {
  const [a] = await ctx.db.select({ s: gameAccess.accessStatus, paymentId: gameAccess.paymentId }).from(gameAccess).where(eq(gameAccess.userId, u.id));
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    emailVerified: u.emailVerified,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt.toISOString(),
    avatar: u.avatar,
    showInRankings: u.showInRankings,
    locale: u.locale === 'en' ? 'en' : 'es',
    founder: a?.s === 'active' && !!a.paymentId,
  };
}

const toAuthUser = (u: typeof users.$inferSelect): AuthUser => ({
  id: u.id,
  email: u.email,
  username: u.username,
  emailVerified: u.emailVerified,
  role: u.role,
  status: u.status,
  createdAt: u.createdAt,
  avatar: u.avatar,
  showInRankings: u.showInRankings,
  locale: u.locale,
});

async function issueToken(ctx: Ctx, userId: string, type: 'verify_email' | 'reset_password', ttlMs: number): Promise<string> {
  const token = randomToken();
  // single active token per type
  await ctx.db.update(emailTokens).set({ usedAt: new Date() }).where(and(eq(emailTokens.userId, userId), eq(emailTokens.type, type), isNull(emailTokens.usedAt)));
  await ctx.db.insert(emailTokens).values({ userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) });
  return token;
}

async function consumeToken(ctx: Ctx, token: string, type: 'verify_email' | 'reset_password'): Promise<string> {
  const [t] = await ctx.db
    .update(emailTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(emailTokens.tokenHash, sha256(token)), eq(emailTokens.type, type), isNull(emailTokens.usedAt), gt(emailTokens.expiresAt, new Date())))
    .returning({ userId: emailTokens.userId });
  if (!t) throw badRequest('invalid_token', 'El enlace no es válido o ya expiró.');
  return t.userId;
}

export function authRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, cfg, mailer } = ctx;
  const strict = (max: number, timeWindow: string) => ({ config: limit(cfg, max, timeWindow) });

  app.post('/api/auth/register', strict(5, '1 hour'), async (req, reply) => {
    const body = registerSchema.parse(req.body);
    const existing = await db.select({ id: users.id, email: users.email }).from(users).where(or(eq(users.email, body.email), eq(users.username, body.username)));
    if (existing.length) throw conflict('account_exists', existing.some((e) => e.email === body.email) ? 'Ya existe una cuenta con ese correo.' : 'Ese nombre de usuario ya está en uso.');
    const passwordHash = await hash(body.password, ARGON);
    const [u] = await db.insert(users).values({ email: body.email, username: body.username, passwordHash }).returning();
    const token = await issueToken(ctx, u.id, 'verify_email', 24 * 3600_000);
    await mailer.send({ to: u.email, ...templates.verify(`${cfg.APP_ORIGIN}/verificar?token=${token}`, u.username) });
    await audit(db, { actorUserId: u.id, action: 'user.registered', targetType: 'user', targetId: u.id, ip: req.ip });
    await createSession(db, cfg, reply, req, u.id);
    reply.code(201);
    return { user: await publicUser(ctx, toAuthUser(u)) };
  });

  app.post('/api/auth/login', strict(10, '15 minutes'), async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const since = new Date(Date.now() - 15 * 60_000);
    const [{ n }] = await db.select({ n: count() }).from(loginAttempts).where(and(eq(loginAttempts.email, body.email), eq(loginAttempts.success, false), gt(loginAttempts.createdAt, since)));
    if (n >= 8) throw tooMany('Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.');
    const [u] = await db.select().from(users).where(eq(users.email, body.email));
    // constant-ish time: always run argon2 verification
    const ok = await verify(u?.passwordHash ?? (await getDummyHash()), body.password).catch(() => false);
    await db.insert(loginAttempts).values({ email: body.email, ip: req.ip, success: ok && !!u });
    if (!u || !ok) throw unauthorized('Correo o contraseña incorrectos.');
    if (u.status === 'suspended') throw forbidden('suspended', 'Tu cuenta está suspendida. Contacta a soporte.');
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
    await createSession(db, cfg, reply, req, u.id);
    return { user: await publicUser(ctx, toAuthUser(u)) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.sessionId) await db.delete(sessions).where(eq(sessions.id, req.sessionId));
    clearSessionCookie(reply, cfg);
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => ({ user: req.user ? await publicUser(ctx, req.user) : null }));

  app.post('/api/auth/verify-email', strict(20, '1 hour'), async (req) => {
    const { token } = verifyEmailSchema.parse(req.body);
    const userId = await consumeToken(ctx, token, 'verify_email');
    await db.update(users).set({ emailVerified: true, emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
    await audit(db, { actorUserId: userId, action: 'user.email_verified', targetType: 'user', targetId: userId, ip: req.ip });
    return { ok: true };
  });

  app.post('/api/auth/resend-verification', strict(3, '1 hour'), async (req) => {
    const u = requireUser(req);
    if (u.emailVerified) return { ok: true };
    const token = await issueToken(ctx, u.id, 'verify_email', 24 * 3600_000);
    await mailer.send({ to: u.email, ...templates.verify(`${cfg.APP_ORIGIN}/verificar?token=${token}`, u.username) });
    return { ok: true };
  });

  app.post('/api/auth/forgot-password', strict(5, '1 hour'), async (req) => {
    const { email } = forgotPasswordSchema.parse(req.body);
    const [u] = await db.select().from(users).where(eq(users.email, email));
    if (u && u.status === 'active') {
      const token = await issueToken(ctx, u.id, 'reset_password', 3600_000);
      await mailer.send({ to: u.email, ...templates.reset(`${cfg.APP_ORIGIN}/restablecer?token=${token}`) });
      await audit(db, { actorUserId: u.id, action: 'user.password_reset_requested', targetType: 'user', targetId: u.id, ip: req.ip });
    }
    // identical response whether or not the account exists (no user enumeration)
    return { ok: true };
  });

  app.post('/api/auth/reset-password', strict(10, '1 hour'), async (req, reply) => {
    const { token, password } = resetPasswordSchema.parse(req.body);
    const userId = await consumeToken(ctx, token, 'reset_password');
    await db.update(users).set({ passwordHash: await hash(password, ARGON), updatedAt: new Date() }).where(eq(users.id, userId));
    await db.delete(sessions).where(eq(sessions.userId, userId));
    clearSessionCookie(reply, cfg);
    await audit(db, { actorUserId: userId, action: 'user.password_reset', targetType: 'user', targetId: userId, ip: req.ip });
    return { ok: true };
  });

  app.post('/api/auth/change-password', strict(10, '1 hour'), async (req) => {
    const u = requireUser(req);
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const [row] = await db.select({ h: users.passwordHash }).from(users).where(eq(users.id, u.id));
    if (!(await verify(row.h, currentPassword).catch(() => false))) throw badRequest('wrong_password', 'La contraseña actual no es correcta.');
    await db.update(users).set({ passwordHash: await hash(newPassword, ARGON), updatedAt: new Date() }).where(eq(users.id, u.id));
    await db.delete(sessions).where(and(eq(sessions.userId, u.id), ne(sessions.id, req.sessionId!)));
    await audit(db, { actorUserId: u.id, action: 'user.password_changed', targetType: 'user', targetId: u.id, ip: req.ip });
    return { ok: true };
  });

  // One DominicanGames identity for every game: username, avatar, ranking visibility and language.
  app.patch('/api/account/profile', async (req) => {
    const u = requireUser(req);
    const patch = profileUpdateSchema.parse(req.body);
    if (patch.username !== undefined && patch.username !== u.username) {
      const [taken] = await db.select({ id: users.id }).from(users).where(and(eq(users.username, patch.username), ne(users.id, u.id)));
      if (taken) throw conflict('username_taken', 'Ese nombre de usuario ya está en uso.');
    }
    if (!Object.keys(patch).length) return { user: await publicUser(ctx, u) };
    const [row] = await db
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, u.id))
      .returning();
    await audit(db, { actorUserId: u.id, action: 'user.profile_updated', targetType: 'user', targetId: u.id, ip: req.ip, details: { fields: Object.keys(patch) } });
    return { user: await publicUser(ctx, toAuthUser(row)) };
  });

  app.get('/api/account/overview', async (req) => {
    const u = requireUser(req);
    const [pays, missions, save] = await Promise.all([
      db.select({ id: payments.id, status: payments.status, amount: payments.amount, currency: payments.currency, provider: payments.provider, createdAt: payments.createdAt, paidAt: payments.paidAt }).from(payments).where(eq(payments.userId, u.id)).orderBy(desc(payments.createdAt)).limit(20),
      db.select({ missionId: missionProgress.missionId, status: missionProgress.status, completedAt: missionProgress.completedAt, stats: missionProgress.stats }).from(missionProgress).where(and(eq(missionProgress.userId, u.id), eq(missionProgress.gameId, SDOW_GAME_ID))),
      db.select({ updatedAt: playerSaves.updatedAt, data: playerSaves.saveData }).from(playerSaves).where(and(eq(playerSaves.userId, u.id), eq(playerSaves.gameId, SDOW_GAME_ID))),
    ]);
    const s = save[0]?.data as { money?: number; discoveredLandmarks?: string[]; stats?: Record<string, number> } | undefined;
    return {
      user: await publicUser(ctx, u),
      payments: pays,
      missions,
      save: save[0] ? { updatedAt: save[0].updatedAt, money: s?.money ?? 0, landmarks: s?.discoveredLandmarks?.length ?? 0, stats: s?.stats ?? {} } : null,
    };
  });
}
