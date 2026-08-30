// risk: test-plan.md §6.3 — manual flashcard management (roadmap slice S-03).
//       A fuller journey than the single-risk specs, converted from a manual
//       `npx playwright codegen` recording: the sign-in error path must surface a
//       VISIBLE failure (never a silent no-op), and create / edit / delete must
//       each round-trip through the real API + DB and be reflected in the deck —
//       not just live in island state.
// seed: e2e/seed.spec.ts
// boundaries: EVERYTHING is real — auth, routing, /api/flashcards/*, Supabase
//             (prod). No AI generation on this path, so no OpenRouter stub.
import { test, expect, type Page } from "@playwright/test";
import { gotoHydrated } from "./support/astro";
import { cleanupFlashcardsByTag, uniqueTag } from "./support/flashcards";

// This spec drives its own sign-in / sign-out, so it must start unauthenticated —
// override the storageState the `chromium` project injects for every other spec.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Fill and submit the sign-in form, retried as one unit: rides out a slow island
 * hydration where `fill()` sets the DOM value but React state stays empty. The
 * `toHaveValue` guards confirm the controlled inputs actually caught the input
 * before we submit; the URL predicate settles on either outcome (error redirect
 * back to /auth/signin, or a successful redirect away from it).
 */
async function submitSignIn(page: Page, user: string, pass: string): Promise<void> {
  const emailField = page.getByLabel("E-mail", { exact: true });
  const passwordField = page.getByLabel("Hasło", { exact: true });

  await expect(async () => {
    await emailField.fill(user);
    await passwordField.fill(pass);
    await expect(emailField).toHaveValue(user);
    await expect(passwordField).toHaveValue(pass);
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await page.waitForURL((url) => url.pathname !== "/auth/signin" || url.search.includes("error="), {
      timeout: 15000,
    });
  }).toPass({ timeout: 75000 });
}

function credentials(): { email: string; password: string } {
  const email = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error("E2E_USERNAME / E2E_PASSWORD must be set (see .env or CI secrets).");
  }
  return { email, password };
}

test.describe("test-plan.md §6.3 — manual flashcard management, full CRUD journey", () => {
  // The sign-out below is a GLOBAL Supabase revocation (supabase.auth.signOut()
  // with no scope) — it kills the token in e2e/.auth/user.json that every other
  // spec loads. Always sign back in and rewrite the storageState so suite order
  // and re-runs are unaffected, even if the test body failed before signing out.
  test.afterEach(async ({ page }) => {
    const { email, password } = credentials();
    await gotoHydrated(page, "/auth/signin");
    await submitSignIn(page, email, password);
    await expect(page.getByRole("button", { name: "Wyloguj się" })).toBeVisible();
    await page.context().storageState({ path: "e2e/.auth/user.json" });
  });

  test("sign-in error path, then create → verify → edit → delete → sign out", async ({ page }) => {
    const { email, password } = credentials();

    const tag = uniqueTag();
    const question = `[${tag}] Jaka jest stolica Polski?`;
    const answer1 = `Pierwsza odpowiedź ${tag}`;
    const answer2 = `Zmieniona odpowiedź ${tag}`;

    await test.step("wrong password is rejected with a visible error", async () => {
      await gotoHydrated(page, "/auth/signin");
      await submitSignIn(page, email, `${password}-wrong`);

      // The API redirects back to /auth/signin?error=... and the form re-renders
      // the raw Supabase message (the app passes provider errors through, see
      // src/lib/i18n.ts). Exact-match the ServerError <p> — a substring match can
      // also catch the Vite dev-error overlay's prop dump on a cold server.
      await expect(page).toHaveURL(/\/auth\/signin\?error=/);
      await expect(page.getByText("Invalid login credentials", { exact: true })).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole("button", { name: "Wyloguj się" })).toHaveCount(0);
    });

    await test.step("correct credentials sign the user in", async () => {
      await submitSignIn(page, email, password);
      // The Topbar's sign-out control is SSR'd on every authed page — a stable
      // signal that the session took, without racing a specific redirect target.
      await expect(page.getByRole("button", { name: "Wyloguj się" })).toBeVisible();
    });

    // teardown-before-setup: clear anything a crashed earlier run left behind
    await cleanupFlashcardsByTag(page.request, tag);

    try {
      await test.step("create a flashcard and see it in the deck", async () => {
        await gotoHydrated(page, "/flashcards");

        // Retry the open: the first click can reach a not-yet-wired handler.
        await expect(async () => {
          await page.getByRole("button", { name: "Nowa fiszka" }).click();
          await expect(page.getByLabel("Pytanie", { exact: true })).toBeVisible({ timeout: 1500 });
        }).toPass({ timeout: 20000 });

        await page.getByLabel("Pytanie", { exact: true }).fill(question);
        await page.getByLabel("Odpowiedź", { exact: true }).fill(answer1);
        const submit = page.getByRole("button", { name: "Utwórz fiszkę", exact: true });
        await expect(submit).toBeEnabled();

        const created = page.waitForResponse(
          (r) => r.url().includes("/api/flashcards") && r.request().method() === "POST",
        );
        await submit.click();
        expect((await created).status()).toBe(201);

        // Dialog closes on success; then the card (not the still-mounted textarea)
        // carries the text.
        await expect(page.getByRole("dialog")).toBeHidden();
        await expect(page.getByText(question, { exact: true })).toBeVisible();
        await expect(page.getByText(answer1, { exact: true })).toBeVisible();
      });

      await test.step("edit the answer and see the change persist", async () => {
        await expect(async () => {
          await page.getByRole("button", { name: "Edytuj fiszkę" }).first().click();
          await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1500 });
        }).toPass({ timeout: 20000 });

        const answerField = page.getByLabel("Odpowiedź", { exact: true });
        await expect(answerField).toHaveValue(answer1); // dialog prefilled from the current card
        await answerField.fill(answer2);
        const save = page.getByRole("button", { name: "Zapisz zmiany", exact: true });
        await expect(save).toBeEnabled();

        const updated = page.waitForResponse(
          (r) => /\/api\/flashcards\/[^/]+$/.test(new URL(r.url()).pathname) && r.request().method() === "PATCH",
        );
        await save.click();
        expect((await updated).status()).toBe(200);

        await expect(page.getByRole("dialog")).toBeHidden();
        await expect(page.getByText(answer2, { exact: true })).toBeVisible();
        await expect(page.getByText(answer1, { exact: true })).toHaveCount(0);
      });

      await test.step("delete the flashcard and see it leave the deck", async () => {
        await page.getByRole("button", { name: "Usuń fiszkę" }).first().click();
        const confirm = page.getByRole("alertdialog");
        await expect(confirm).toBeVisible();

        const deleted = page.waitForResponse(
          (r) => /\/api\/flashcards\/[^/]+$/.test(new URL(r.url()).pathname) && r.request().method() === "DELETE",
        );
        await confirm.getByRole("button", { name: "Usuń", exact: true }).click();
        expect((await deleted).status()).toBe(204);

        await expect(page.getByText(question, { exact: true })).toHaveCount(0);
      });
    } finally {
      // Runs even if a step above threw — the row must never outlive the test.
      // Still authenticated here (sign-out is the next step).
      await cleanupFlashcardsByTag(page.request, tag);
    }

    await test.step("sign out returns to the guest view", async () => {
      await page.getByRole("button", { name: "Wyloguj się" }).click();
      await expect(page.getByText("Niezalogowany")).toBeVisible();
      await expect(page.getByRole("button", { name: "Wyloguj się" })).toHaveCount(0);
    });
    // afterEach re-establishes e2e/.auth/user.json for the rest of the suite.
  });
});
