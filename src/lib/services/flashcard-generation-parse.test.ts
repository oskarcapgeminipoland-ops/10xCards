import { describe, expect, it } from "vitest";

import { parseGeneratedContent, stripCodeFence } from "@/lib/services/flashcard-generation-parse";

/**
 * Rollout Phase 1 / Risk #1 — the parse/validate/cap pipeline must never turn a
 * correct paste into a silently-empty result, and adversarial LLM output must
 * fail closed with a deterministic error instead of throwing.
 *
 * Oracle sources (NOT the implementation's own output):
 * - context/archive/2026-08-25-ai-flashcard-generation/plan.md:45,71,115,137
 * - context/archive/2026-08-25-ai-flashcard-generation/reviews/plan-review.md F1, F5
 * - context/foundation/test-plan.md §2 Risk #1 + Risk Response Guidance
 * - context/changes/testing-ai-generation-parsing/research.md Areas 1–4
 *
 * Rule: every expected value below is hand-built from the documented contract
 * (strip ONE fully-enclosing fence → JSON.parse → must be an array → drop only
 * schema-invalid items → cap to 5, counting only schema failures; never throw).
 * No assertion is a snapshot of what the function returned on a recorded LLM
 * response.
 */

const VALID_A = { question: "q1", answer: "a1" };
const VALID_B = { question: "q2", answer: "a2" };

describe("stripCodeFence", () => {
  it("strips a bare ```json fence enclosing the whole trimmed string", () => {
    const inner = '[{"question":"q","answer":"a"}]';
    expect(stripCodeFence("```json\n" + inner + "\n```")).toBe(inner);
  });

  it("strips a fence with no info-string", () => {
    expect(stripCodeFence("```\n[1,2,3]\n```")).toBe("[1,2,3]");
  });

  it("trims whitespace around the whole fence before matching", () => {
    expect(stripCodeFence("   \n```json\n[]\n```\n   ")).toBe("[]");
  });

  it("leaves the string intact (bar an outer trim) when prose precedes the fence", () => {
    // The regex is ^…$-anchored on content.trim() → a leading word defeats it.
    expect(stripCodeFence("prefix ```json\n[]\n``` ")).toBe("prefix ```json\n[]\n```");
  });

  it("leaves the string intact when text follows the closing fence", () => {
    const input = "```json\n[]\n```\ntrailing";
    expect(stripCodeFence(input)).toBe(input);
  });

  it("does not cleanly handle an uppercase info-string: the ``` markers are removed but the tag word stays glued to the payload", () => {
    // `(?:json)?` is lowercase-only, so it matches empty and the greedy body
    // swallows `JSON`. The outer fence IS stripped, but the result is
    // un-parseable — which is why the pipeline fails closed on this input
    // (see the adversarial cases below).
    expect(stripCodeFence("```JSON\n[]\n```")).toBe("JSON\n[]");
  });

  it("returns the trimmed input unchanged when there is no fence", () => {
    expect(stripCodeFence("  [1,2,3]  ")).toBe("[1,2,3]");
  });
});

describe("parseGeneratedContent — valid input", () => {
  it("returns every schema-valid item in order, droppedCount 0, error null", () => {
    const result = parseGeneratedContent(JSON.stringify([VALID_A, VALID_B]));
    expect(result.error).toBeNull();
    expect(result.data?.proposals).toEqual([VALID_A, VALID_B]);
    expect(result.data?.droppedCount).toBe(0);
  });

  it("produces an identical result when the same array is wrapped in a ```json fence", () => {
    const fenced = "```json\n" + JSON.stringify([VALID_A, VALID_B]) + "\n```";
    const result = parseGeneratedContent(fenced);
    expect(result.error).toBeNull();
    expect(result.data?.proposals).toEqual([VALID_A, VALID_B]);
    expect(result.data?.droppedCount).toBe(0);
  });

  it("strips unknown keys but keeps the item (schema is not .strict())", () => {
    const result = parseGeneratedContent(JSON.stringify([{ ...VALID_A, foo: "bar" }]));
    expect(result.error).toBeNull();
    expect(result.data?.proposals).toEqual([VALID_A]);
    expect(result.data?.droppedCount).toBe(0);
  });
});

describe("parseGeneratedContent — partial failure drops only invalid items and counts them", () => {
  const DROP_CASES: { name: string; bad: unknown }[] = [
    { name: "question is a number (invalid_type)", bad: { question: 123, answer: "a" } },
    { name: "answer missing", bad: { question: "q" } },
    { name: "element is null", bad: null },
    { name: "element is a bare string", bad: "nope" },
    { name: "element is a bare number", bad: 42 },
    { name: "question is whitespace-only (empty after trim)", bad: { question: "   ", answer: "a" } },
    { name: "question exceeds 500 after trim", bad: { question: "q".repeat(501), answer: "a" } },
    { name: "answer exceeds 1000 after trim", bad: { question: "q", answer: "a".repeat(1001) } },
  ];

  it.each(DROP_CASES)("drops the invalid element ($name) and keeps the valid items around it", ({ bad }) => {
    const result = parseGeneratedContent(JSON.stringify([VALID_A, bad, VALID_B]));
    expect(result.error).toBeNull();
    expect(result.data?.proposals).toEqual([VALID_A, VALID_B]);
    expect(result.data?.droppedCount).toBe(1);
  });
});

describe("parseGeneratedContent — empty and all-invalid arrays are not errors", () => {
  it("a valid empty array → proposals [], droppedCount 0, error null", () => {
    const result = parseGeneratedContent("[]");
    expect(result.error).toBeNull();
    expect(result.data?.proposals).toEqual([]);
    expect(result.data?.droppedCount).toBe(0);
  });

  it("an all-invalid array → proposals [], droppedCount = N, error null (droppedCount is the only signal)", () => {
    const result = parseGeneratedContent('[{"bad":1},{"also":"bad"}]');
    expect(result.error).toBeNull();
    expect(result.data?.proposals).toEqual([]);
    expect(result.data?.droppedCount).toBe(2);
  });
});

describe("parseGeneratedContent — caps the surviving list at MAX_PROPOSALS (5)", () => {
  it("keeps the first 5 of 8 schema-valid items in order; cap-overflow is not added to droppedCount", () => {
    // droppedCount is defined as "items that failed flashcardInputSchema and were
    // discarded" (archive/2026-08-25-ai-flashcard-generation/plan.md:115). The
    // slice(0, 5) runs after droppedCount is final, so overflow items vanish
    // silently with droppedCount 0. This test documents that contract.
    const items = Array.from({ length: 8 }, (_, i) => ({ question: `q${i + 1}`, answer: `a${i + 1}` }));
    const result = parseGeneratedContent(JSON.stringify(items));
    expect(result.error).toBeNull();
    expect(result.data?.proposals).toHaveLength(5);
    expect(result.data?.proposals.map((p) => p.question)).toEqual(["q1", "q2", "q3", "q4", "q5"]);
    expect(result.data?.droppedCount).toBe(0);
  });
});

describe("parseGeneratedContent — adversarial payloads fail closed with a deterministic error and never throw", () => {
  const NOT_JSON = "AI response was not valid JSON";
  const NOT_ARRAY = "AI response was not a JSON array";

  const ADVERSARIAL: { name: string; input: string; error: string }[] = [
    {
      name: "fence wrapped in leading prose",
      input: 'Here are your flashcards:\n```json\n[{"question":"q","answer":"a"}]\n```',
      error: NOT_JSON,
    },
    {
      name: "valid fence with a trailing sentence",
      input: '```json\n[{"question":"q","answer":"a"}]\n```\nHope this helps!',
      error: NOT_JSON,
    },
    {
      name: "uppercase JSON info-string",
      input: '```JSON\n[{"question":"q","answer":"a"}]\n```',
      error: NOT_JSON,
    },
    {
      name: "truncated mid-array (token cap hit)",
      input: '[{"question":"q","answer":"a"',
      error: NOT_JSON,
    },
    { name: "empty string", input: "", error: NOT_JSON },
    { name: "whitespace-only string", input: "   ", error: NOT_JSON },
    {
      name: "JSON object instead of an array",
      input: '{"flashcards":[{"question":"q","answer":"a"}]}',
      error: NOT_ARRAY,
    },
  ];

  it.each(ADVERSARIAL)("$name → { data: null, error } and does not throw", ({ input, error }) => {
    expect(() => parseGeneratedContent(input)).not.toThrow();
    const result = parseGeneratedContent(input);
    expect(result.data).toBeNull();
    expect(result.error).toBe(error);
  });
});
