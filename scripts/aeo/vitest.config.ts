/**
 * scripts/aeo/vitest.config.ts
 *
 * STANDALONE vitest config for the AEO audit's unit tests.
 *
 * This exists so the AEO tests can be run on demand (`npm run test:aeo`)
 * WITHOUT ever being collected by the main suite. The root vitest.config.ts
 * only includes `src/**`, and this folder is excluded from tsconfig, so nothing
 * in CI/CD (`npm test`, `guard:all`, `preflight`) touches the audit.
 *
 * Pure string logic — node environment, no jsdom, no setup files.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/aeo/**/*.test.ts"],
    globals: false,
  },
});
