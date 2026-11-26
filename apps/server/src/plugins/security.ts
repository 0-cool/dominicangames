import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, gt } from 'drizzle-orm';
import type { Config } from '../config.ts';
import type { DB } from '../db/index.ts';
import { sessions, users } from '../db/schema.ts';
import { hmacSha256, randomToken, safeEqual, sha256 } from '../lib/crypto.ts';
import { forbidden, unauthorized } from '../lib/errors.ts';

export const SESSION_COOKIE = 'sd_session';
export const CSRF_COOKIE = 'sd_csrf';

/** The DominicanGames identity attached to a request (one account for every game). */
export interface AuthUser {
  id: string;
  email: string;
  username: string;
  emailVerified: boolean;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  createdAt: Date;
  avatar: string | null;
  showInRankings: boolean;
  locale: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
    sessionId: string | null;
  }
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Sessions (opaque random token in an HttpOnly cookie, SHA-256 stored server-side),
 * CSRF (HMAC-bound double-submit token in X-CSRF-Token + Origin check) and the
 * authorization guards used by routes.
 */
export function registerSecurity(app: FastifyInstance, db: DB, cfg: Config) {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  app.addHook('onRequest', async (req) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
    const id = sha256(token);
    const rows = await db
      .select({ s: sessions, u: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
      .limit(1);
    const row = rows[0];
    if (!row) return;
    req.sessionId = id;
    req.user = { id: row.u.id, email: row.u.email, username: row.u.username, emailVerified: row.u.emailVerified, role: row.u.role, status: row.u.status, createdAt: row.u.createdAt, avatar: row.u.avatar, showInRankings: row.u.showInRankings, locale: row.u.locale };
    // rolling expiry, at most once every 10 minutes
    if (Date.now() - row.s.lastSeenAt.getTime() > 10 * 60_000) {
      await db
        .update(sessions)
        .set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + cfg.SESSION_TTL_DAYS * 86400_000) })
        .where(eq(sessions.id, id));
    }
  });

  // CSRF + Origin enforcement for state-changing API calls (webhooks are authenticated by signature instead).
  app.addHook('preHandler', async (req) => {
    if (!UNSAFE.has(req.method)) return;
    const url = req.url.split('?')[0];
    if (!url.startsWith('/api/') || url.startsWith('/api/payments/webhook/')) return;
    const origin = req.headers.origin;
    if (origin && origin !== cfg.APP_ORIGIN) throw forbidden('bad_origin', 'Origen no permitido.');
    const secret = req.cookies[CSRF_COOKIE];
    const header = req.headers['x-csrf-token'];
    const sent = Array.isArray(header) ? header[0] : header;
    if (!secret || !sent || !safeEqual(hmacSha256(cfg.CSRF_SECRET, secret), sent)) throw forbidden('csrf', 'Token CSRF inválido. Recarga la página.');
  });

  app.get('/api/auth/csrf', async (req, reply) => {
    let secret = req.cookies[CSRF_COOKIE];
    if (!secret || !/^[a-f0-9]{64}$/.test(secret)) {
      secret = randomToken();
      reply.setCookie(CSRF_COOKIE, secret, { httpOnly: true, sameSite: 'strict', secure: cfg.cookieSecure, path: '/', maxAge: 60 * 60 * 24 * 7 });
    }
    return { token: hmacSha256(cfg.CSRF_SECRET, secret) };
  });
}

export async function createSession(db: DB, cfg: Config, reply: FastifyReply, req: FastifyRequest, userId: string) {
  const token = randomToken();
  await db.insert(sessions).values({
    id: sha256(token),
    userId,
    expiresAt: new Date(Date.now() + cfg.SESSION_TTL_DAYS * 86400_000),
    ip: req.ip,
    userAgent: (req.headers['user-agent'] ?? '').slice(0, 300),
  });
  reply.setCookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: cfg.cookieSecure, path: '/', maxAge: cfg.SESSION_TTL_DAYS * 86400 });
}

export function clearSessionCookie(reply: FastifyReply, cfg: Config) {
  reply.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: cfg.cookieSecure });
}

export function requireUser(req: FastifyRequest): AuthUser {
  if (!req.user) throw unauthorized();
  if (req.user.status === 'suspended') throw forbidden('suspended', 'Tu cuenta está suspendida. Contacta a soporte.');
  return req.user;
}

export function requireVerified(req: FastifyRequest): AuthUser {
  const u = requireUser(req);
  if (!u.emailVerified) throw forbidden('email_not_verified', 'Confirma tu correo electrónico para continuar.');
  return u;
}

// NOTE: the former `requireAccess` (RD$100 paywall) was removed when DominicanGames became free.
// Game endpoints use `requireGameAccess` (platform/catalog.ts): signed-in account + playable game, no payment.

export function requireAdmin(req: FastifyRequest): AuthUser {
  const u = requireUser(req);
  if (u.role !== 'admin') throw forbidden('forbidden', 'No autorizado.');
  return u;
}
