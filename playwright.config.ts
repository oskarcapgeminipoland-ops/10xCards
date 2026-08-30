import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Load .env (gitignored) without pulling in a dotenv dependency. Real environment
 * variables (e.g. CI secrets) always win over the file.
 */
try {
  const env = readFileSync(new URL(".env", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = (match[2] ?? "").replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // No .env file — rely on the ambient environment.
}

/**
 * E2E config. Astro dev server runs on 4321 (see `npm run dev`).
 * Override with PLAYWRIGHT_BASE_URL to point at a deployed environment.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321";

const storageState = "e2e/.auth/user.json";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
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
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
