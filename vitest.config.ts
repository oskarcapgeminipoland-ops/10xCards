/**
 * Vitest config for this project's unit tests. Coverage spans the pure,
 * framework-free modules under `src/lib/`: FSRS scheduling logic
 * (`src/lib/fsrs/`) plus the AI-generation parse/validate pipeline and its
 * shared zod schemas (`src/lib/services/`, `src/lib/schemas/`). None of these
 * import Astro or React, so the default Node environment with no plugins is
 * enough; there is still no Astro/React component test integration.
 */
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/lib/fsrs/**/*.test.ts", "src/lib/services/**/*.test.ts", "src/lib/schemas/**/*.test.ts"],
  },
});
