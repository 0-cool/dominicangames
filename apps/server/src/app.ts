import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import compress from '@fastify/compress';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import type { Config } from './config.ts';
import { createDb, type DB } from './db/index.ts';
import { HttpError } from './lib/errors.ts';
import { registerSecurity } from './plugins/security.ts';
import { authRoutes } from './routes/auth.ts';
import { paymentRoutes } from './routes/payments.ts';
import { adminRoutes } from './routes/admin.ts';
import { miscRoutes } from './routes/misc.ts';
import { Mailer } from './services/email.ts';
import { logError } from './services/audit.ts';
import { PaymentService, type Product } from './services/payments/service.ts';
import { SandboxProvider } from './services/payments/sandbox.ts';
import { AzulProvider } from './services/payments/azul.ts';
import { CardnetProvider } from './services/payments/cardnet.ts';
import { DisabledProvider } from './services/payments/disabled.ts';
import type { PaymentProvider } from './services/payments/provider.ts';
import { Monetization } from './monetization/index.ts';
import { CatalogService } from './platform/catalog.ts';
import { platformRoutes } from './platform/index.ts';
import type { GameModule } from './platform/modules.ts';
import { createIndexRenderer } from './platform/seo.ts';
import { GAME_MODULES } from './games/index.ts';

/** Shared services handed to every route module (DominicanGames Core + game modules). */
export interface Ctx {
  db: DB;
  cfg: Config;
  mailer: Mailer;
  payments: PaymentService;
  monetization: Monetization;
  catalog: CatalogService;
  modules: readonly GameModule[];
}

/**
 * Payment provider for DG Monetization. The sandbox (simulated hosted page) is only available outside production
 * (or explicitly in staging); with monetization off and no usable provider every payment operation is refused.
 */
function createProvider(cfg: Config): PaymentProvider {
  if (cfg.PAYMENT_PROVIDER === 'azul') return new AzulProvider(cfg);
  if (cfg.PAYMENT_PROVIDER === 'cardnet') return new CardnetProvider();
  const sandboxAllowed = !cfg.isProd || cfg.ALLOW_SANDBOX_IN_PRODUCTION;
  if (sandboxAllowed && cfg.SANDBOX_WEBHOOK_SECRET) return new SandboxProvider(cfg.SANDBOX_WEBHOOK_SECRET, cfg.APP_ORIGIN);
  return new DisabledProvider();
}

export async function buildApp(cfg: Config, opts: { db?: DB; provider?: PaymentProvider; products?: Product[]; modules?: readonly GameModule[] } = {}): Promise<{ app: FastifyInstance; ctx: Ctx; close: () => Promise<void> }> {
  const app = Fastify({
    trustProxy: cfg.TRUST_PROXY,
    bodyLimit: 256 * 1024,
    logger: {
      level: cfg.NODE_ENV === 'test' ? 'silent' : cfg.LOG_LEVEL,
      redact: { paths: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]', '*.password', '*.token'], censor: '[redacted]' },
    },
  });
  const created = opts.db ? null : createDb(cfg.DATABASE_URL);
  const db = opts.db ?? created!.db;
  const mailer = new Mailer(cfg, db, app.log);
  const provider = opts.provider ?? createProvider(cfg);
  const payments = new PaymentService(db, cfg, provider, mailer);
  const ctx: Ctx = { db, cfg, mailer, payments, monetization: new Monetization(cfg, payments, opts.products ?? []), catalog: new CatalogService(db), modules: opts.modules ?? GAME_MODULES };

  // JSON parser that keeps the raw body (needed to verify webhook signatures)
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    (req as unknown as { rawBody: string }).rawBody = body as string;
    if (!body) return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch {
      const e = new HttpError(400, 'invalid_json', 'JSON inválido.');
      done(e, undefined);
    }
  });
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => done(null, Object.fromEntries(new URLSearchParams(body as string))));

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'", ...(provider.hostedPageOrigin ? [provider.hostedPageOrigin] : [])],
        baseUri: ["'self'"],
        upgradeInsecureRequests: cfg.isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: cfg.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
  });
  await app.register(rateLimit, { global: true, max: Math.ceil(300 * cfg.RATE_LIMIT_SCALE), timeWindow: '1 minute', keyGenerator: (req) => req.ip, errorResponseBuilder: () => ({ statusCode: 429, error: 'rate_limited', message: 'Demasiadas solicitudes. Espera un momento.' }) });
  await app.register(compress, { global: true, threshold: 1024 });

  registerSecurity(app, db, cfg);

  app.setErrorHandler(async (err, req, reply) => {
    if (err instanceof ZodError) {
      reply.code(400);
      return { error: 'validation', message: err.issues[0]?.message ?? 'Datos inválidos.', fields: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
    }
    if (err instanceof HttpError) {
      reply.code(err.statusCode);
      return { error: err.code, message: err.message };
    }
    const e = err as { statusCode?: number; message: string; stack?: string; code?: string };
    if (e.statusCode && e.statusCode < 500) {
      reply.code(e.statusCode);
      return { error: e.code ?? 'bad_request', message: e.statusCode === 429 ? 'Demasiadas solicitudes. Espera un momento.' : 'Solicitud inválida.' };
    }
    req.log.error({ err: e.message }, 'unhandled error');
    await logError(db, { source: 'server', message: e.message, stack: e.stack, context: { url: req.url, method: req.method }, userId: req.user?.id });
    reply.code(500);
    return { error: 'internal', message: e.message.includes('no está listo para cobrar') ? e.message : 'Ocurrió un error inesperado. Intenta de nuevo.' };
  });

  authRoutes(app, ctx);
  platformRoutes(app, ctx);
  paymentRoutes(app, ctx);
  adminRoutes(app, ctx);
  miscRoutes(app, ctx);

  // Production: serve the built web app (SPA fallback for client-side routes, with per-route SEO head tags).
  const dist = cfg.WEB_DIST_DIR ? resolve(cfg.WEB_DIST_DIR) : null;
  if (dist && existsSync(dist)) {
    await app.register(fastifyStatic, { root: dist, wildcard: false, index: false, maxAge: '1h', immutable: false });
    const renderIndex = createIndexRenderer(ctx, dist);
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith('/api/') || (req.method !== 'GET' && req.method !== 'HEAD')) return reply.code(404).send({ error: 'not_found', message: 'No encontrado.' });
      const html = await renderIndex(req.url);
      if (html === null) return reply.sendFile('index.html');
      return reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-cache').send(html);
    });
  }

  return { app, ctx, close: async () => { await app.close(); await created?.pool.end(); } };
}
