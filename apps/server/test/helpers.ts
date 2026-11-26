import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import type { Product } from '../src/services/payments/service.ts';
import { loadConfig } from '../src/config.ts';
import { createDb } from '../src/db/index.ts';
import { runMigrations } from '../src/db/migrate.ts';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://sd:sd_dev_password@127.0.0.1:55432/sd_open_world_test';

/** An optional product used only to exercise the (disabled by default) DG Monetization payment engine. */
export const TEST_PRODUCT: Product = { code: 'TEST_COSMETIC', title: 'Producto de prueba', description: 'Solo para pruebas automáticas', amountMinor: 10000, itbisMinor: 1525, currency: 'DOP', kind: 'one_time' };

export async function setup(overrides: Record<string, string> = {}, opts: { truncate?: boolean; products?: Product[] } = {}) {
  const gameData = join(tmpdir(), `sd-game-data-${process.pid}`);
  mkdirSync(join(gameData, 'world'), { recursive: true });
  writeFileSync(join(gameData, 'world', 'manifest.json'), JSON.stringify({ version: 1, test: true }));
  const cfg = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB,
    APP_ORIGIN: 'http://localhost:5173',
    CSRF_SECRET: 'test-csrf-secret-test-csrf-secret-0001',
    SANDBOX_WEBHOOK_SECRET: 'test-webhook-secret-test-webhook-secret-01',
    DEV_MAILBOX: 'true',
    GAME_DATA_DIR: gameData,
    RATE_LIMIT_SCALE: '100',
    LOG_LEVEL: 'silent',
    ...overrides,
  } as NodeJS.ProcessEnv);
  await runMigrations(TEST_DB);
  const { db, pool } = createDb(TEST_DB);
  // The catalog (games) and the seeded announcement come from the migration and are kept between runs.
  if (opts.truncate !== false) await db.execute(sql`TRUNCATE users, sessions, email_tokens, payments, webhook_events, game_access, player_saves, mission_progress, game_settings, game_sessions, user_achievements, arcade_runs, audit_logs, error_logs, support_tickets, login_attempts, dev_emails CASCADE`);
  const built = await buildApp(cfg, { db, products: opts.products });
  return { ...built, db, cfg, done: async () => { await built.app.close(); await pool.end(); } };
}

/** Cookie-jar client over app.inject with automatic CSRF header. */
export class Client {
  cookies = new Map<string, string>();
  csrf = '';
  constructor(private readonly app: FastifyInstance) {}
  private jar() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  private store(setCookie: string | string[] | undefined) {
    for (const c of ([] as string[]).concat(setCookie ?? [])) {
      const [kv] = c.split(';');
      const [k, ...v] = kv.split('=');
      const val = v.join('=');
      if (!val || /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)) this.cookies.delete(k);
      else this.cookies.set(k, val);
    }
  }
  async init() {
    const r = await this.app.inject({ method: 'GET', url: '/api/auth/csrf', headers: { cookie: this.jar() } });
    this.store(r.headers['set-cookie']);
    this.csrf = r.json().token;
    return this;
  }
  async req(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, body?: unknown, extra: Record<string, string> = {}) {
    const r = await this.app.inject({ method, url, payload: body as object, headers: { cookie: this.jar(), 'x-csrf-token': this.csrf, origin: 'http://localhost:5173', ...extra } });
    this.store(r.headers['set-cookie']);
    return r;
  }
}

export async function lastEmailLink(c: Client, pattern: RegExp): Promise<string> {
  const r = await c.req('GET', '/api/dev/mailbox');
  for (const e of r.json().emails as { text: string }[]) {
    const m = e.text.match(pattern);
    if (m) return m[1];
  }
  throw new Error('email not found');
}
