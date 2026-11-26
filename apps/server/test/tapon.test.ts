import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TaponStats } from '@sd/shared';
import { SIM_STEP, World, encodeInputs } from '@sd/tapon/sim';
import { pathFrom, predictFree } from '../../../packages/tapon/src/sim/fairness.ts';
import { arcadeRuns, users } from '../src/db/schema.ts';
import { Client, lastEmailLink, setup } from './helpers.ts';

let env: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  env = await setup();
});
afterAll(async () => {
  await env.done();
});

const pw = 'contraseña-segura-123';
async function newUser(name: string) {
  const c = await new Client(env.app).init();
  expect((await c.req('POST', '/api/auth/register', { email: `${name}@example.com`, username: name, password: pw, acceptTerms: true })).statusCode).toBe(201);
  const token = await lastEmailLink(c, /verificar\?token=([a-f0-9]{64})/);
  expect((await c.req('POST', '/api/auth/verify-email', { token })).statusCode).toBe(200);
  return c;
}

interface Played {
  score: number;
  stats: TaponStats;
  steps: number;
  inputs: number[];
}

/**
 * Plays a real run on the server's seed, like the browser does: a driver that dodges for `skillS` seconds (with the
 * game's own escape search) and then stops steering until the three cascos are gone.
 */
function play(seed: number, skillS: number): Played {
  const w = new World(seed);
  const inputs: [number, -1 | 1][] = [];
  while (!w.over && w.steps < 60 * 60 * 10) {
    if (w.steps < skillS * 60) {
      const ents = w.entities.filter((e) => e.deadly && e.x + e.hb1 > w.dist - 30 && e.x < w.dist + 90).map(World.pred);
      const p = w.predPlayer();
      const path = pathFrom(p, predictFree(p, ents), 0);
      if (path)
        for (let k = 1; k < path.length; k++)
          if (path[k][1] !== path[k - 1][1]) {
            if (path[k - 1][0] === 0) {
              const dir = path[k][1] > path[k - 1][1] ? 1 : -1;
              inputs.push([w.steps, dir]);
              w.move(dir);
            }
            break;
          }
    }
    w.step(SIM_STEP);
    w.events.length = 0;
  }
  return { score: w.score, stats: w.finalStats(), steps: w.steps, inputs: encodeInputs(inputs) };
}

/** Registers a run. Tests simulate runs instantly, so the start is moved back in time as if it had been played. */
async function startRun(c: Client, playedForMs = 3600_000) {
  const r = await c.req('POST', '/api/arcade/el-tapon/runs');
  expect(r.statusCode).toBe(201);
  const t = r.json() as { runId: string; secret: string; seed: number; simVersion: number };
  if (playedForMs) await env.db.update(arcadeRuns).set({ startedAt: new Date(Date.now() - playedForMs) }).where(eq(arcadeRuns.id, t.runId));
  return t;
}

const finishBody = (t: { secret: string; simVersion: number }, p: Played, extra: Record<string, unknown> = {}) => ({
  secret: t.secret,
  score: p.score,
  stats: p.stats,
  replay: { simVersion: t.simVersion, steps: p.steps, inputs: p.inputs },
  ...extra,
});

describe('El Tapón (arcade, guest play + high scores)', () => {
  it('is in the catalog as a free game guests can play without an account', async () => {
    const r = await env.app.inject({ method: 'GET', url: '/api/platform/games/el-tapon' });
    expect(r.statusCode).toBe(200);
    expect(r.json().game).toMatchObject({ id: 'el-tapon', status: 'published', guestPlay: true, playable: true, launchPath: '/juegos/el-tapon/jugar' });
  });

  it('a guest plays, saves the score with a nickname and appears in the table (replayed on the server)', async () => {
    const guest = await new Client(env.app).init();
    const t = await startRun(guest);
    expect(t.secret).toMatch(/^[a-f0-9]{48}$/);
    const run = play(t.seed, 12);
    expect(run.stats.distanceM).toBeGreaterThan(50);
    const url = `/api/arcade/el-tapon/runs/${t.runId}/finish`;
    // nickname rules (the run is not used up by a refused name)
    expect((await guest.req('POST', url, finishBody(t, run))).json().error).toBe('guest_name_required');
    expect((await guest.req('POST', url, finishBody(t, run, { guestName: 'mamaguevo23' }))).json().error).toBe('guest_name_invalid');
    expect((await guest.req('POST', url, finishBody(t, run, { guestName: 'Admin DG' }))).json().error).toBe('guest_name_invalid');
    await newUser('chichi_rd');
    expect((await guest.req('POST', url, finishBody(t, run, { guestName: 'CHICHI_RD' }))).json().error).toBe('guest_name_taken');
    // a wrong secret looks like a run that does not exist
    expect((await guest.req('POST', url, { ...finishBody(t, run, { guestName: 'La Motoconchista' }), secret: 'f'.repeat(48) })).statusCode).toBe(404);

    const r = await guest.req('POST', url, finishBody(t, run, { guestName: 'La Motoconchista' }));
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ status: 'verified', rank: 1, weekRank: 1, personalBest: run.score });
    // once only
    expect((await guest.req('POST', url, finishBody(t, run, { guestName: 'La Motoconchista' }))).statusCode).toBe(409);

    const board = (await guest.req('GET', '/api/arcade/el-tapon/leaderboard?period=week')).json();
    expect(board.entries[0]).toMatchObject({ rank: 1, name: 'La Motoconchista', guest: true, score: run.score, avatar: null });
    expect(board.me).toBeNull();
    const community = (await guest.req('GET', '/api/platform/community')).json();
    const tapon = (community.leaderboards as { id: string; entries: { username: string; guest?: boolean }[] }[]).find((b) => b.id === 'tapon_records')!;
    expect(tapon.entries[0]).toMatchObject({ username: 'La Motoconchista', guest: true });
    // the replay data is dropped once verified, and no IP is stored in clear
    const [row] = await env.db.select().from(arcadeRuns).where(eq(arcadeRuns.id, t.runId));
    expect(row.replay).toBeNull();
    expect(row.ipHash).toMatch(/^[a-f0-9]{64}$/);
  }, 90_000);

  it('rejects impossible numbers at once and forged runs after the replay', async () => {
    const c = await new Client(env.app).init();
    // impossible: the score does not match the stats at any multiplier
    const t1 = await startRun(c);
    const run1 = play(t1.seed, 2);
    const r1 = await c.req('POST', `/api/arcade/el-tapon/runs/${t1.runId}/finish`, finishBody(t1, run1, { score: run1.score * 10 + 1000, guestName: 'Tramposo' }));
    expect(r1.json()).toMatchObject({ status: 'rejected' });
    expect(r1.json().reasons).toContain('score_out_of_bounds');
    // a run cannot last longer than the time since it was registered
    const t0 = await startRun(c, 0);
    const run0 = play(t0.seed, 12);
    const r0 = await c.req('POST', `/api/arcade/el-tapon/runs/${t0.runId}/finish`, finishBody(t0, run0, { guestName: 'Tramposo' }));
    expect(r0.json()).toMatchObject({ status: 'rejected', reasons: ['duration_longer_than_run'] });
    // plausible numbers that the run did not produce: 40 m more than it really drove
    const t2 = await startRun(c);
    const run2 = play(t2.seed, 6);
    const forged = { ...run2, score: run2.score + 40, stats: { ...run2.stats, distanceM: run2.stats.distanceM + 40 } };
    const r2 = await c.req('POST', `/api/arcade/el-tapon/runs/${t2.runId}/finish`, finishBody(t2, forged, { guestName: 'Tramposo' }));
    expect(r2.json()).toMatchObject({ status: 'rejected', reasons: ['replay_mismatch'] });
    const board = (await c.req('GET', '/api/arcade/el-tapon/leaderboard')).json();
    expect(board.entries.some((e: { name: string }) => e.name === 'Tramposo')).toBe(false);
  }, 90_000);

  it('accounts save automatically, earn achievements and see their progress', async () => {
    const c = await newUser('motoconcho_27');
    const t = await startRun(c);
    const run = play(t.seed, 8);
    const r = await c.req('POST', `/api/arcade/el-tapon/runs/${t.runId}/finish`, finishBody(t, run, { guestName: 'ignorado' }));
    expect(r.json()).toMatchObject({ status: 'verified', personalBest: run.score });
    expect(r.json().unlocked).toContainEqual({ id: 'tapon_primer_tapon', title: 'Primer tapón' });
    const board = (await c.req('GET', '/api/arcade/el-tapon/leaderboard')).json();
    expect(board.me).toMatchObject({ best: run.score });
    expect(board.entries.find((e: { name: string }) => e.name === 'motoconcho_27')).toMatchObject({ guest: false });
    const d = (await c.req('GET', '/api/platform/dashboard')).json();
    expect(d.achievements.list.find((a: { id: string }) => a.id === 'tapon_primer_tapon').unlockedAt).toBeTruthy();
    const progress = d.progress.find((p: { gameId: string }) => p.gameId === 'el-tapon');
    expect(progress.stats.find((s: { label: string }) => s.label === 'Carreras').value).toBe('1');
    expect(progress.milestones[0]).toMatchObject({ status: 'completed' });

    // another account cannot finish this player's run; a lower run is only kept in the history
    const other = await newUser('otro_jugador');
    const t2 = await startRun(c);
    const low = play(t2.seed, 0);
    expect((await other.req('POST', `/api/arcade/el-tapon/runs/${t2.runId}/finish`, finishBody(t2, low))).statusCode).toBe(403);
    const r2 = await c.req('POST', `/api/arcade/el-tapon/runs/${t2.runId}/finish`, finishBody(t2, low));
    if (low.score < run.score) expect(r2.json()).toMatchObject({ status: 'saved' });

    // players hidden from rankings keep their achievements but leave the public table
    await env.db.update(users).set({ showInRankings: false }).where(eq(users.username, 'motoconcho_27'));
    await new Promise((r) => setTimeout(r, 5200)); // the public table is cached for 5 s
    const hidden = (await c.req('GET', '/api/arcade/el-tapon/leaderboard')).json();
    expect(hidden.entries.some((e: { name: string }) => e.name === 'motoconcho_27')).toBe(false);
    expect(hidden.me).toMatchObject({ best: run.score, rank: null });
  }, 120_000);

  it('administrators (only) can hide an entry from the public tables', async () => {
    const admin = await newUser('jefa_admin');
    await env.db.update(users).set({ role: 'admin' }).where(eq(users.username, 'jefa_admin'));
    const player = await new Client(env.app).init();
    const list = (await admin.req('GET', '/api/admin/arcade/runs')).json().runs as { id: string; name: string; status: string }[];
    const entry = list.find((r) => r.name === 'La Motoconchista' && r.status === 'verified')!;
    expect(entry).toBeTruthy();
    expect((await player.req('PATCH', `/api/admin/arcade/runs/${entry.id}`, { hidden: true })).statusCode).toBe(401);
    const user = await newUser('no_admin');
    expect((await user.req('GET', '/api/admin/arcade/runs')).statusCode).toBe(403);
    expect((await admin.req('PATCH', `/api/admin/arcade/runs/${entry.id}`, { hidden: true })).json()).toEqual({ ok: true, hidden: true });
    const board = (await player.req('GET', '/api/arcade/el-tapon/leaderboard')).json();
    expect(board.entries.some((e: { name: string }) => e.name === 'La Motoconchista')).toBe(false);
  });

  it('guests cannot play when the catalog entry turns guest play off', async () => {
    const admin = await newUser('jefe_catalogo');
    await env.db.update(users).set({ role: 'admin' }).where(eq(users.username, 'jefe_catalogo'));
    expect((await admin.req('PATCH', '/api/admin/games/el-tapon', { guestPlay: false })).statusCode).toBe(200);
    const guest = await new Client(env.app).init();
    expect((await guest.req('POST', '/api/arcade/el-tapon/runs')).statusCode).toBe(401);
    expect((await admin.req('POST', '/api/arcade/el-tapon/runs')).statusCode).toBe(201);
    expect((await admin.req('PATCH', '/api/admin/games/el-tapon', { guestPlay: true })).statusCode).toBe(200);
    expect((await guest.req('POST', '/api/arcade/el-tapon/runs')).statusCode).toBe(201);
  });
});
