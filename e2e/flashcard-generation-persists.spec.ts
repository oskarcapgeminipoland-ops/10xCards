// risk: test-plan.md #1 — a user pastes valid text, accepts a generated proposal,
//       and the accepted flashcard must survive a full SSR page reload (atomic
//       save + SSR<->island handoff), not just live in island state.
// seed: e2e/seed.spec.ts
// boundaries: auth / routing / /api/flashcards/* / Supabase (prod) are REAL;
//             OpenRouter is stubbed at the HTTP layer via OPENROUTER_BASE_URL
//             (e2e/support/openrouter-mock.mjs).
import { test, expect } from "@playwright/test";
import { fillWhenReady, gotoHydrated, reloadHydrated } from "./support/astro";
import { cleanupFlashcardsByTag, uniqueTag } from "./support/flashcards";

test.describe("test-plan.md #1 — AI generation, accept, persistence", () => {
  test("a generated flashcard the user accepts survives a full page reload", async ({ page }) => {
    const tag = uniqueTag();
    // The stub keys off E2E_TAG: it returns deterministic cards whose question is
    // prefixed with `[<tag>] `, so this run's data is unique and cleanable.
    const sourceText = `E2E_TAG:${tag}\nGenerate flashcards about spaced repetition for this run.`;
    const expectedQuestion = `[${tag}] What is spaced repetition?`;

    // teardown-before-setup: clear anything a crashed earlier run left behind
    await cleanupFlashcardsByTag(page.request, tag);

    // Paste the source text and generate (OpenRouter answers from the stub)
    await gotoHydrated(page, "/flashcards/generate");
    const generateButton = page.getByRole("button", { name: "Generuj", exact: true });
    // The button enables only from React state, so this confirms the fill landed.
    await fillWhenReady(page.getByLabel("Tekst źródłowy"), sourceText, () =>
      expect(generateButton).toBeEnabled({ timeout: 1500 }),
    );
    await generateButton.click();

    // Proposals render from the stubbed generation
    await expect(page.getByText(expectedQuestion)).toBeVisible();

    // Accept the first proposal — persisted immediately via POST /api/flashcards/accept
    const accepted = page.waitForResponse(
      (r) => r.url().includes("/api/flashcards/accept") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Zaakceptuj propozycję" }).first().click();
    expect((await accepted).status()).toBe(201);

    // It shows up in the deck...
    await gotoHydrated(page, "/flashcards");
    await expect(page.getByText(expectedQuestion)).toBeVisible();

    // ...and survives a real SSR page reload — the regression this test catches
    await reloadHydrated(page);
    await expect(page.getByText(expectedQuestion)).toBeVisible();

    // Cleanup
    await cleanupFlashcardsByTag(page.request, tag);
  });
});
