import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { CliError } from './errors.ts';

/**
 * Database safety tooling for DominicanGames:
 *  - locate the SQL migrations folder (works from src/ in dev and from the bundled dist/),
 *  - detect pending migrations (compares drizzle's journal with drizzle.__drizzle_migrations),
 *  - write a JSON backup of every table before schema changes (no pg_dump needed — works on Windows),
 *  - roll back a migration with its hand-written `drizzle/rollback/<tag>.down.sql`.
 */

const here = dirname(fileURLToPath(import.meta.url));

export function migrationsFolder(): string {
  // src/db/maintenance.ts (dev) → ../../drizzle; dist/index.js (bundled) → ../drizzle
  const candidates = [resolve(here, '../../drizzle'), resolve(here, '../drizzle')];
  return process.env.MIGRATIONS_DIR ?? candidates.find((c) => existsSync(resolve(c, 'meta/_journal.json'))) ?? candidates[0];
}

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

export function readJournal(folder = migrationsFolder()): JournalEntry[] {
  const j = JSON.parse(readFileSync(resolve(folder, 'meta/_journal.json'), 'utf8')) as { entries: JournalEntry[] };
  return j.entries;
}

/** Migrations present in the journal but not yet recorded as applied in the database. */
export async function pendingMigrations(url: string): Promise<string[]> {
  const entries = readJournal();
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const exists = await pool.query(`select to_regclass('drizzle.__drizzle_migrations') as t`);
    if (!exists.rows[0]?.t) return entries.map((e) => e.tag);
    const r = await pool.query<{ last: string | null }>(`select max(created_at)::text as last from drizzle.__drizzle_migrations`);
    const last = r.rows[0]?.last ? Number(r.rows[0].last) : 0;
    return entries.filter((e) => e.when > last).map((e) => e.tag);
  } finally {
    await pool.end();
  }
}

/** Repository root (folder with the workspace package.json), used for the default backups/ folder. */
function repoRoot(): string {
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        if (JSON.parse(readFileSync(pkg, 'utf8')).workspaces) return dir;
      } catch {
        /* keep walking */
      }
    }
    dir = dirname(dir);
  }
  return process.cwd();
}

export function backupsDir(): string {
  return process.env.BACKUP_DIR ? resolve(process.env.BACKUP_DIR) : join(repoRoot(), 'backups');
}

/**
 * Writes `{ createdAt, label, tables: { <name>: rows[] } }` with every row of every table in the public schema
 * (plus drizzle's migration log). Returns the file path. Sessions and login attempts are skipped (security data,
 * regenerated naturally) unless `full` is true.
 */
export async function backupDatabase(url: string, label = 'manual', opts: { full?: boolean } = {}): Promise<string> {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const t = await pool.query<{ table_name: string }>(`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`);
    const skip = opts.full ? new Set<string>() : new Set(['sessions', 'login_attempts']);
    const tables: Record<string, unknown[]> = {};
    for (const { table_name } of t.rows) {
      if (skip.has(table_name)) continue;
      const rows = await pool.query(`select * from "${table_name.replace(/"/g, '""')}"`);
      tables[table_name] = rows.rows;
    }
    const mig = await pool.query(`select to_regclass('drizzle.__drizzle_migrations') as t`);
    if (mig.rows[0]?.t) tables['drizzle.__drizzle_migrations'] = (await pool.query('select * from drizzle.__drizzle_migrations order by id')).rows;
    const dir = backupsDir();
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = join(dir, `db-${stamp}-${label.replace(/[^a-z0-9_-]/gi, '_')}.json`);
    writeFileSync(file, JSON.stringify({ createdAt: new Date().toISOString(), label, database: new URL(url).pathname.slice(1), tables }, null, 0));
    return file;
  } finally {
    await pool.end();
  }
}

/** Runs drizzle/rollback/<tag>.down.sql in one transaction and forgets the migration so it can be re-applied. */
export async function rollbackMigration(url: string, tag: string): Promise<void> {
  if (!/^[0-9]{4}_[a-z0-9_]+$/.test(tag)) throw new CliError(`Nombre de migración no válido: ${tag}`);
  const folder = migrationsFolder();
  const entry = readJournal(folder).find((e) => e.tag === tag);
  if (!entry) throw new CliError(`La migración ${tag} no existe en drizzle/meta/_journal.json.`);
  const file = resolve(folder, 'rollback', `${tag}.down.sql`);
  if (!existsSync(file)) throw new CliError(`No hay script de reversión para ${tag} (${file}).`);
  const sqlText = readFileSync(file, 'utf8');
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const applied = await client.query(`select 1 from drizzle.__drizzle_migrations where created_at = $1`, [entry.when]);
    if (!applied.rowCount) throw new CliError(`La migración ${tag} no está aplicada en esta base de datos: no hay nada que deshacer.`);
    // Migrations are undone newest first: rolling back an older one under a newer one would break the schema
    // (and drizzle would never re-apply it, because it only looks at the newest applied migration).
    const later = await client.query<{ created_at: string }>(`select created_at::text from drizzle.__drizzle_migrations where created_at > $1 order by created_at desc`, [entry.when]);
    if (later.rowCount) {
      const journal = readJournal(folder);
      const tags = later.rows.map((r) => journal.find((e) => String(e.when) === r.created_at)?.tag ?? r.created_at);
      throw new CliError(`Primero deshaz las migraciones más nuevas, en este orden: ${tags.join(', ')}.`);
    }
    await client.query(sqlText);
    await client.query(`delete from drizzle.__drizzle_migrations where created_at = $1`, [entry.when]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * True when this module file is the process entry point (works on Windows paths too). `name` guards against
 * bundles: once inlined into dist/index.js every module shares the bundle's import.meta.url.
 */
export function isEntryPoint(metaUrl: string, name: string): boolean {
  const entry = process.argv[1];
  if (!entry || !basename(entry).startsWith(name)) return false;
  try {
    return resolve(fileURLToPath(metaUrl)).toLowerCase() === resolve(entry).toLowerCase();
  } catch {
    return false;
  }
}
