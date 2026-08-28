import { describe, expect, it } from "vitest";
import { applyRating, fromCard, previewAll, toCard, type ReviewStateRow } from "@/lib/fsrs/scheduler";

const NOW = new Date("2026-08-27T00:00:00.000Z");

describe("toCard / fromCard", () => {
  it("round-trips a reviewed card's DB row unchanged", () => {
    const row: ReviewStateRow = {
      flashcard_id: "11111111-1111-4111-8111-111111111111",
      user_id: "22222222-2222-4222-8222-222222222222",
      due: "2026-09-01T00:00:00.000Z",
      stability: 5.42,
      difficulty: 6.1,
      elapsed_days: 3,
      scheduled_days: 5,
      reps: 2,
      lapses: 0,
      state: 2,
      last_review: "2026-08-27T00:00:00.000Z",
    };

    const card = toCard(row);
    const roundTripped = fromCard(row.flashcard_id, row.user_id, card);

    expect(roundTripped).toEqual(row);
  });

  it("builds a fresh card for a never-reviewed flashcard (row = null)", () => {
    const card = toCard(null);
    expect(card.state).toBe(0); // State.New
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(0);
  });
});

describe("previewAll", () => {
  it("previews all 4 ratings for a never-reviewed card, each due in the future", () => {
    const card = toCard(null);
    const previews = previewAll(card, NOW);

    expect(previews).toHaveLength(4);
    expect(previews.map((p) => p.rating).sort()).toEqual([1, 2, 3, 4]);
    for (const preview of previews) {
      expect(new Date(preview.dueAt).getTime()).toBeGreaterThan(NOW.getTime());
    }
  });

  it("orders intervals Again <= Hard <= Good <= Easy for a fixed starting card", () => {
    const card = toCard(null);
    const previews = previewAll(card, NOW);
    const byRating = new Map(previews.map((p) => [p.rating, p.intervalDays]));

    const again = byRating.get(1) ?? 0;
    const hard = byRating.get(2) ?? 0;
    const good = byRating.get(3) ?? 0;
    const easy = byRating.get(4) ?? 0;

    expect(again).toBeLessThanOrEqual(hard);
    expect(hard).toBeLessThanOrEqual(good);
    expect(good).toBeLessThanOrEqual(easy);
  });
});

describe("applyRating", () => {
  it("increases lapses and sharply reduces stability on a repeated Again", () => {
    // enable_short_term is off (see scheduler.ts) so a lapse never actually
    // transitions `state` to Relearning — it stays in Review with a much
    // lower stability instead. This test asserts the reachable behavior
    // (lapses accumulate, stability shrinks), not a Relearning transition.
    let card = applyRating(toCard(null), NOW, 3); // Good, to get out of New
    const afterGood = card;

    card = applyRating(card, afterGood.due, 1); // Again
    expect(card.lapses).toBe(1);
    expect(card.stability).toBeLessThan(afterGood.stability);

    const afterFirstAgain = card;
    card = applyRating(card, afterFirstAgain.due, 1); // Again again
    expect(card.lapses).toBe(2);
    expect(card.stability).toBeLessThan(afterFirstAgain.stability);
  });

  it("grows the interval across a realistic Good, Good, Again, Good sequence", () => {
    let card = toCard(null);
    let now = NOW;

    card = applyRating(card, now, 3); // Good
    const firstInterval = card.scheduled_days;
    now = card.due;

    card = applyRating(card, now, 3); // Good
    const secondInterval = card.scheduled_days;
    now = card.due;
    expect(secondInterval).toBeGreaterThanOrEqual(firstInterval);

    card = applyRating(card, now, 1); // Again
    now = card.due;
    expect(card.lapses).toBe(1);

    card = applyRating(card, now, 3); // Good
    expect(card.scheduled_days).toBeGreaterThan(0);
  });
});
