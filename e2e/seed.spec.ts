import { test, expect } from "@playwright/test";
import { gotoHydrated, reloadHydrated } from "./support/astro";
import { cleanupFlashcardsByTag, uniqueTag } from "./support/flashcards";

/**
 * SEED TEST — the exemplar every generated flashcard spec is modeled on.
 * What you show is what you get: role-based locators, one self-contained cycle
 * (setup → action → assertion → cleanup), waits for state not time, unique data,
 * and a name bound to a real risk.
 *
 * Risk it stands in for: test-plan.md #5-adjacent — a flashcard the user creates
 * must still be there after a full SSR page reload (not just in island state).
 * Auth is real via storageState (playwright.config.ts `setup` project); the DB
 * is the real (prod) Supabase.
 */
test.describe("seed — a created flashcard persists across a reload", () => {
  test("manually created flashcard survives a full page reload", async ({ page }) => {
    const tag = uniqueTag();
    const question = `[${tag}] What is a seed test?`;
    const answer = "The exemplar a generator models every other test on.";

    // teardown-before-setup: clear anything a crashed earlier run left behind
    await cleanupFlashcardsByTag(page.request, tag);

    // Open the create dialog. The retry rides out a slow island hydration where
    // the first click reaches a not-yet-wired handler and is a no-op.
    await gotoHydrated(page, "/flashcards");
    await expect(async () => {
      await page.getByRole("button", { name: "Nowa fiszka" }).click();
      await expect(page.getByLabel("Pytanie", { exact: true })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20000 });

    // Fill the form; the submit button enables only from React state, so waiting
    // for it confirms both fields registered.
    await page.getByLabel("Pytanie", { exact: true }).fill(question);
    await page.getByLabel("Odpowiedź", { exact: true }).fill(answer);
    const submit = page.getByRole("button", { name: "Utwórz fiszkę", exact: true });
    await expect(submit).toBeEnabled();

    const created = page.waitForResponse((r) => r.url().includes("/api/flashcards") && r.request().method() === "POST");
    await submit.click();
    expect((await created).status()).toBe(201);

    // The dialog closes on success, then the new card is visible in the deck.
    // (Waiting for the dialog to close also disambiguates the question text from
    // the still-mounted form textarea.)
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText(question)).toBeVisible();

    // ...and still visible after a real SSR reload — the behavior the risk targets
    await reloadHydrated(page);
    await expect(page.getByText(question)).toBeVisible();

    // Cleanup
    await cleanupFlashcardsByTag(page.request, tag);
  });
});
