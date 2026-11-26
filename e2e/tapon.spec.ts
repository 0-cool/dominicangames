import { expect, test } from '@playwright/test';

/**
 * El Tapón: guests play without an account and save a real run with a nickname; the server replays it before it
 * enters the table. The run is played for real (no input: the moto rides its lane until the three cascos are gone).
 */
test.describe('El Tapón', () => {
  test('game page: guest play, vehicles, records and the non-affiliation note', async ({ page }) => {
    await page.goto('/juegos/el-tapon');
    await expect(page.getByTestId('game-detail')).toHaveAttribute('data-game', 'el-tapon');
    await expect(page.getByTestId('game-play')).toHaveAttribute('href', '/juegos/el-tapon/jugar');
    await expect(page.getByText('Gratis · juega sin cuenta')).toBeVisible();
    for (const v of ['motoconchista', 'carro-publico', 'sonata-mamey', 'omsa', 'guagua', 'platanera', 'policia', 'transito']) await expect(page.getByTestId(`tapon-vehicle-${v}`)).toBeVisible();
    await expect(page.getByTestId('tapon-records')).toBeVisible();
    await expect(page.getByText('No está afiliado ni respaldado por la Policía Nacional')).toBeVisible();
    // the catalog card plays directly, no sign-up detour
    await page.goto('/juegos');
    await expect(page.getByTestId('play-el-tapon')).toHaveAttribute('href', '/juegos/el-tapon/jugar');
  });

  test('a guest plays a real run and puts a nickname in the table', async ({ page }) => {
    test.setTimeout(240_000);
    const nick = `Guagüero ${Date.now() % 100000}`;
    await page.goto('/juegos/el-tapon/jugar');
    await expect(page.getByTestId('tapon-menu')).toBeVisible({ timeout: 60_000 });
    const play = page.getByTestId('tapon-play');
    await expect(play).toBeEnabled();
    await play.click();
    await expect(page.getByTestId('tapon-screen')).toHaveAttribute('data-state', 'playing');
    // pause / resume from the keyboard
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tapon-paused')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tapon-screen')).toHaveAttribute('data-state', 'playing');
    // no steering: sooner or later the traffic takes the three cascos
    await expect(page.getByTestId('tapon-over')).toBeVisible({ timeout: 180_000 });
    const score = Number((await page.getByTestId('tapon-score').innerText()).replace(/\D/g, ''));
    expect(score).toBeGreaterThan(0);
    await page.getByTestId('tapon-nick').fill(nick);
    await page.getByTestId('tapon-save').click();
    await expect(page.getByTestId('tapon-submit-status')).toContainText(/verificada|verificando|historial/i, { timeout: 30_000 });
    // back to the menu: the table shows the nickname (when the run made it in)
    const status = await page.getByTestId('tapon-submit-status').innerText();
    await page.getByRole('button', { name: 'Menú' }).click();
    await expect(page.getByTestId('tapon-menu')).toBeVisible();
    if (/verificada/i.test(status)) await expect(page.getByTestId('tapon-board-week')).toContainText(nick);
  });

  test('desktop only: a small window asks for a bigger one', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 640 });
    await page.goto('/juegos/el-tapon/jugar');
    await expect(page.getByTestId('tapon-too-small')).toBeVisible();
    await expect(page.getByTestId('tapon-too-small')).toContainText('1280 × 720');
  });
});
