import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Wait until the interactive Astro islands on the page have hydrated.
 *
 * Astro renders `<astro-island ssr ...>` server-side and removes the `ssr`
 * attribute once the client runtime hydrates that island
 * (astro/dist/runtime/server/astro-island — `this.removeAttribute("ssr")`).
 * Acting before that races the handlers: clicks become no-ops and `fill()`
 * sets a value React never reads into state.
 *
 * `<= 1` tolerates one permanently-unhydrated island: the global
 * `<Toaster client:load>` in Layout.astro never loses `ssr` in this app (its
 * `next-themes` hook). Bounded, and best-effort on timeout — the per-field
 * guards below are what actually guarantee React caught the input.
 *
 * Call after every `goto` / `reload` before interacting with island UI.
 */
export async function waitForHydration(page: Page, timeout = 15000): Promise<void> {
  await page
    .waitForFunction(() => document.querySelectorAll("astro-island[ssr]").length <= 1, undefined, { timeout })
    .catch(() => {
      // best-effort: a never-hydrating island must not fail the spec
    });
}

/**
 * Navigate and wait for islands. Uses `domcontentloaded`, not `load`: on the
 * cold Vite dev server a route's first compile plus the stuck Toaster island can
 * delay the `load` event well past the navigation timeout, even though the DOM
 * and the islands we drive are ready.
 */
export async function gotoHydrated(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForHydration(page);
}

/** Reload counterpart of {@link gotoHydrated}. */
export async function reloadHydrated(page: Page): Promise<void> {
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForHydration(page);
}

/**
 * Fill a React-controlled field and confirm the component actually registered it
 * — retried, so a slow island hydration (cold Vite dev server) can't leave the
 * value set in the DOM but missing from React state. `confirm` asserts the
 * state update landed (e.g. the now-enabled submit button).
 */
export async function fillWhenReady(field: Locator, value: string, confirm: () => Promise<unknown>): Promise<void> {
  await expect(async () => {
    await field.fill(value);
    await confirm();
  }).toPass({ timeout: 45000 }); // generous: covers a cold route's first Vite compile
}
