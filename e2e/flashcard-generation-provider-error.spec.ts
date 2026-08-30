// risk: test-plan.md #2 — an AI-provider failure (here: free-tier 429) must leave
//       the generator island in a VISIBLE, retryable error state, never spinning
//       in "generating", and must persist nothing.
// seed: e2e/seed.spec.ts
// boundaries: auth / routing / /api/flashcards/generate are REAL; OpenRouter is
//             stubbed at the HTTP layer and forced to 429 by the MOCK_RATE_LIMIT
//             marker in the source text (e2e/support/openrouter-mock.mjs).
import { test, expect } from "@playwright/test";
import { fillWhenReady, gotoHydrated } from "./support/astro";

test.describe("test-plan.md #2 — AI-provider failure is recoverable, not a hung screen", () => {
  test("a provider rate-limit surfaces a visible retry and persists nothing", async ({ page }) => {
    // MOCK_RATE_LIMIT → stub answers 429 → route maps it to a 429 + user message
    const sourceText = "MOCK_RATE_LIMIT\nThis run forces an OpenRouter rate-limit response.";

    await gotoHydrated(page, "/flashcards/generate");
    const generateButton = page.getByRole("button", { name: "Generuj", exact: true });
    await fillWhenReady(page.getByLabel("Tekst źródłowy"), sourceText, () =>
      expect(generateButton).toBeEnabled({ timeout: 1500 }),
    );
    await generateButton.click();

    // The island must leave "generating" for an error state that offers a retry
    await expect(page.getByRole("button", { name: "Spróbuj ponownie" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Generowanie...", exact: true })).toHaveCount(0);

    // Nothing was generated, so nothing can be accepted
    await expect(page.getByRole("button", { name: "Zaakceptuj propozycję" })).toHaveCount(0);
  });
});
