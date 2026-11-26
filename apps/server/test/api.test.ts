import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLogs, gameAccess, games, payments, playerSaves, users } from '../src/db/schema.ts';
import { SandboxProvider } from '../src/services/payments/sandbox.ts';
import { Client, TEST_PRODUCT, lastEmailLink, setup } from './helpers.ts';

let env: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  env = await setup();
});
afterAll(async () => {
  await env.done();
});

const SDOW = 'santo-domingo-open-world';
const pw = 'contraseña-segura-123';
async function newUser(name: string, verify = true, app = env.app) {
  const c = await new Client(app).init();
  const r = await c.req('POST', '/api/auth/register', { email: `${name}@example.com`, username: name, password: pw, acceptTerms: true });
  expect(r.statusCode).toBe(201);
  if (verify) {
    const token = await lastEmailLink(c, new RegExp(`verificar\\?token=([a-f0-9]{64})`));
    expect((await c.req('POST', '/api/auth/verify-email', { token })).statusCode).toBe(200);
  }
  return c;
}
async function makeAdmin(name: string) {
  const c = await newUser(name);
  await env.db.update(users).set({ role: 'admin' }).where(eq(users.email, `${name}@example.com`));
  return c;
}
const save = (money = 500, landmarks: string[] = ['catedral']) => ({
  version: 1,
  player: { x: 1, y: 0, z: 2, heading: 90 },
  vehicle: null,
  money,
  timeOfDay: 17.5,
  weather: 'clear',
  discoveredLandmarks: landmarks,
  stats: { distanceWalked: 10, distanceDriven: 2000, playTimeSec: 300, topSpeedKmh: 80 },
  savedAt: new Date().toISOString(),
});

describe('auth (one DominicanGames identity)', () => {
  it('rejects state-changing requests without a CSRF token', async () => {
    const r = await env.app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'x@example.com', username: 'xx_1', password: pw, acceptTerms: true } });
    expect(r.statusCode).toBe(403);
  });

  it('registers for free, sends a verification email and verifies', async () => {
    const c = await newUser('ana', false);
    let me = (await c.req('GET', '/api/auth/me')).json();
    expect(me.user).toMatchObject({ emailVerified: false, founder: false, avatar: null, showInRankings: true, locale: 'es' });
    expect(me.user.access).toBeUndefined(); // the paid-access flag no longer exists
    const token = await lastEmailLink(c, /verificar\?token=([a-f0-9]{64})/);
    expect((await c.req('POST', '/api/auth/verify-email', { token })).statusCode).toBe(200);
    expect((await c.req('POST', '/api/auth/verify-email', { token })).statusCode).toBe(400); // single use
    me = (await c.req('GET', '/api/auth/me')).json();
    expect(me.user.emailVerified).toBe(true);
  });

  it('prevents duplicate accounts and validates input', async () => {
    const c = await new Client(env.app).init();
    expect((await c.req('POST', '/api/auth/register', { email: 'ana@example.com', username: 'ana2', password: pw, acceptTerms: true })).statusCode).toBe(409);
    expect((await c.req('POST', '/api/auth/register', { email: 'ana_otra@example.com', username: 'ana', password: pw, acceptTerms: true })).statusCode).toBe(409);
    expect((await c.req('POST', '/api/auth/register', { email: 'bad', username: 'a', password: 'short', acceptTerms: true })).statusCode).toBe(400);
    expect((await c.req('POST', '/api/auth/register', { email: 'z@example.com', username: 'zeta', password: pw, acceptTerms: false })).statusCode).toBe(400);
  });

  it('logs in and out; wrong password is rejected; lockout after repeated failures', async () => {
    await newUser('beto');
    const c = await new Client(env.app).init();
    expect((await c.req('POST', '/api/auth/login', { email: 'beto@example.com', password: 'nope-nope-nope' })).statusCode).toBe(401);
    const ok = await c.req('POST', '/api/auth/login', { email: 'BETO@example.com ', password: pw });
    expect(ok.statusCode).toBe(200);
    expect(c.cookies.get('sd_session')).toMatch(/^[a-f0-9]{64}$/);
    await c.req('POST', '/api/auth/logout');
    expect((await c.req('GET', '/api/auth/me')).json().user).toBeNull();
    for (let i = 0; i < 8; i++) await c.req('POST', '/api/auth/login', { email: 'beto@example.com', password: `wrong-${i}-wrong` });
    expect((await c.req('POST', '/api/auth/login', { email: 'beto@example.com', password: pw })).statusCode).toBe(429);
  });

  it('resets a password and invalidates existing sessions', async () => {
    const c = await newUser('carla');
    const other = await new Client(env.app).init();
    expect((await other.req('POST', '/api/auth/forgot-password', { email: 'nadie@example.com' })).statusCode).toBe(200); // no enumeration
    expect((await other.req('POST', '/api/auth/forgot-password', { email: 'carla@example.com' })).statusCode).toBe(200);
    const token = await lastEmailLink(other, /restablecer\?token=([a-f0-9]{64})/);
    expect((await other.req('POST', '/api/auth/reset-password', { token, password: 'nueva-clave-segura-456' })).statusCode).toBe(200);
    expect((await c.req('GET', '/api/auth/me')).json().user).toBeNull();
    expect((await other.req('POST', '/api/auth/login', { email: 'carla@example.com', password: 'nueva-clave-segura-456' })).statusCode).toBe(200);
  });

  it('updates the profile: avatar, ranking visibility, language and username', async () => {
    const c = await newUser('perfil_1', false);
    const r = await c.req('PATCH', '/api/account/profile', { avatar: 'palma', showInRankings: false, locale: 'en', username: 'perfil_dos' });
    expect(r.statusCode).toBe(200);
    expect(r.json().user).toMatchObject({ avatar: 'palma', showInRankings: false, locale: 'en', username: 'perfil_dos' });
    expect((await c.req('PATCH', '/api/account/profile', { avatar: 'no-existe' })).statusCode).toBe(400);
    expect((await c.req('PATCH', '/api/account/profile', { username: 'ana' })).statusCode).toBe(409);
    expect((await c.req('GET', '/api/auth/me')).json().user.avatar).toBe('palma');
  });
});

describe('free access — critical acceptance', () => {
  it('a brand-new account plays Santo Domingo Open World without paying (and without verifying the email)', async () => {
    const c = await newUser('nuevo_jugador', false);
    const access = (await c.req('GET', '/api/game/access')).json();
    expect(access).toMatchObject({ access: 'free', canPlay: true, gameId: SDOW, emailVerified: false });
    expect((await c.req('GET', '/api/game/assets/world/manifest.json')).statusCode).toBe(200);
    expect((await c.req('GET', '/api/game/assets/../../etc/passwd')).statusCode).toBe(404);
    expect((await c.req('POST', '/api/platform/sessions', { gameId: SDOW })).statusCode).toBe(201);
    expect((await c.req('PUT', '/api/game/settings', (await import('@sd/shared')).defaultGameSettings('low'))).statusCode).toBe(200);
    expect((await c.req('PUT', '/api/game/save', save())).statusCode).toBe(200);
    expect((await c.req('GET', '/api/game/save')).json().save.money).toBe(500);
    expect((await c.req('POST', '/api/game/missions', { missionId: 'm001_bienvenido', status: 'started' })).statusCode).toBe(200);
    // no payment row was ever created for this player
    const [u] = await env.db.select().from(users).where(eq(users.email, 'nuevo_jugador@example.com'));
    expect(await env.db.select().from(payments).where(eq(payments.userId, u.id))).toHaveLength(0);
  });

  it('anonymous visitors must sign in (401) — there is no paywall (no 403 payment_required)', async () => {
    const r = await env.app.inject({ method: 'GET', url: '/api/game/assets/world/manifest.json' });
    expect(r.statusCode).toBe(401);
    const c = await newUser('sin_pago');
    const assets = await c.req('GET', '/api/game/assets/world/manifest.json');
    expect(assets.statusCode).toBe(200);
  });

  it('checkout is disabled while DG Monetization is off', async () => {
    const cfg = (await env.app.inject({ method: 'GET', url: '/api/payments/config' })).json();
    expect(cfg).toMatchObject({ enabled: false, payments: { enabled: false, products: [] }, ads: { enabled: false }, sponsorships: { enabled: false } });
    expect(JSON.stringify(cfg)).not.toContain('10000');
    const c = await newUser('quiere_pagar');
    const r = await c.req('POST', '/api/payments/checkout', { idempotencyKey: randomUUID(), productCode: 'SD_ACCESS_LIFETIME' });
    expect(r.statusCode).toBe(410);
    expect(r.json().error).toBe('monetization_disabled');
  });

  it('keeps each game’s data separate per account (saves keyed by user + game)', async () => {
    const c = await newUser('dos_juegos');
    expect((await c.req('PUT', '/api/game/save', save(777))).statusCode).toBe(200);
    expect((await c.req('PUT', '/api/game/save', save(888))).statusCode).toBe(200); // upsert, not a duplicate
    const [u] = await env.db.select().from(users).where(eq(users.email, 'dos_juegos@example.com'));
    const rows = await env.db.select().from(playerSaves).where(eq(playerSaves.userId, u.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].gameId).toBe(SDOW);
    expect((rows[0].saveData as { money: number }).money).toBe(888);
    expect((await c.req('PUT', '/api/game/save', { ...save(), money: -5 })).statusCode).toBe(400);
  });

  it('keeps the best time when a mission is completed again', async () => {
    const c = await newUser('rapido');
    await c.req('POST', '/api/game/missions', { missionId: 'reto_malecon', status: 'completed', stats: { timeSec: 70 } });
    await c.req('POST', '/api/game/missions', { missionId: 'reto_malecon', status: 'completed', stats: { timeSec: 90 } });
    let m = (await c.req('GET', '/api/game/missions')).json().missions.find((x: { missionId: string }) => x.missionId === 'reto_malecon');
    expect(m.stats.timeSec).toBe(70);
    await c.req('POST', '/api/game/missions', { missionId: 'reto_malecon', status: 'completed', stats: { timeSec: 61 } });
    m = (await c.req('GET', '/api/game/missions')).json().missions.find((x: { missionId: string }) => x.missionId === 'reto_malecon');
    expect(m.stats.timeSec).toBe(61);
    expect((await c.req('POST', '/api/game/missions', { missionId: 'reto_malecon', status: 'started' })).json().mission.status).toBe('completed');
  });
});

describe('catalog', () => {
  it('lists Santo Domingo Open World as playable and the concepts as “Próximamente” (not playable)', async () => {
    const r = await env.app.inject({ method: 'GET', url: '/api/platform/games' });
    const list = r.json().games as { id: string; status: string; playable: boolean; launchPath: string | null; featured: boolean }[];
    const sd = list.find((g) => g.id === SDOW)!;
    expect(sd).toMatchObject({ status: 'published', playable: true, launchPath: '/jugar', featured: true });
    for (const id of ['moto-rd', 'caribbean-racing', 'island-survival']) {
      expect(list.find((g) => g.id === id)).toMatchObject({ status: 'coming_soon', playable: false, launchPath: null });
    }
    expect((await env.app.inject({ method: 'GET', url: '/api/platform/games/moto-rd' })).json().game.title).toBe('Moto RD');
    expect((await env.app.inject({ method: 'GET', url: '/api/platform/games/no-existe' })).statusCode).toBe(404);
  });

  it('refuses to launch upcoming games', async () => {
    const c = await newUser('impaciente');
    const r = await c.req('POST', '/api/platform/sessions', { gameId: 'moto-rd' });
    expect(r.statusCode).toBe(403);
    expect(r.json().error).toBe('game_unavailable');
  });

  it('lets administrators add, publish and hide games — authorized on the server', async () => {
    const admin = await makeAdmin('catalog_admin');
    const user = await newUser('catalog_user');
    const input = { id: 'juego-prueba', title: 'Juego de prueba', status: 'development', launchPath: '/juegos/juego-prueba/jugar', theme: { accent: '#2f5bff' } };
    expect((await user.req('POST', '/api/admin/games', input)).statusCode).toBe(403);
    expect((await user.req('GET', '/api/admin/games')).statusCode).toBe(403);
    expect((await admin.req('POST', '/api/admin/games', { ...input, id: 'Mal Slug' })).statusCode).toBe(400);
    expect((await admin.req('POST', '/api/admin/games', { ...input, launchPath: 'https://evil.example.com' })).statusCode).toBe(400);
    expect((await admin.req('POST', '/api/admin/games', { ...input, launchPath: null })).json().error).toBe('launch_path_required');
    try {
      expect((await admin.req('POST', '/api/admin/games', input)).statusCode).toBe(201);
      expect((await admin.req('POST', '/api/admin/games', input)).statusCode).toBe(409);
      // development builds: visible and playable for admins only
      expect(((await user.req('GET', '/api/platform/games')).json().games as { id: string }[]).some((g) => g.id === 'juego-prueba')).toBe(false);
      expect(((await admin.req('GET', '/api/platform/games')).json().games as { id: string; playable: boolean }[]).find((g) => g.id === 'juego-prueba')?.playable).toBe(true);
      expect((await user.req('POST', '/api/platform/sessions', { gameId: 'juego-prueba' })).statusCode).toBe(403);
      expect((await admin.req('POST', '/api/platform/sessions', { gameId: 'juego-prueba' })).statusCode).toBe(201);
      // publish
      expect((await admin.req('PATCH', '/api/admin/games/juego-prueba', { status: 'published', featured: false })).json().game.status).toBe('published');
      expect((await user.req('POST', '/api/platform/sessions', { gameId: 'juego-prueba' })).statusCode).toBe(201);
      // hide
      await admin.req('PATCH', '/api/admin/games/juego-prueba', { status: 'hidden' });
      expect(((await user.req('GET', '/api/platform/games')).json().games as { id: string }[]).some((g) => g.id === 'juego-prueba')).toBe(false);
      const audit = await env.db.select().from(auditLogs).where(eq(auditLogs.targetId, 'juego-prueba'));
      expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['admin.game_created', 'admin.game_updated']));
    } finally {
      await env.db.delete(games).where(eq(games.id, 'juego-prueba'));
      env.ctx.catalog.invalidate();
    }
  });

  it('takes a game offline for everyone when an administrator unpublishes it', async () => {
    const admin = await makeAdmin('ops_admin');
    const player = await newUser('ops_player');
    try {
      expect((await admin.req('PATCH', `/api/admin/games/${SDOW}`, { status: 'coming_soon' })).statusCode).toBe(200);
      const r = await player.req('GET', '/api/game/assets/world/manifest.json');
      expect(r.statusCode).toBe(403);
      expect(r.json().error).toBe('game_unavailable');
    } finally {
      await admin.req('PATCH', `/api/admin/games/${SDOW}`, { status: 'published' });
    }
    expect((await player.req('GET', '/api/game/assets/world/manifest.json')).statusCode).toBe(200);
  });
});

describe('sessions, dashboard and achievements', () => {
  it('“Continuar jugando” shows the featured game before the first session, then the last game played', async () => {
    const c = await newUser('panel_user', false);
    let d = (await c.req('GET', '/api/platform/dashboard')).json();
    expect(d.continue).toMatchObject({ gameId: SDOW, reason: 'featured' });
    expect(d.recentlyPlayed).toHaveLength(0);
    expect(d.progress).toHaveLength(0);
    const s = (await c.req('POST', '/api/platform/sessions', { gameId: SDOW })).json();
    expect((await c.req('POST', `/api/platform/sessions/${s.sessionId}/heartbeat`)).json().ok).toBe(true);
    await c.req('PUT', '/api/game/save', save(1200, ['catedral', 'alcazar', 'fortaleza', 'panteon', 'casas_reales']));
    await c.req('POST', '/api/game/missions', { missionId: 'm001_bienvenido', status: 'completed', stats: { timeSec: 300 } });
    expect((await c.req('POST', `/api/platform/sessions/${s.sessionId}/end`)).json().ok).toBe(true);
    expect((await c.req('POST', `/api/platform/sessions/${s.sessionId}/heartbeat`)).json().ok).toBe(false); // already ended
    d = (await c.req('GET', '/api/platform/dashboard')).json();
    expect(d.continue).toMatchObject({ gameId: SDOW, reason: 'recent' });
    expect(d.recentlyPlayed[0]).toMatchObject({ gameId: SDOW, sessions: 1 });
    expect(d.progress[0].gameId).toBe(SDOW);
    expect(d.progress[0].milestones.find((m: { id: string }) => m.id === 'm001_bienvenido').status).toBe('completed');
    const unlocked = (d.achievements.list as { id: string; unlockedAt: string | null }[]).filter((a) => a.unlockedAt).map((a) => a.id);
    expect(unlocked).toEqual(expect.arrayContaining(['dg_bienvenido', 'sdow_primera_vuelta', 'sdow_bienvenido', 'sdow_explorador']));
    expect(unlocked).not.toContain('dg_verificado');
    expect(unlocked).not.toContain('dg_fundador');
    expect((d.achievements.list as { id: string }[]).some((a) => a.id === 'dg_fundador')).toBe(false); // secret: hidden from non-founders
    expect(d.achievements.points).toBeGreaterThan(0);
    expect(d.games.some((g: { id: string }) => g.id === 'moto-rd')).toBe(true);
    expect(d.announcements[0].title).toContain('gratis');
  });

  it('only the owner can heartbeat or end a session', async () => {
    const a = await newUser('sesion_a');
    const b = await newUser('sesion_b');
    const s = (await a.req('POST', '/api/platform/sessions', { gameId: SDOW })).json();
    expect((await b.req('POST', `/api/platform/sessions/${s.sessionId}/end`)).json().ok).toBe(false);
    expect((await a.req('POST', `/api/platform/sessions/${s.sessionId}/end`)).json().ok).toBe(true);
  });
});

describe('community', () => {
  it('builds rankings from real data, hides opted-out players and never exposes e-mails', async () => {
    const visible = await newUser('ranking_visible');
    const hidden = await newUser('ranking_oculto');
    await hidden.req('PATCH', '/api/account/profile', { showInRankings: false });
    for (const c of [visible, hidden]) {
      await c.req('POST', '/api/game/missions', { missionId: 'reto_malecon', status: 'completed', stats: { timeSec: 65 } });
      await c.req('PUT', '/api/game/save', save(100, ['catedral', 'alcazar']));
      await c.req('GET', '/api/platform/dashboard'); // syncs achievements → points ranking
    }
    const r = await env.app.inject({ method: 'GET', url: '/api/platform/community' });
    const body = r.json();
    const names = (body.leaderboards as { entries: { username: string }[] }[]).flatMap((b) => b.entries.map((e) => e.username));
    expect(names).toContain('ranking_visible');
    expect(names).not.toContain('ranking_oculto');
    expect(r.body).not.toContain('@example.com');
    const trial = (body.leaderboards as { id: string; entries: { display: string }[] }[]).find((b) => b.id === 'sdow_reto_malecon')!;
    expect(trial.entries.length).toBeGreaterThan(0);
  });

  it('serves announcements publicly and lets only administrators manage them', async () => {
    const pub = (await env.app.inject({ method: 'GET', url: '/api/platform/announcements' })).json();
    expect(pub.announcements.some((a: { title: string }) => a.title === 'Santo Domingo Open World ahora es gratis')).toBe(true);
    const admin = await makeAdmin('news_admin');
    const user = await newUser('news_user');
    const body = { title: 'Torneo de prueba', body: 'Anuncio creado por las pruebas automáticas.', linkUrl: '/juegos' };
    expect((await user.req('POST', '/api/admin/announcements', body)).statusCode).toBe(403);
    expect((await admin.req('POST', '/api/admin/announcements', { ...body, linkUrl: '//evil.example.com' })).statusCode).toBe(400);
    const created = (await admin.req('POST', '/api/admin/announcements', body)).json().announcement;
    expect((await admin.req('PATCH', `/api/admin/announcements/${created.id}`, { published: false })).json().announcement.published).toBe(false);
    expect(((await env.app.inject({ method: 'GET', url: '/api/platform/announcements' })).json().announcements as { id: string }[]).some((a) => a.id === created.id)).toBe(false);
    expect((await user.req('DELETE', `/api/admin/announcements/${created.id}`)).statusCode).toBe(403);
    expect((await admin.req('DELETE', `/api/admin/announcements/${created.id}`)).statusCode).toBe(200);
  });
});

describe('admin', () => {
  it('protects admin routes; suspend / restore / manual e-mail verification; platform metrics', async () => {
    const admin = await makeAdmin('root');
    const user = await newUser('karla', false);
    expect((await user.req('GET', '/api/admin/users')).statusCode).toBe(403);
    expect((await user.req('GET', '/api/admin/metrics')).statusCode).toBe(403);
    const list = (await admin.req('GET', '/api/admin/users?q=karla')).json();
    expect(list.users[0]).toMatchObject({ email: 'karla@example.com', founder: false });
    const id = list.users[0].id;
    const m = (await admin.req('GET', '/api/admin/metrics')).json();
    expect(m.users).toBeGreaterThan(0);
    expect(m.monetization.enabled).toBe(false);
    expect((m.games as { gameId: string }[]).some((g) => g.gameId === SDOW)).toBe(true);
    // a game nobody launched has zero play time (regression: LEAST() ignores NULLs in the LEFT JOIN)
    expect((m.games as { gameId: string; playSeconds: number; launches: number }[]).find((g) => g.gameId === 'moto-rd')).toMatchObject({ launches: 0, playSeconds: 0 });
    expect((await admin.req('POST', `/api/admin/users/${id}/verify-email`)).json().changed).toBe(true);
    expect((await admin.req('POST', `/api/admin/users/${id}/suspend`, { reason: 'fraude de prueba' })).statusCode).toBe(200);
    expect((await user.req('GET', '/api/auth/me')).json().user).toBeNull();
    const c3 = await new Client(env.app).init();
    expect((await c3.req('POST', '/api/auth/login', { email: 'karla@example.com', password: pw })).statusCode).toBe(403);
    expect((await admin.req('POST', `/api/admin/users/${id}/restore`)).statusCode).toBe(200);
    expect((await c3.req('POST', '/api/auth/login', { email: 'karla@example.com', password: pw })).statusCode).toBe(200);
    const detail = (await admin.req('GET', `/api/admin/users/${id}`)).json();
    expect(detail.user.emailVerified).toBe(true);
    const audit = (await admin.req('GET', '/api/admin/audit')).json().audit as { action: string }[];
    expect(audit.some((a) => a.action === 'admin.user_suspended')).toBe(true);
  });
});

describe('SEO', () => {
  it('serves robots.txt and a sitemap with the catalog', async () => {
    const robots = await env.app.inject({ method: 'GET', url: '/robots.txt' });
    expect(robots.body).toContain('Sitemap: http://localhost:5173/sitemap.xml');
    expect(robots.body).toContain('Disallow: /api/');
    const map = await env.app.inject({ method: 'GET', url: '/sitemap.xml' });
    expect(map.headers['content-type']).toContain('application/xml');
    expect(map.body).toContain('<loc>http://localhost:5173/juegos/santo-domingo-open-world</loc>');
    expect(map.body).toContain('<loc>http://localhost:5173/juegos/moto-rd</loc>');
  });
});

describe('DG Monetization — payment engine preserved (disabled in production config)', () => {
  let mon: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    mon = await setup({ MONETIZATION_ENABLED: 'true' }, { truncate: false, products: [TEST_PRODUCT] });
  });
  afterAll(async () => {
    await mon.done();
  });

  async function buyer(name: string) {
    const c = await new Client(mon.app).init();
    expect((await c.req('POST', '/api/auth/register', { email: `${name}@example.com`, username: name, password: pw, acceptTerms: true })).statusCode).toBe(201);
    const token = await lastEmailLink(c, new RegExp(`verificar\\?token=([a-f0-9]{64})`));
    await c.req('POST', '/api/auth/verify-email', { token });
    return c;
  }
  async function payWith(c: Client, outcome: 'approve' | 'decline' | 'cancel') {
    const r = await c.req('POST', '/api/payments/checkout', { idempotencyKey: randomUUID(), productCode: TEST_PRODUCT.code });
    expect(r.statusCode).toBe(200);
    const { paymentId, redirectUrl } = r.json();
    const ref = redirectUrl.split('/sandbox-pay/')[1];
    const page = await c.req('GET', `/sandbox-pay/${ref}`);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('ENTORNO DE PRUEBAS');
    const t = page.body.match(/name="t" value="([a-f0-9]{64})"/)![1];
    const done = await mon.app.inject({ method: 'POST', url: `/sandbox-pay/${ref}/complete`, payload: `t=${t}&outcome=${outcome}`, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    expect(done.statusCode).toBe(303);
    return { paymentId, ref };
  }

  it('lists optional products only when enabled; unknown products are refused', async () => {
    const cfg = (await mon.app.inject({ method: 'GET', url: '/api/payments/config' })).json();
    expect(cfg.payments.products.map((p: { code: string }) => p.code)).toEqual([TEST_PRODUCT.code]);
    const c = await buyer('mon_unknown');
    expect((await c.req('POST', '/api/payments/checkout', { idempotencyKey: randomUUID(), productCode: 'SD_ACCESS_LIFETIME' })).statusCode).toBe(404);
  });

  it('requires a verified email before a purchase', async () => {
    const c = await new Client(mon.app).init();
    await c.req('POST', '/api/auth/register', { email: 'mon_noverif@example.com', username: 'mon_noverif', password: pw, acceptTerms: true });
    const r = await c.req('POST', '/api/payments/checkout', { idempotencyKey: randomUUID(), productCode: TEST_PRODUCT.code });
    expect(r.statusCode).toBe(403);
    expect(r.json().error).toBe('email_not_verified');
  });

  it('records a purchase only after a verified webhook; refuses buying a one-time product twice', async () => {
    const c = await buyer('mon_felix');
    const { paymentId } = await payWith(c, 'approve');
    expect((await c.req('GET', `/api/payments/${paymentId}`)).json().payment.status).toBe('succeeded');
    const audit = await mon.db.select().from(auditLogs).where(and(eq(auditLogs.action, 'entitlement.granted'), eq(auditLogs.targetType, 'user')));
    expect(audit.some((a) => (a.details as { paymentId?: string })?.paymentId === paymentId)).toBe(true);
    expect((await c.req('POST', '/api/payments/checkout', { idempotencyKey: randomUUID(), productCode: TEST_PRODUCT.code })).statusCode).toBe(409);
    // buying an optional product never changes game access: it was already free
    expect((await c.req('GET', '/api/game/access')).json().access).toBe('free');
  });

  it('declined payments are recorded as failed', async () => {
    const c = await buyer('mon_gina');
    const { paymentId } = await payWith(c, 'decline');
    expect((await c.req('GET', `/api/payments/${paymentId}`)).json().payment.status).toBe('failed');
  });

  it('rejects forged, stale and duplicated webhooks; ignores amount mismatches', async () => {
    const c = await buyer('mon_hugo');
    const r = await c.req('POST', '/api/payments/checkout', { idempotencyKey: randomUUID(), productCode: TEST_PRODUCT.code });
    const paymentId = r.json().paymentId;
    const ref = r.json().redirectUrl.split('/sandbox-pay/')[1];
    const sandbox = mon.ctx.payments.provider as SandboxProvider;
    const send = (raw: string, sig: string) => mon.app.inject({ method: 'POST', url: '/api/payments/webhook/sandbox', payload: raw, headers: { 'content-type': 'application/json', 'x-sd-signature': sig } });
    const ev = sandbox.buildEvent('payment.succeeded', ref, 10000, 'DOP');
    const raw = JSON.stringify(ev);
    expect((await send(raw, 't=1,v1=deadbeef')).statusCode).toBe(400);
    expect((await send(raw, sandbox.sign(raw, Math.floor(Date.now() / 1000) - 3600))).statusCode).toBe(400);
    const tampered = JSON.stringify({ ...ev, data: { ...ev.data, amount: 1 } });
    expect((await send(tampered, sandbox.sign(raw))).statusCode).toBe(400);
    const cheap = JSON.stringify(sandbox.buildEvent('payment.succeeded', ref, 100, 'DOP'));
    expect((await send(cheap, sandbox.sign(cheap))).json().result).toBe('amount_mismatch');
    expect((await c.req('GET', `/api/payments/${paymentId}`)).json().payment.status).toBe('pending');
    expect((await send(raw, sandbox.sign(raw))).json().result).toBe('processed');
    expect((await send(raw, sandbox.sign(raw))).json().result).toBe('duplicate');
    expect((await c.req('GET', `/api/payments/${paymentId}`)).json().payment.status).toBe('succeeded');
  });

  it('is idempotent on the checkout key', async () => {
    const c = await buyer('mon_ines');
    const key = randomUUID();
    const a = (await c.req('POST', '/api/payments/checkout', { idempotencyKey: key, productCode: TEST_PRODUCT.code })).json();
    const b = (await c.req('POST', '/api/payments/checkout', { idempotencyKey: key, productCode: TEST_PRODUCT.code })).json();
    expect(a.paymentId).toBe(b.paymentId);
    expect(await mon.db.select().from(payments).where(eq(payments.id, a.paymentId))).toHaveLength(1);
  });

  it('legacy RD$100 purchases: a late confirmation grants the Fundador badge, a refund removes it', async () => {
    const c = await buyer('mon_fundador');
    const [u] = await mon.db.select().from(users).where(eq(users.email, 'mon_fundador@example.com'));
    // a checkout created before the platform became free (no productCode), still pending
    const ref = 'sbx_0123456789abcdef01234567';
    const [p] = await mon.db.insert(payments).values({ userId: u.id, provider: 'sandbox', providerReference: ref, idempotencyKey: randomUUID(), amount: 10000, itbis: 1525, currency: 'DOP', status: 'pending' }).returning();
    const sandbox = mon.ctx.payments.provider as SandboxProvider;
    const raw = JSON.stringify(sandbox.buildEvent('payment.succeeded', ref, 10000, 'DOP'));
    const res = await mon.app.inject({ method: 'POST', url: '/api/payments/webhook/sandbox', payload: raw, headers: { 'content-type': 'application/json', 'x-sd-signature': sandbox.sign(raw) } });
    expect(res.json().result).toBe('processed');
    expect((await c.req('GET', '/api/auth/me')).json().user.founder).toBe(true);
    let d = (await c.req('GET', '/api/platform/dashboard')).json();
    expect((d.achievements.list as { id: string; unlockedAt: string | null }[]).find((a) => a.id === 'dg_fundador')?.unlockedAt).toBeTruthy();
    expect(d.payments[0]).toMatchObject({ id: p.id, status: 'succeeded' });
    // admin refund → legacy entitlement revoked → badge removed
    await mon.db.update(users).set({ role: 'admin' }).where(eq(users.id, u.id));
    expect((await c.req('POST', `/api/admin/payments/${p.id}/refund`)).json().ok).toBe(true);
    const [acc] = await mon.db.select().from(gameAccess).where(eq(gameAccess.userId, u.id));
    expect(acc.accessStatus).toBe('revoked');
    d = (await c.req('GET', '/api/platform/dashboard')).json();
    expect((d.achievements.list as { id: string; unlockedAt: string | null }[]).find((a) => a.id === 'dg_fundador')).toBeUndefined(); // secret again once refunded
    // and the game stays free for them
    expect((await c.req('GET', '/api/game/assets/world/manifest.json')).statusCode).toBe(200);
  });
});

describe('rate limiting', () => {
  it('limits registrations per IP at production settings', async () => {
    const strict = await setup({ RATE_LIMIT_SCALE: '1' }, { truncate: false });
    try {
      const c = await new Client(strict.app).init();
      const codes: number[] = [];
      for (let i = 0; i < 6; i++) codes.push((await c.req('POST', '/api/auth/register', { email: `rl${i}@example.com`, username: `rl_user_${i}`, password: pw, acceptTerms: true })).statusCode);
      expect(codes.slice(0, 5).every((s) => s === 201)).toBe(true);
      expect(codes[5]).toBe(429);
    } finally {
      await strict.done();
    }
  });
});
