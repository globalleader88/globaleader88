import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e config. These tests exercise critical workflows against a
 * running app + database, so they are not part of the default `npm test`
 * (which stays DB-free). Run with:
 *
 *   npm run dev            # app on :3000 (with a seeded DB + worker)
 *   npm run test:e2e
 *
 * Or let Playwright boot the server via the webServer block below.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
