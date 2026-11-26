import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/db/migrate.ts';
import { rollbackMigration } from '../src/db/maintenance.ts';
import { TEST_DB } from './helpers.ts';

/**
 * Migrations 0001 (DominicanGames platform) and 0002 (El Tapón) on a database that already has players:
 * up → down (newest first) → up.
 * Uses a scratch database; skipped when the test role cannot create databases.
 */
const here = dirname(fileURLToPath(import.meta.url));
const drizzleDir = resolve(here, '../drizzle');
const scratchName = `sd_migtest_${process.pid}`;
const scratchUrl = (() => {
  const u = new URL(TEST_DB);
  u.pathname = `/${scratchName}`;
  return u.toString();
})();

let admin: pg.Client;
let canRun = true;

beforeAll(async () => {
  admin = new pg.Client({ connectionString: TEST_DB });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${scratchName}`);
    await admin.query(`CREATE DATABASE ${scratchName}`);
  } catch {
    canRun = false;
  }
});

afterAll(async () => {
  if (canRun) await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`).catch(() => undefined);
  await admin.end();
  delete process.env.MIGRATIONS_DIR;
  delete process.env.BACKUP_DIR;
});

/** A migrations folder containing only 0000_init (the schema before DominicanGames). */
function legacyFolder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sd-legacy-mig-'));
  mkdirSync(join(dir, 'meta'));
  copyFileSync(join(drizzleDir, '0000_init.sql'), join(dir, '0000_init.sql'));
  copyFileSync(join(drizzleDir, 'meta/0000_snapshot.json'), join(dir, 'meta/0000_snapshot.json'));
  const journal = JSON.parse(readFileSync(join(drizzleDir, 'meta/_journal.json'), 'utf8'));
  journal.entries = journal.entries.filter((e: { idx: number }) => e.idx === 0);
  writeFileSync(join(dir, 'meta/_journal.json'), JSON.stringify(journal));
  return dir;
}

async function q<T extends pg.QueryResultRow>(sqlText: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: scratchUrl });
  await c.connect();
  try {
    return (await c.query<T>(sqlText, params)).rows;
  } finally {
    await c.end();
  }
}

const legacySave = { version: 1, player: { x: 10, y: 0, z: 20, heading: 45 }, vehicle: null, money: 1234, timeOfDay: 18, weather: 'rain', discoveredLandmarks: ['catedral', 'alcazar'], stats: { distanceWalked: 100, distanceDriven: 5000, playTimeSec: 900, topSpeedKmh: 95 }, savedAt: '2026-11-20T12:00:00.000Z' };

describe('migration 0001_dominicangames_platform', () => {
  it('preserves existing saves going up, rolls back cleanly and re-applies', async () => {
    if (!canRun) return;
    // ── 1. database as it was before DominicanGames, with a paying player and a save ──
    process.env.MIGRATIONS_DIR = legacyFolder();
    await runMigrations(scratchUrl);
    const [u] = await q<{ id: string }>(`insert into users (email, username, password_hash, email_verified) values ('legacy@example.com', 'legacy_player', 'x', true) returning id`);
    await q(`insert into player_saves (user_id, save_data) values ($1, $2)`, [u.id, JSON.stringify(legacySave)]);
    await q(`insert into game_settings (user_id, settings_json) values ($1, '{"language":"es"}')`, [u.id]);
    await q(`insert into mission_progress (user_id, mission_id, status, stats, completed_at) values ($1, 'm001_bienvenido', 'completed', '{"timeSec":300}', now())`, [u.id]);
    const [p] = await q<{ id: string }>(`insert into payments (user_id, provider, provider_reference, idempotency_key, amount, itbis, currency, status, paid_at) values ($1, 'sandbox', 'sbx_legacy', 'k-legacy', 10000, 1525, 'DOP', 'succeeded', now()) returning id`, [u.id]);
    await q(`insert into game_access (user_id, access_status, payment_id) values ($1, 'active', $2)`, [u.id, p.id]);

    // ── 2. up (with automatic backup) ──
    delete process.env.MIGRATIONS_DIR;
    const backups = mkdtempSync(join(tmpdir(), 'sd-backups-'));
    process.env.BACKUP_DIR = backups;
    await runMigrations(scratchUrl, { backup: true });
    const files = readdirSync(backups).filter((f) => f.endsWith('.json'));
    expect(files.length).toBe(1);
    const dump = JSON.parse(readFileSync(join(backups, files[0]), 'utf8'));
    expect(dump.tables.player_saves[0].save_data.money).toBe(1234);

    const saves = await q<{ game_id: string; save_data: typeof legacySave }>(`select game_id, save_data from player_saves where user_id = $1`, [u.id]);
    expect(saves).toHaveLength(1);
    expect(saves[0].game_id).toBe('santo-domingo-open-world');
    expect(saves[0].save_data).toEqual(legacySave);
    expect((await q(`select game_id from game_settings where user_id = $1`, [u.id]))[0]).toMatchObject({ game_id: 'santo-domingo-open-world' });
    expect((await q(`select game_id, status from mission_progress where user_id = $1`, [u.id]))[0]).toMatchObject({ game_id: 'santo-domingo-open-world', status: 'completed' });
    expect((await q(`select id from games order by sort_order`)).map((r) => r.id)).toEqual(['santo-domingo-open-world', 'el-tapon', 'moto-rd', 'caribbean-racing', 'island-survival']);
    expect((await q(`select guest_play from games where id = 'el-tapon'`))[0]).toEqual({ guest_play: true });
    expect((await q(`select count(*)::int n from announcements`))[0].n).toBe(1);
    expect((await q(`select avatar, show_in_rankings, locale from users where id = $1`, [u.id]))[0]).toEqual({ avatar: null, show_in_rankings: true, locale: 'es' });
    // legacy purchase history is untouched
    expect((await q(`select status from payments where id = $1`, [p.id]))[0].status).toBe('succeeded');
    // the column default used for the backfill is gone (new rows must name their game)
    await expect(q(`insert into player_saves (user_id, save_data) values ($1, '{}')`, [u.id])).rejects.toThrow();

    // ── 3. down (newest first: 0001 cannot be undone while 0002 is applied) ──
    await expect(rollbackMigration(scratchUrl, '0001_dominicangames_platform')).rejects.toThrow(/0002_el_tapon/);
    await rollbackMigration(scratchUrl, '0002_el_tapon');
    expect(await q(`select to_regclass('public.arcade_runs') as t`)).toEqual([{ t: null }]);
    expect(await q(`select id from games where id = 'el-tapon'`)).toEqual([]);
    expect((await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'games'`)).map((c) => c.column_name)).not.toContain('guest_play');
    await rollbackMigration(scratchUrl, '0001_dominicangames_platform');
    const cols = await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'player_saves'`);
    expect(cols.map((c) => c.column_name)).not.toContain('game_id');
    expect(await q(`select to_regclass('public.games') as t`)).toEqual([{ t: null }]);
    const back = await q<{ save_data: typeof legacySave }>(`select save_data from player_saves where user_id = $1`, [u.id]);
    expect(back[0].save_data).toEqual(legacySave);
    await expect(q(`insert into player_saves (user_id, save_data) values ($1, '{}')`, [u.id])).rejects.toThrow(/unique|duplicate/i); // one save per user again

    // ── 4. up again ──
    await runMigrations(scratchUrl);
    const again = await q<{ game_id: string; save_data: typeof legacySave }>(`select game_id, save_data from player_saves where user_id = $1`, [u.id]);
    expect(again[0]).toEqual({ game_id: 'santo-domingo-open-world', save_data: legacySave });
    expect((await q(`select id, guest_play from games where id = 'el-tapon'`))[0]).toEqual({ id: 'el-tapon', guest_play: true });
    expect(existsSync(backups)).toBe(true);
  });
});
