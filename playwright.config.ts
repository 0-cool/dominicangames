import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the development stack (Vite + API + PostgreSQL) with the
 * sandbox payment provider and the development mailbox. WebGL runs on SwiftShader so the
 * game can be exercised headless; it is slow but deterministic thanks to the debug hooks.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 360_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } }],
  webServer: [
    { command: 'npm run dev -w @sd/server', url: 'http://127.0.0.1:4000/api/health', reuseExistingServer: true, timeout: 120_000 },
    { command: 'npm run dev -w @sd/web', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 120_000 },
  ],
});
