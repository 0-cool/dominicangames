import { resolve } from 'node:path';
import { z } from 'zod';

const bool = z.union([z.boolean(), z.string()]).transform((v) => v === true || v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_UNPOOLED: z.string().optional(),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  TRUST_PROXY: bool.default(false),
  COOKIE_SECURE: bool.optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  CSRF_SECRET: z.string().min(32),
  /**
   * DG Monetization master switch. DominicanGames is free: with `false` (default) no checkout can be created and
   * no purchase UI is shown. Webhooks/refunds for payments made before the change keep working.
   */
  MONETIZATION_ENABLED: bool.default(false),
  PAYMENT_PROVIDER: z.enum(['sandbox', 'azul', 'cardnet']).default('sandbox'),
  ALLOW_SANDBOX_IN_PRODUCTION: bool.default(false),
  /** Legacy RD$100 purchases: a refund also revokes the (now cosmetic) Fundador entitlement. */
  REVOKE_ACCESS_ON_REFUND: bool.default(true),
  SANDBOX_WEBHOOK_SECRET: z.string().min(32).optional(),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('DominicanGames <no-reply@localhost>'),
  DEV_MAILBOX: bool.default(false),
  GAME_DATA_DIR: z.string().default(resolve(process.cwd(), 'game-data')),
  WEB_DIST_DIR: z.string().optional(),
  AZUL_ENV: z.enum(['test', 'production']).default('test'),
  AZUL_MERCHANT_ID: z.string().optional(),
  AZUL_STORE: z.string().optional(),
  AZUL_CHANNEL: z.string().default('EC'),
  AZUL_AUTH1: z.string().optional(),
  AZUL_AUTH2: z.string().optional(),
  AZUL_CERT_PATH: z.string().optional(),
  AZUL_KEY_PATH: z.string().optional(),
  RATE_LIMIT_SCALE: z.coerce.number().min(1).max(1000).default(1),
  /** Write a JSON backup of every table before applying pending migrations (db:migrate and server boot). */
  DB_BACKUP_BEFORE_MIGRATE: bool.default(true),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Config = z.infer<typeof schema> & { cookieSecure: boolean; isProd: boolean };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${msg}`);
  }
  const c = parsed.data;
  const isProd = c.NODE_ENV === 'production';
  // Payment provider rules only matter when DG Monetization is switched on (it is off by default: free platform).
  if (c.MONETIZATION_ENABLED) {
    if (isProd && c.PAYMENT_PROVIDER === 'sandbox' && !c.ALLOW_SANDBOX_IN_PRODUCTION) {
      throw new Error('PAYMENT_PROVIDER=sandbox is not allowed in production (set a real provider, or ALLOW_SANDBOX_IN_PRODUCTION=true for a staging environment).');
    }
    if (c.PAYMENT_PROVIDER === 'sandbox' && !c.SANDBOX_WEBHOOK_SECRET) throw new Error('SANDBOX_WEBHOOK_SECRET (>=32 chars) is required for the sandbox provider.');
  }
  if (isProd && c.DEV_MAILBOX) throw new Error('DEV_MAILBOX must be disabled in production.');
  if (isProd && [c.CSRF_SECRET, c.SANDBOX_WEBHOOK_SECRET ?? ''].some((s) => s.includes('change-me'))) throw new Error('Replace the placeholder secrets from .env.example before running in production.');
  if (isProd && !c.SMTP_URL) throw new Error('SMTP_URL is required in production.');
  return { ...c, isProd, cookieSecure: c.COOKIE_SECURE ?? isProd };
}
