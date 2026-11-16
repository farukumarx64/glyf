import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4174';

export default defineConfig({
  testDir: './tests/browser',
  use: {
    baseURL,
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: 'npm run preview -- --port 4174 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
  },
});
