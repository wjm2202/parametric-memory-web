/**
 * ESLint flat config for the parametric-memory.dev website.
 *
 * Migrated 2026-05-27 (sprint nextjs-16-upgrade) from the `@eslint/eslintrc`
 * `FlatCompat` shim to direct flat-config imports. `eslint-config-next@16`
 * ships native flat configs at the subpath exports below, so the legacy
 * compat wrapper is no longer needed.
 *
 * The two presets we extend match the previous compat.extends() arguments:
 *
 *   - `eslint-config-next/core-web-vitals` — Next's recommended rule set
 *     including the React + a11y + import + JSX rules that catch Core Web
 *     Vitals regressions (image sizing, anchor usage, etc.).
 *
 *   - `eslint-config-next/typescript` — typescript-eslint recommended rules
 *     with the Next-flavoured tweaks (no-unused-vars / no-unused-expressions
 *     downgraded to warnings to match Next's convention).
 *
 * ── React Compiler readiness rule overrides ──────────────────────────────
 *
 * `eslint-config-next@16` bundles `eslint-plugin-react-hooks@7`, which adds
 * a suite of React Compiler readiness rules:
 *
 *   - react-hooks/set-state-in-effect
 *   - react-hooks/static-components
 *   - react-hooks/purity
 *   - react-hooks/preserve-manual-memoization
 *   - react-hooks/immutability
 *
 * These rules flag patterns that work correctly today but won't be ideal
 * once React Compiler ships. They're forward-looking quality signals, not
 * bug detectors. The Next.js team's own documentation recommends running
 * them as `warn` during a v15 → v16 migration so the upgrade isn't blocked
 * by pre-existing patterns. A dedicated "React Compiler readiness" sprint
 * will progressively address the warnings.
 *
 * One rule is fully DISABLED in two directories: `react-hooks/immutability`
 * under `src/components/visualise/**` and `src/components/knowledge/**`.
 * The Three.js / React Three Fiber idiom of "allocate a Float32Array once
 * via useMemo, mutate it every frame inside useFrame to upload to the GPU"
 * is foundational to R3F — the new rule treats this as forbidden, but it's
 * literally how every R3F application is written. This is a rule-versus-
 * library-convention conflict; the right fix is to scope the rule away
 * from the affected files rather than rewrite R3F's data flow.
 *
 * See docs/SPRINT-NEXTJS-16-UPGRADE-2026-05-27.md (row M5).
 */

import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,

  /* ─── React Compiler readiness — warn, don't error (global) ───────────── */
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/immutability": "warn",
    },
  },

  /* ─── R3F-mutable-buffer pattern — disable immutability rule here ─────── */
  {
    files: [
      "src/components/visualise/**/*.{ts,tsx}",
      "src/components/knowledge/**/*.{ts,tsx}",
    ],
    rules: {
      // `useFrame(() => { positions[i] = ... })` is canonical R3F.
      // The buffer is created once and mutated each frame for GPU upload.
      // No alternative; this is the idiom.
      "react-hooks/immutability": "off",
    },
  },

];

export default eslintConfig;
