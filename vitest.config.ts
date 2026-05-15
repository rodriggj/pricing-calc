/**
 * Vitest configuration.
 *
 * Picks up unit tests co-located with source under `src/**` and harness fixtures
 * under `fixtures/**`. The contract harness itself is invoked separately via
 * `pnpm contract:harness` (see Task 13); it is not run by Vitest.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Disable PostCSS processing entirely — the contract layer is pure TS and
  // Tailwind v4's string-form plugin entry trips Vite's PostCSS loader.
  css: {
    postcss: {},
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true,
    // The contract layer is pure TS; PostCSS / Tailwind has no role at test
    // time. Skipping CSS processing avoids loading the project's PostCSS
    // config inside Vitest's bundled Vite (which trips on the Tailwind v4
    // string-form plugin entry).
    css: false,
  },
});
