import { defineConfig } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'http://localhost:4173';

export default defineConfig({
  testDir: './tests',
  timeout: 300_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    channel: 'chrome-canary',
    viewport: { width: 1280, height: 900 },
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'pnpm build && pnpm preview --port 4173 --strictPort',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
