import { expect, test } from '@playwright/test';

test.describe('DominicanGames public site', () => {
  test('homepage presents DominicanGames, the featured game and the upcoming catalog', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/DominicanGames/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('TU JUEGO');
    await expect(page.getByTestId('hero-play')).toBeVisible();
    await expect(page.getByTestId('hero-explore')).toBeVisible();
    // featured game: the real launch route
    await expect(page.getByTestId('featured-game')).toContainText('Santo Domingo Open World');
    await expect(page.getByTestId('featured-play')).toHaveAttribute('href', /\/registro\?next=%2Fjugar|\/jugar/);
    // catalog: one playable title, three clearly labelled concepts that cannot be played
    const grid = page.getByTestId('catalog-grid');
    await expect(grid.getByTestId('play-santo-domingo-open-world')).toBeVisible();
    for (const id of ['moto-rd', 'caribbean-racing', 'island-survival']) {
      const card = page.getByTestId(`game-card-${id}`);
      await expect(card).toContainText('Próximamente');
      await expect(card.getByTestId(`play-${id}`)).toHaveCount(0);
    }
    // no paywall anywhere
    await expect(page.locator('body')).not.toContainText('RD$100');
    await expect(page.getByText('colaboradores de OpenStreetMap').first()).toBeVisible();
  });

  test('catalog, game page and community render from the catalog API', async ({ page }) => {
    await page.goto('/juegos');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Todos los mundos de DominicanGames');
    await expect(page.getByTestId('game-card-santo-domingo-open-world')).toBeVisible();
    await page.goto('/juegos/santo-domingo-open-world');
    await expect(page.getByTestId('game-detail')).toHaveAttribute('data-game', 'santo-domingo-open-world');
    await expect(page.getByTestId('game-play')).toBeVisible();
    await expect(page.getByText('Mundo abierto · Conducción · Aventura').first()).toBeVisible();
    await page.goto('/juegos/moto-rd');
    await expect(page.getByTestId('game-soon')).toBeVisible();
    await expect(page.getByTestId('game-play')).toHaveCount(0);
    await expect(page.getByText('Todavía no se puede jugar.')).toBeVisible();
    await page.goto('/comunidad');
    await expect(page.getByTestId('community')).toContainText('Jugadores destacados');
    await expect(page.getByTestId('announcement').first()).toContainText('gratis');
  });

  test('old payment links now lead to the free game page', async ({ page }) => {
    await page.goto('/pago');
    await expect(page).toHaveURL(/\/juegos\/santo-domingo-open-world\?gratis=1$/);
    await expect(page.getByText('¡Juega gratis!')).toBeVisible();
  });

  test('legal and support pages render', async ({ page }) => {
    for (const [path, heading] of [
      ['/terminos', 'Términos y condiciones'],
      ['/privacidad', 'Política de privacidad'],
      ['/creditos', 'Créditos y licencias'],
      ['/soporte', 'Soporte'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    }
    await page.goto('/terminos');
    await expect(page.locator('#acceso')).toContainText('Acceso gratuito');
  });

  test('unknown routes show the 404 page', async ({ page }) => {
    await page.goto('/no-existe');
    await expect(page.getByText('Te perdiste en la Zona Colonial')).toBeVisible();
  });

  test('protected routes redirect anonymous visitors to login', async ({ page }) => {
    await page.goto('/jugar');
    await expect(page).toHaveURL(/\/entrar\?next=%2Fjugar/);
    await page.goto('/juego');
    await expect(page).toHaveURL(/\/entrar/);
    await page.goto('/panel');
    await expect(page).toHaveURL(/\/entrar\?next=%2Fpanel/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/entrar/);
  });

  test('registration validates input on the client', async ({ page }) => {
    await page.goto('/registro');
    await page.getByLabel('Correo electrónico').fill('no-es-correo');
    await page.getByLabel('Nombre de usuario').fill('a');
    await page.getByLabel('Contraseña', { exact: true }).fill('corta');
    await page.getByRole('button', { name: 'Crear cuenta gratis' }).click();
    await expect(page.getByText('Correo electrónico inválido')).toBeVisible();
    await expect(page.getByText('Mínimo 3 caracteres')).toBeVisible();
    await expect(page.getByText('al menos 10 caracteres')).toBeVisible();
  });
});

test.describe('API security & SEO', () => {
  test('world data requires a DominicanGames session', async ({ request }) => {
    const r = await request.get('/api/game/assets/world/manifest.json');
    expect(r.status()).toBe(401);
  });

  test('forged payment webhooks are rejected and checkout is disabled', async ({ request }) => {
    const r = await request.post('/api/payments/webhook/sandbox', {
      data: { id: 'evt_forged', type: 'payment.succeeded', data: { reference: 'sbx_000000000000000000000000', amount: 10000, currency: 'DOP' } },
      headers: { 'x-sd-signature': 't=1,v1=00' },
    });
    expect(r.status()).toBe(400);
    const cfg = await (await request.get('/api/payments/config')).json();
    expect(cfg.enabled).toBe(false);
  });

  test('state-changing calls require a CSRF token', async ({ request }) => {
    const r = await request.post('/api/auth/login', { data: { email: 'x@example.com', password: 'whatever-123' } });
    expect(r.status()).toBe(403);
  });

  test('robots.txt and sitemap.xml are generated from the catalog', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Sitemap:');
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).toContain('/juegos/santo-domingo-open-world');
  });
});
