import type { APIRequestContext } from "@playwright/test";

/**
 * Shared helpers for flashcard E2E specs.
 *
 * Cleanup runs through the API (not the UI): the deck renders every card with an
 * identical "Usuń fiszkę" button and no per-row role to scope to, so deleting a
 * specific card from the UI would need DOM-structure traversal. `page.request`
 * carries the same authenticated cookies as the page, so the REST route is the
 * clean, deterministic teardown path.
 */

/** A per-run identifier — unique across parallel workers and re-runs. */
export function uniqueTag(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Delete every flashcard whose question carries `tag`. Safe to call before setup
 * (crash recovery) and after the test (teardown). Searches by the bare tag —
 * alphanumeric plus `-`, no filter-mini-language metacharacters.
 */
export async function cleanupFlashcardsByTag(request: APIRequestContext, tag: string): Promise<void> {
  const res = await request.get(`/api/flashcards?search=${encodeURIComponent(tag)}&limit=50`);
  if (!res.ok()) return;
  const { items } = (await res.json()) as { items: { id: string }[] };
  for (const item of items) {
    await request.delete(`/api/flashcards/${item.id}`);
  }
}
