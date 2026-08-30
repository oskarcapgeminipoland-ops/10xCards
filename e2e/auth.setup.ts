import { test as setup, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { gotoHydrated } from "./support/astro";

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

  await gotoHydrated(page, "/auth/signin");

  // The sign-in form has no validity-gated control to key off, so retry the
  // whole fill+submit until an authed page renders — this rides out a slow
  // island hydration where `fill()` sets the DOM value but React state stays
  // empty. Keying off the (SSR'd) sign-out control instead of a URL avoids the
  // edge-triggered `waitForURL` racing the deck island's history.replaceState.
  const signOut = page.getByRole("button", { name: "Wyloguj się" });
  await expect(async () => {
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Hasło", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await expect(signOut).toBeVisible({ timeout: 15000 });
  }).toPass({ timeout: 75000 });

  mkdirSync(dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });

  // Warm the heaviest route's first Vite compile + island bundle now, while
  // still authenticated, so the specs that drive it don't race a cold ~40s
  // transform. Best-effort — a slow warm-up must not fail auth setup.
  await page
    .goto("/flashcards/generate", { waitUntil: "domcontentloaded", timeout: 90000 })
    .then(() => page.getByLabel("Tekst źródłowy").waitFor({ timeout: 90000 }))
    .catch(() => {
      /* the spec's own fillWhenReady retry still covers a cold route */
    });
});
