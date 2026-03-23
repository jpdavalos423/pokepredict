import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3200);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  retries: 0,
  reporter: 'list',
  use: {
    headless: true,
    baseURL
  },
  webServer: {
    command: `corepack pnpm --filter @pokepredict/web dev --port ${port} --hostname 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
