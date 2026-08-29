// Lightweight ESLint config — used ONLY by the per-edit lint hook
// (.claude/hooks/lint-changed.mjs), never by `npm run lint`.
//
// Why it exists: the project's eslint.config.js turns on typescript-eslint's
// *type-checked* configs with `projectService: true`. That boots a full
// TypeScript program on every invocation (~10 s for a single file) — far too
// slow for a hook that fires on every edit. This config drops the type-aware
// layer, so the hook runs in ~1.5 s and still catches syntax errors, formatting
// (prettier), unused vars, and react-hooks mistakes.
//
// Type-aware rules (no-floating-promises, no-unsafe-*, etc.) are NOT lost — they
// still run in `npm run lint` locally and in CI (the commit-gate layer).

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import eslintPluginAstro from "eslint-plugin-astro";
import eslintPluginReactHooks from "eslint-plugin-react-hooks";

/* eslint-disable @typescript-eslint/no-deprecated -- tseslint.config() parity with the main config */
export default tseslint.config(
  {
    ignores: ["dist/**", ".astro/**", "node_modules/**", ".claude/**"],
  },
  {
    // NON-type-checked recommended set — no parserOptions.project / projectService.
    extends: [eslint.configs.recommended, tseslint.configs.recommended],
    rules: {
      "no-console": "warn",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: { "react-hooks": eslintPluginReactHooks },
    rules: { ...eslintPluginReactHooks.configs.recommended.rules },
  },
  eslintPluginAstro.configs["flat/recommended"],
  {
    files: ["**/*.astro"],
    rules: {
      "astro/no-set-html-directive": "error",
    },
  },
  eslintPluginPrettier,
);
