import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Load .env (gitignored) without pulling in a dotenv dependency. Real environment
 * variables (e.g. CI secrets) always win over the file.
 */
try {
  const env = readFileSync(new URL(".env", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const match = /^\s*([\w.-]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!(key in process.env)) {
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // No .env file — rely on the ambient environment.
}

/**
 * E2E config.
 *
 * The dev server it drives runs on a DEDICATED port (4331, not the 4321 used by
 * `npm run dev` / codegen) so it never collides with a dev server you started by
 * hand, and so Playwright always starts a fresh one wired to the OpenRouter HTTP
 * stub (see `e2e/support/openrouter-mock.mjs`). Override with PLAYWRIGHT_BASE_URL
 * to point the whole run at a deployed environment instead.
 */
const MOCK_PORT = Number(process.env.OPENROUTER_MOCK_PORT ?? 4399);
const APP_PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4331);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${APP_PORT}`;

const storageState = "e2e/.auth/user.json";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // These specs drive a cold `astro dev` server: a route's first Vite compile
  // plus island hydration is well past Playwright's 30s default (auth.setup
  // warms the heaviest route, but the first cold hit still costs). One worker
  // so parallel specs don't contend on that single dev process.
  timeout: 120_000,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState },
      dependencies: ["setup"],
    },
  ],
  webServer: [
    {
      command: `node e2e/support/openrouter-mock.mjs`,
      port: MOCK_PORT,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
    },
    {
      command: `npm run dev -- --port ${APP_PORT}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        OPENROUTER_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
        OPENROUTER_API_KEY: "e2e-mock-key",
      },
    },
  ],
});
