import {defineConfig} from '@playwright/test';

const browserChannel = process.env.PLAYWRIGHT_CHANNEL;

export default defineConfig({
  testDir: './tests/browser',
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{platform}/{arg}{ext}',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    browserName: 'chromium',
    ...(browserChannel ? {channel: browserChannel} : {}),
    headless: true,
  },
});
