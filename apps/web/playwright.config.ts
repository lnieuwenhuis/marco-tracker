import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

const appPort = process.env.PLAYWRIGHT_PORT ?? "3000";
const appUrl = `http://localhost:${appPort}`;
const e2eDatabaseUrl = `file:${join(
  tmpdir(),
  `macro-tracker-playwright-db-${Date.now()}`,
)}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: appUrl,
    trace: "on-first-retry",
    ...devices["Pixel 7"],
  },
  webServer: {
    command: `pnpm dev --port ${appPort}`,
    url: appUrl,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: e2eDatabaseUrl,
      APP_URL: appUrl,
      SESSION_SECRET: "test-secret",
      ENABLE_TEST_ROUTES: "true",
      SHOO_BASE_URL: "https://shoo.dev",
      ADMIN_OWNER_EMAILS: "owner@example.com",
    },
  },
});
