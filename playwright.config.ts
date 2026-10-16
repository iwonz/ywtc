import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    browserName: 'chromium',
    channel: 'chrome',
    headless: true,
  },
});
