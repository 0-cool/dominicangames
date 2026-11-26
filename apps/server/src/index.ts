import { loadConfig } from './config.ts';
import { buildApp } from './app.ts';
import { explainDbError, exitWithError } from './db/errors.ts';
import { runMigrations } from './db/migrate.ts';

const cfg = loadConfig();
// Database problems at start-up (PostgreSQL not running, wrong password…) are explained instead of a stack trace.
const onStartError = (e: unknown) => (explainDbError(e, cfg.DATABASE_URL) ? exitWithError(e, cfg.DATABASE_URL) : Promise.reject(e));
if (process.env.MIGRATE_ON_START !== 'false') await runMigrations(cfg.DATABASE_URL, { backup: cfg.DB_BACKUP_BEFORE_MIGRATE, log: (m) => console.log(m) }).catch(onStartError);
const { app, ctx, close } = await buildApp(cfg).catch(onStartError);
await app.listen({ host: cfg.HOST, port: cfg.PORT });
app.log.info(`DominicanGames API on http://${cfg.HOST}:${cfg.PORT} (games=${ctx.modules.map((m) => m.id).join(',')}, monetization=${cfg.MONETIZATION_ENABLED ? 'on' : 'off'})`);
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => void close().then(() => process.exit(0)));
