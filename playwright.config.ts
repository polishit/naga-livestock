import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against an isolated database (livestock_test by default) that is
 * migrated and re-seeded in global setup, with the API on :4100 and the PWA on :5174.
 */
const E2E_DB = process.env.E2E_DATABASE_URL ?? 'mysql://livestock:livestock@localhost:3306/livestock_test';
const apiEnv = {
  NODE_ENV: 'test',
  PORT: '4100',
  DATABASE_URL: E2E_DB,
  JWT_ACCESS_SECRET: 'e2e-access-secret-0123456789abcdef',
  JWT_REFRESH_SECRET: 'e2e-refresh-secret-0123456789abcdef',
  CORS_ORIGINS: 'http://localhost:5174',
  STORAGE_DRIVER: 'local',
  UPLOAD_DIR: './uploads-e2e',
};

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testIgnore: /mobile\.spec\.ts/,
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: [
    {
      command: 'pnpm --filter @livestock/api exec tsx src/index.ts',
      url: 'http://localhost:4100/health',
      env: apiEnv,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @livestock/web exec vite --port 5174 --strictPort',
      url: 'http://localhost:5174',
      env: { VITE_API_PROXY: 'http://localhost:4100' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
