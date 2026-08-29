import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { t } from "@/lib/i18n";
import { flashcardInputSchema, generateRequestSchema } from "@/lib/schemas/flashcard";

/**
 * Rollout Phase 1 / Risk #5 (part) — the shared question/answer/source-text
 * validation schema must reject empty-after-trim and over-limit input with the
 * right message, accept the boundary value, measure the TRIMMED length, and the
 * 500 / 1000 / 5000 limits must agree across every copy that lives in testable
 * code (schema behaviour, DB migration CHECK, i18n message strings).
 *
 * Oracle sources (NOT flashcardInputSchema.max — that would be a mirror test,
 * test-plan.md §2 Risk #5 anti-pattern):
 * - supabase/migrations/20260823134802_create_flashcards_table.sql:27-28
 * - src/lib/i18n.ts:259-266
 * - context/foundation/prd.md (source-text paste cap)
 * - zod 4.4.3 .trim() ordering, documented in research.md Area 5
 */

const resolveRepo = (rel: string) => fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
const MIGRATION = "supabase/migrations/20260823134802_create_flashcards_table.sql";

describe("flashcardInputSchema — boundary & trim behaviour", () => {
  it("accepts a minimal valid pair and returns it unchanged", () => {
    const parsed = flashcardInputSchema.safeParse({ question: "q", answer: "a" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual({ question: "q", answer: "a" });
  });

  it("accepts exactly 500 / 1000 chars after trim", () => {
    const parsed = flashcardInputSchema.safeParse({
      question: "q".repeat(500),
      answer: "a".repeat(1000),
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a 501-char question with the 'too long' message", () => {
    const parsed = flashcardInputSchema.safeParse({ question: "q".repeat(501), answer: "a" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]?.message).toBe(t.validation.questionTooLong);
  });

  it("rejects a 1001-char answer with the 'too long' message", () => {
    const parsed = flashcardInputSchema.safeParse({ question: "q", answer: "a".repeat(1001) });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]?.message).toBe(t.validation.answerTooLong);
  });

  it("rejects a whitespace-only question as required (trim runs before min(1))", () => {
    const parsed = flashcardInputSchema.safeParse({ question: "   ", answer: "a" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]?.message).toBe(t.validation.questionRequired);
  });

  it("measures the TRIMMED length: 500 real chars + trailing spaces passes and is stored trimmed", () => {
    const parsed = flashcardInputSchema.safeParse({ question: `${"q".repeat(500)}     `, answer: "a" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.question).toBe("q".repeat(500));
  });

  it("rejects a non-string question (invalid_type)", () => {
    const parsed = flashcardInputSchema.safeParse({ question: 123, answer: "a" });
    expect(parsed.success).toBe(false);
  });
});

describe("generateRequestSchema — source-text boundary", () => {
  it("accepts exactly 5000 chars after trim", () => {
    expect(generateRequestSchema.safeParse({ sourceText: "x".repeat(5000) }).success).toBe(true);
  });

  it("rejects 5001 chars with the 'too long' message", () => {
    const parsed = generateRequestSchema.safeParse({ sourceText: "x".repeat(5001) });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]?.message).toBe(t.validation.sourceTextTooLong);
  });

  it("rejects whitespace-only source text as required", () => {
    const parsed = generateRequestSchema.safeParse({ sourceText: "   " });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]?.message).toBe(t.validation.sourceTextRequired);
  });
});

describe("importer parity — every route and client form imports the shared schema object, not a local copy", () => {
  // Grep-verified list from research.md Area 5. If a file's import STYLE changes
  // (e.g. to a namespace import) this test fails loudly so the list is updated
  // deliberately. It proves the import edge only — that the symbol is wired into
  // safeParse in each route is §3 Phase 3 (local Supabase).
  const IMPORT_SPECS: { file: string; symbol: string }[] = [
    { file: "src/lib/services/flashcard-generation-parse.ts", symbol: "flashcardInputSchema" },
    { file: "src/pages/api/flashcards/accept.ts", symbol: "flashcardInputSchema" },
    { file: "src/pages/api/flashcards/index.ts", symbol: "flashcardInputSchema" },
    { file: "src/pages/api/flashcards/[id].ts", symbol: "flashcardInputSchema" },
    { file: "src/components/flashcards/FlashcardForm.tsx", symbol: "flashcardInputSchema" },
    { file: "src/pages/api/flashcards/generate.ts", symbol: "generateRequestSchema" },
    { file: "src/components/flashcards/FlashcardGenerator.tsx", symbol: "generateRequestSchema" },
  ];

  it.each(IMPORT_SPECS)("$file imports { $symbol } from @/lib/schemas/flashcard", ({ file, symbol }) => {
    const src = readFileSync(resolveRepo(file), "utf8");
    const named = /import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*["']@\/lib\/schemas\/flashcard["']/.exec(src);
    if (!named) {
      const isNamespace = /import\s+\*\s+as\s+\w+\s+from\s*["']@\/lib\/schemas\/flashcard["']/.test(src);
      throw new Error(
        isNamespace
          ? `${file} uses a namespace import from @/lib/schemas/flashcard; this parity test expects a named import of ${symbol}. Update IMPORT_SPECS if that is intentional.`
          : `${file} has no import from @/lib/schemas/flashcard (expected a named import of ${symbol}).`,
      );
    }
    const names = named[1].split(",").map((s) => s.trim());
    expect(names).toContain(symbol);
  });
});

describe("limit parity — 500 / 1000 / 5000 agree across schema, migration and i18n", () => {
  // These three numbers ARE the oracle. Source: the DB CHECK constraints in
  // supabase/migrations/20260823134802_create_flashcards_table.sql:27-28 and the
  // source-text paste cap in context/foundation/prd.md. Hard-coded on purpose —
  // reading them off flashcardInputSchema.max would make this a mirror test.
  const LIMITS = { question: 500, answer: 1000, sourceText: 5000 } as const;

  describe("schema face — accepts exactly LIMITS chars, rejects one more", () => {
    it("question", () => {
      expect(flashcardInputSchema.safeParse({ question: "q".repeat(LIMITS.question), answer: "a" }).success).toBe(true);
      expect(flashcardInputSchema.safeParse({ question: "q".repeat(LIMITS.question + 1), answer: "a" }).success).toBe(
        false,
      );
    });

    it("answer", () => {
      expect(flashcardInputSchema.safeParse({ question: "q", answer: "a".repeat(LIMITS.answer) }).success).toBe(true);
      expect(flashcardInputSchema.safeParse({ question: "q", answer: "a".repeat(LIMITS.answer + 1) }).success).toBe(
        false,
      );
    });

    it("sourceText", () => {
      expect(generateRequestSchema.safeParse({ sourceText: "x".repeat(LIMITS.sourceText) }).success).toBe(true);
      expect(generateRequestSchema.safeParse({ sourceText: "x".repeat(LIMITS.sourceText + 1) }).success).toBe(false);
    });
  });

  it("migration face — DB CHECK numbers match LIMITS; no source-text column exists", () => {
    // ASSUMPTION: the question/answer length CHECK is defined once, in this
    // create-table migration, and never altered by a later ALTER TABLE
    // migration. This project already ships constraint-only follow-up
    // migrations, so if that ever changes, widen this to glob every
    // supabase/migrations/*.sql and take the LAST CHECK match per column.
    const sql = readFileSync(resolveRepo(MIGRATION), "utf8");
    const q = /length\(question\)\s*<=\s*(\d+)/.exec(sql);
    const a = /length\(answer\)\s*<=\s*(\d+)/.exec(sql);
    expect(q).not.toBeNull();
    expect(a).not.toBeNull();
    expect(Number(q?.[1])).toBe(LIMITS.question);
    expect(Number(a?.[1])).toBe(LIMITS.answer);
    // source text is never persisted — the only gate is generateRequestSchema.
    expect(sql).not.toMatch(/source_?text/i);
    expect(sql).not.toContain(String(LIMITS.sourceText));
  });

  it("i18n face — each 'too long' message states its LIMITS number", () => {
    expect(t.validation.questionTooLong).toContain(String(LIMITS.question));
    expect(t.validation.answerTooLong).toContain(String(LIMITS.answer));
    expect(t.validation.sourceTextTooLong).toContain(String(LIMITS.sourceText));
  });

  // The 4th copy — QUESTION_LIMIT / ANSWER_LIMIT in FlashcardForm.tsx and
  // SOURCE_TEXT_LIMIT in FlashcardGenerator.tsx — is display-only (it drives the
  // character counter, not validation). Cosmetic drift, low severity; not
  // covered here on purpose (research.md Area 5).
});
