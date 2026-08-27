/**
 * Minimal vitest config, deliberately scoped: only `src/lib/fsrs/` is
 * covered (see `CLAUDE.md` and the plan's Testing Strategy). No Astro/React
 * test integration is added — the covered module has no Astro or React
 * imports, so the default Node environment with no plugins is enough.
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
    include: ["src/lib/fsrs/**/*.test.ts"],
  },
});
