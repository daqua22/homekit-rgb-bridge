import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  timeout: 60000,
  use: {
    browserName: 'chromium',
    headless: true,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  reporter: 'list',
});
