"use client";

import { useHasHydrated } from "@/hooks/useHasHydrated";

export interface FormattedNumberProps {
  /** The numeric value to render. */
  value: number;
}

/**
 * Renders a number with the visitor's browser-locale grouping separator.
 *
 * Why this component exists
 * ─────────────────────────
 * The same locale mismatch hazard that affects dates also affects numeric
 * grouping separators. A bare `value.toLocaleString()` inside JSX renders
 * "1,234" on the server (Node defaults to en-US) and "1.234" in a
 * browser using de-DE, "1 234" in fr-FR, etc. React's hydration check
 * sees a text-node mismatch and throws minified error #418, throwing
 * away the server-rendered subtree.
 *
 * Strategy — SSR with en-US, upgrade post-hydration
 * ─────────────────────────────────────────────────
 *   1. The SSR pass and the first client render both see
 *      `useHasHydrated() === false` and emit the fixed-`"en-US"` form —
 *      identical bytes server- and client-side.
 *   2. After hydration commits, `useHasHydrated()` flips to `true` via
 *      `useSyncExternalStore`, React schedules a re-render, and the
 *      derived text becomes `value.toLocaleString(undefined)` —
 *      deferring to `navigator.language`. Visitors in non-Latin locales
 *      see grouping separators that match their conventions, with no
 *      hydration warning.
 *
 * For visitors in any English locale (en-US, en-GB, en-NZ, en-AU, …) the
 * post-hydrate text is identical to the SSR placeholder, so there is no
 * visible flash. Only non-English locales see a brief comma → period
 * (or space) swap, typically under one frame.
 *
 * React-Compiler note
 * ───────────────────
 * The previous implementation used `useState(en-US format)` plus a
 * `useEffect` that called `setText(locale-aware format)`. That tripped
 * the react-compiler readiness rule against set-state-in-effect — the
 * effect did nothing the render function couldn't do given a stable
 * "have we hydrated" signal. `useHasHydrated()` provides that signal as
 * a `useSyncExternalStore` snapshot, so the rendered text is now pure
 * derived data: no state, no effect.
 *
 * @example
 *   <FormattedNumber value={substrateAtomCount} />
 *   // SSR / en-* clients: "1,234,567"
 *   // de-DE post-hydrate: "1.234.567"
 *   // fr-FR post-hydrate: "1 234 567"
 */
export function FormattedNumber({ value }: FormattedNumberProps) {
  // RC-09 (react-compiler-readiness, 2026-05-27): derived from a stable
  // hydration signal instead of useState + setState-in-effect. SSR and
  // first client paint both see hasHydrated=false → en-US bytes, then
  // post-hydration upgrades to `navigator.language` grouping.
  const hasHydrated = useHasHydrated();
  const text = hasHydrated ? value.toLocaleString(undefined) : value.toLocaleString("en-US");

  return <>{text}</>;
}
