import { expect, test, type Page } from '@playwright/test';

/**
 * CRITICAL ACCEPTANCE TEST — DominicanGames free journey:
 * create a new account → (no payment, no verification required) → dashboard → CONTINUAR / JUGAR AHORA →
 * Santo Domingo Open World launcher → game loads → walk / jump / drive / pause / map / save → complete
 * Mission 001 → return to the platform → “recently played” shows the game.
 * The journey must never visit a payment page or call checkout.
 */
type Dbg = {
  state(): { player: number[]; grounded: boolean; inVehicle: boolean; vehicle: { model: string; speed: number } | null; mission: { id: string; step: number; steps: number } | null; traffic: number; peds: number };
  key(code: string, down: boolean): void;
  simulate(s: number): ReturnType<Dbg['state']>;
  spawnVehicle(model: string): unknown;
  completeMissionStep(): void;
};
/** Runs `fn` in the page with the engine debug API (functions are serialised, so no closures). */
const dbg = <T>(page: Page, fn: (d: Dbg) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__SD_DEBUG__)`) as Promise<T>;

test('new account plays Santo Domingo Open World for free and returns to DominicanGames', async ({ page }) => {
  test.slow();
  const visited: string[] = [];
  const checkoutCalls: string[] = [];
  page.on('framenavigated', (f) => f === page.mainFrame() && visited.push(f.url()));
  page.on('request', (r) => r.url().includes('/api/payments/checkout') && checkoutCalls.push(r.url()));
  const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const email = `e2e_${id}@example.com`;
  const password = 'clave-de-prueba-segura-2026';

  // ── Discover the game on the homepage, click JUGAR AHORA → sign-up ──
  await page.goto('/');
  await page.getByTestId('hero-play').click();
  await expect(page).toHaveURL(/\/registro\?next=%2Fjugar/);

  // ── Register (free) ──
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Nombre de usuario').fill(`e2e_${id}`.slice(0, 24));
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByLabel('Confirmar contraseña').fill(password);
  await page.locator('input[name="acceptTerms"]').check();
  await page.getByRole('button', { name: 'Crear cuenta gratis' }).click();
  // straight to the game launcher: no payment screen, no mandatory e-mail verification
  await expect(page).toHaveURL(/\/jugar$/);
  expect((await page.request.get('/api/game/assets/world/manifest.json')).status()).toBe(200);
  const access = await (await page.request.get('/api/game/access')).json();
  expect(access).toMatchObject({ access: 'free', canPlay: true, emailVerified: false });
  // a verification e-mail was still sent (optional step)
  const mailbox = await (await page.request.get('/api/dev/mailbox')).json();
  expect((mailbox.emails as { to: string }[]).some((m) => m.to === email)).toBe(true);

  // ── The dashboard offers the featured game before the first session ──
  await page.goto('/panel');
  await expect(page.getByTestId('dashboard-welcome')).toContainText(`e2e_${id}`.slice(0, 24));
  await expect(page.getByTestId('continue-card')).toHaveAttribute('data-reason', 'featured');
  await page.screenshot({ path: 'test-results/ui-dashboard-new.png' });
  await page.getByTestId('continue-playing').click();
  await expect(page).toHaveURL(/\/jugar$/);

  // ── Launcher → game ──
  await page.getByTestId('launcher-preset-low').click();
  await page.screenshot({ path: 'test-results/ui-launcher.png' });
  await page.getByTestId('start-game').click();
  await expect(page).toHaveURL(/\/juego$/);
  await expect(page.getByTestId('loading-screen')).toBeVisible();
  await page.screenshot({ path: 'test-results/ui-loading.png' });
  await expect(page.getByTestId('click-to-play')).toBeVisible({ timeout: 240_000 });
  await page.getByTestId('click-to-play').click();
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('hud-objective')).toContainText('Don Ramón');
  await page.screenshot({ path: 'test-results/ui-hud.png' });

  // ── Walk ──
  const s0 = await dbg(page, (d) => d.state());
  expect(s0.grounded).toBe(true);
  const s1 = await dbg(page, (d) => {
    d.key('KeyW', true);
    const s = d.simulate(2);
    d.key('KeyW', false);
    return s;
  });
  expect(Math.hypot(s1.player[0] - s0.player[0], s1.player[2] - s0.player[2])).toBeGreaterThan(3);

  // ── Sprint (Shift) is much faster than the default jog ──
  const speeds = await dbg(page, (d) => {
    const g = (d as unknown as { game: { player: { speed: number } } }).game;
    d.key('KeyW', true);
    d.simulate(1);
    const jog = g.player.speed;
    d.key('ShiftLeft', true);
    d.simulate(1);
    const sprint = g.player.speed;
    d.key('ShiftLeft', false);
    d.key('KeyW', false);
    d.simulate(0.5);
    return { jog, sprint };
  });
  expect(speeds.jog).toBeGreaterThan(2);
  expect(speeds.sprint).toBeGreaterThan(speeds.jog * 1.4);

  // ── Buildings have collision geometry ──
  const wallHits = await dbg(page, (d) => {
    const g = (d as unknown as { game: { player: { position: { x: number; z: number } }; world: { map: { buildings: number[][] } }; physics: { raycast(...a: number[]): number | null } } }).game;
    const p = g.player.position;
    const cands: { x: number; z: number; d: number }[] = [];
    for (const f of g.world.map.buildings) {
      let cx = 0;
      let cz = 0;
      for (let i = 0; i < f.length; i += 2) {
        cx += f[i];
        cz += f[i + 1];
      }
      cx /= f.length / 2;
      cz /= f.length / 2;
      const dd = Math.hypot(cx - p.x, cz - p.z);
      if (dd > 8 && dd < 150) cands.push({ x: cx, z: cz, d: dd });
    }
    cands.sort((a, b) => a.d - b.d);
    // horizontal rays at chest height toward nearby building centres must hit a wall first
    let hits = 0;
    const tested = cands.slice(0, 10);
    for (const c of tested) {
      const dx = (c.x - p.x) / c.d;
      const dz = (c.z - p.z) / c.d;
      const hit = g.physics.raycast(p.x, 1.4, p.z, dx, 0, dz, c.d, 1);
      if (hit !== null && hit < c.d) hits++;
    }
    return { hits, tested: tested.length };
  });
  expect(wallHits.tested).toBeGreaterThan(0);
  expect(wallHits.hits).toBeGreaterThanOrEqual(Math.ceil(wallHits.tested * 0.6));

  // ── Jump ──
  const y0 = (await dbg(page, (d) => d.simulate(0.5))).player[1];
  const peak = await dbg(page, (d) => {
    d.key('Space', true);
    d.simulate(0.05);
    d.key('Space', false);
    return d.simulate(0.25).player[1];
  });
  expect(peak).toBeGreaterThan(y0 + 0.3);

  // ── Car: spawn on the nearest lane, drive, brake, exit with F, re-enter with E ──
  const car = await dbg(page, (d) => {
    const spawned = (d as unknown as { spawnOnRoad(m: string): unknown }).spawnOnRoad('sedan');
    const inCar = d.simulate(1).inVehicle;
    d.key('KeyW', true);
    const s = d.simulate(3);
    d.key('KeyW', false);
    return { spawned: !!spawned, inCar, speed: s.vehicle?.speed ?? 0 };
  });
  expect(car.spawned).toBe(true);
  expect(car.inCar).toBe(true);
  expect(car.speed).toBeGreaterThan(4);
  const exitEnter = await dbg(page, (d) => {
    d.key('KeyS', true);
    d.simulate(3);
    d.key('KeyS', false);
    d.simulate(1);
    d.key('KeyF', true);
    d.simulate(0.1);
    d.key('KeyF', false);
    const out = !d.simulate(1.5).inVehicle;
    d.key('KeyE', true);
    d.simulate(0.1);
    d.key('KeyE', false);
    const back = d.simulate(1.5).inVehicle;
    d.key('KeyF', true);
    d.simulate(0.1);
    d.key('KeyF', false);
    const outAgain = !d.simulate(1.5).inVehicle;
    return { out, back, outAgain };
  });
  expect(exitEnter).toEqual({ out: true, back: true, outAgain: true });

  // ── Motorcycle ──
  const moto = await dbg(page, (d) => {
    (d as unknown as { spawnOnRoad(m: string): unknown }).spawnOnRoad('moto');
    d.simulate(0.5);
    d.key('KeyW', true);
    const s = d.simulate(3);
    d.key('KeyW', false);
    d.key('KeyS', true);
    d.simulate(3);
    d.key('KeyS', false);
    d.key('KeyF', true);
    d.simulate(0.1);
    d.key('KeyF', false);
    d.simulate(1.5);
    return { model: s.vehicle?.model, speed: s.vehicle?.speed ?? 0 };
  });
  expect(moto.model).toBe('moto');
  expect(moto.speed).toBeGreaterThan(4);
  await expect(page.getByLabel('Minimapa')).toBeVisible();

  // ── Pause menu (Esc) and save ──
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await page.screenshot({ path: 'test-results/ui-pause.png' });
  await page.getByTestId('pause-save').click();
  await expect.poll(async () => (await (await page.request.get('/api/game/save')).json()).save?.version, { timeout: 20_000 }).toBe(1);

  // ── Map ──
  await page.getByTestId('pause-map').click();
  await expect(page.getByTestId('map-overlay')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/ui-map.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await page.getByTestId('pause-resume').click();
  await expect(page.getByTestId('pause-menu')).toBeHidden();

  // ── Complete Mission 001 (steps advanced through the debug hook) ──
  await dbg(page, (d) => {
    for (let i = 0; i < 12 && d.state().mission?.id === 'm001_bienvenido'; i++) {
      d.completeMissionStep();
      d.simulate(0.2);
    }
  });
  await expect(page.getByTestId('mission-complete')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('mission-reward')).toContainText('RD$');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/ui-mission-complete.png' });
  await expect
    .poll(async () => ((await (await page.request.get('/api/game/missions')).json()).missions as { missionId: string; status: string }[]).find((m) => m.missionId === 'm001_bienvenido')?.status, { timeout: 20_000 })
    .toBe('completed');
  await page.getByTestId('mission-continue').click();
  await expect(page.getByTestId('mission-complete')).toBeHidden();

  // ── Return to the platform from the pause menu (saves first) ──
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await page.getByTestId('pause-platform').click();
  await expect(page).toHaveURL(/\/panel$/);
  await expect(page.getByTestId('continue-card')).toHaveAttribute('data-reason', 'recent');
  await expect(page.getByTestId('recently-played')).toContainText('Santo Domingo Open World');
  await expect(page.getByTestId('progress-santo-domingo-open-world')).toContainText('Completada');
  await expect(page.locator('[data-testid="achievement-sdow_bienvenido"]')).toHaveAttribute('data-unlocked', 'true');
  await page.screenshot({ path: 'test-results/ui-dashboard-after.png', fullPage: true });

  // ── Log out and back in: same identity, same progress ──
  await page.getByTestId('user-menu').click();
  await page.getByTestId('logout').click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/entrar');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/panel$/);
  await expect(page.getByTestId('continue-card')).toHaveAttribute('data-reason', 'recent');

  // ── Never a payment page, never a checkout ──
  expect(visited.filter((u) => /\/pago(\/|$|\?)|\/sandbox-pay\//.test(new URL(u).pathname))).toEqual([]);
  expect(checkoutCalls).toEqual([]);
});
