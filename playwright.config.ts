import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/helpers/require-fixtures.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:4173',
    // Media images and private data must not be captured in reports.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: 'npm run serve:dist',
    url: 'http://localhost:4173/demo/index.html',
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'browser',
      testMatch: ['contract/**/*.spec.ts', 'integration/**/*.spec.ts', 'e2e/**/*.spec.ts'],
      testIgnore: ['**/*privacy*.spec.ts', '**/*offline*.spec.ts', '**/*performance*.spec.ts'],
    },
    { name: 'privacy', testMatch: ['e2e/*privacy*.spec.ts', 'e2e/*offline*.spec.ts'] },
    { name: 'performance', testMatch: ['e2e/performance.spec.ts'], use: { headless: false } },
  ],
});
