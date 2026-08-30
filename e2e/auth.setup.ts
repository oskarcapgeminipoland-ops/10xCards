import { test as setup, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Auth setup: signs in once through the real form and persists the session to
 * `storageState`, so every spec starts already authenticated (no login in the UI
 * per test). Runs as the `setup` project that `chromium` depends on.
 *
 * Supabase points at prod (no local Docker, by design), so this uses a real
 * dedicated test account — credentials come from E2E_USERNAME / E2E_PASSWORD
 * (see .env locally, repo secrets in CI).
 */
const authFile = "e2e/.auth/user.json";

setup("authenticate", async ({ page }) => {
  const email = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error("E2E_USERNAME / E2E_PASSWORD must be set (see .env or CI secrets).");
  }

  await page.goto("/auth/signin");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();

  // A successful sign-in redirects "/" -> "/flashcards" for an authed user;
  // the Topbar there exposes the sign-out control.
  await page.waitForURL("**/flashcards");
  await expect(page.getByRole("button", { name: "Wyloguj się" })).toBeVisible();

  mkdirSync(dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
