/**
 * useHasHydrated — returns `false` during SSR and the first client render,
 * `true` once React has committed the hydration pass.
 *
 * Why this hook exists
 * ────────────────────
 * Several components in this codebase render a locale-stable placeholder on
 * the server (ISO calendar date, en-US-grouped number) and want to upgrade
 * to a `navigator.language`-aware string after hydration completes. The
 * pre-React-Compiler implementation did this with:
 *
 *   const [text, setText] = useState(placeholder);
 *   useEffect(() => { setText(localised()); }, [...]);
 *
 * That pattern is flagged by the React Compiler readiness rules
 * (set-state-in-effect) because the "thing the effect computes" can be
 * derived from props + a hydration signal instead — no state, no effect.
 *
 * The canonical replacement, documented at
 * https://react.dev/reference/react/useSyncExternalStore#using-with-server-rendering,
 * is to subscribe to an external "are we hydrated" store. React reads the
 * server snapshot during SSR and the first client render (both return
 * `false`), then schedules a single post-hydration re-render where the
 * client snapshot (`true`) takes over. After that the subscribe callback is
 * a no-op because the value never changes again for the lifetime of the
 * page.
 *
 * Usage
 * ─────
 *   const hasHydrated = useHasHydrated();
 *   const text = hasHydrated ? localised() : placeholder;
 *
 * SSR contract: returns `false` server-side and on the first client paint,
 * so any consumer that derives output from `hasHydrated ? a : b` emits
 * byte-identical markup in both environments — no React error #418.
 *
 * React-Compiler note: the three callbacks (`subscribe`, `getSnapshot`,
 * `getServerSnapshot`) are defined at module scope so their identity is
 * stable across renders — the Compiler does not memoise them again and
 * React's internal `useSyncExternalStore` does not tear down its
 * subscription on every render.
 */
import { useSyncExternalStore } from "react";

// No-op subscribe: hydration is a one-way event. `useSyncExternalStore`
// requires the function exist, but it never needs to be called — the
// snapshot difference between server (`false`) and client (`true`) is what
// drives the post-hydration re-render, not a notification.
function subscribe(): () => void {
  return () => {};
}

function getSnapshot(): boolean {
  return true;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * @returns `false` during SSR and on the first client render; `true`
 *   thereafter. Safe to call from any client component.
 */
export function useHasHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
