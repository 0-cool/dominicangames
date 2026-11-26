import { describe, expect, it } from 'vitest';
import { explainDbError, findErrorCode } from '../src/db/errors.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { TEST_DB } from './helpers.ts';

const pgError = (code: string, message: string) => Object.assign(new Error(message), { code, severity: 'FATAL' });

describe('database error explanations', () => {
  it('explains a rejected password, also when wrapped by drizzle, and points to the project port', () => {
    const wrapped = Object.assign(new Error('Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"'), { cause: pgError('28P01', 'password authentication failed for user "sd"') });
    expect(findErrorCode(wrapped)?.code).toBe('28P01');
    const msg = explainDbError(wrapped, 'postgres://sd:secret@localhost:5432/sd_open_world');
    expect(msg).toContain('PostgreSQL en localhost:5432 rechazó el usuario "sd"');
    expect(msg).toContain('127.0.0.1:55432');
    expect(msg).toContain('docker compose up -d');
    expect(msg).not.toContain('secret');
  });

  it('explains a closed port (including AggregateError from dual-stack localhost)', () => {
    const agg = Object.assign(new AggregateError([pgError('ECONNREFUSED', 'connect ECONNREFUSED ::1:55432'), pgError('ECONNREFUSED', 'connect ECONNREFUSED 127.0.0.1:55432')], 'connect failed'));
    const msg = explainDbError(agg, 'postgres://sd:x@127.0.0.1:55432/sd_open_world');
    expect(msg).toContain('No hay ningún PostgreSQL escuchando en 127.0.0.1:55432');
    expect(msg).not.toContain('Tu DATABASE_URL usa el puerto'); // already the project port
  });

  it('explains a missing database and ignores unrelated errors', () => {
    expect(explainDbError(pgError('3D000', 'database "dg" does not exist'), 'postgres://sd:x@127.0.0.1:55432/dg')).toContain('La base de datos "dg" no existe');
    expect(explainDbError(new Error('boom'), 'postgres://x')).toBeNull();
    expect(explainDbError(pgError('23505', 'duplicate key'), 'postgres://x')).toBeNull();
  });

  it('does not migrate (or skip the backup) when the database cannot be reached', async () => {
    const bad = new URL(TEST_DB);
    bad.password = 'definitely-wrong-password';
    await expect(runMigrations(bad.toString(), { backup: true })).rejects.toSatisfy((e: unknown) => findErrorCode(e)?.code === '28P01');
  });
});
