import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4174';
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests/browser',
  forbidOnly: isCI,
  workers: isCI ? 1 : '50%',
  // Stop before the CI job limit so failure reports have time to finish.
  globalTimeout: isCI ? 10 * 60 * 1000 : 0,
  reporter: isCI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
    trace: isCI ? 'retain-on-failure' : 'off',
    screenshot: isCI ? 'only-on-failure' : 'off',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: 'bun run preview --port 4174 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
  },
});
