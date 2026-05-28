"use client";

import { useMemo } from "react";
import { useHasHydrated } from "@/hooks/useHasHydrated";

export interface FormattedDateProps {
  /** ISO 8601 string, epoch milliseconds, or Date instance. */
  iso: string | number | Date;
  /**
   * Display granularity. "date" → "22 May 2026". "datetime" → "22 May 2026, 6:00 pm".
   * Defaults to "date".
   */
  mode?: "date" | "datetime";
}

const FORMATS: Record<NonNullable<FormattedDateProps["mode"]>, Intl.DateTimeFormatOptions> = {
  date: { year: "numeric", month: "short", day: "numeric" },
  datetime: {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
};

/**
 * Renders an ISO 8601 date in the visitor's browser locale, hydration-safe.
 *
 * Why this component exists
 * ─────────────────────────
 * Calling `Date.prototype.toLocaleDateString()` directly inside JSX produces
 * different strings on the server (Node.js, defaults to en-US) and the
 * client (browser's `navigator.language`). React detects the text-node
 * mismatch during hydration, throws minified error #418
 * (https://react.dev/errors/418?args[]=text&args[]=), discards the
 * server-rendered subtree, and re-renders client-side. SSR is wasted and
 * the user sees a flash. For our specific case it surfaced after Google
 * OAuth login lands the user on /admin which renders billing renewal and
 * substrate cancel dates — both with no locale arg.
 *
 * Strategy — SSR an ISO calendar date, upgrade post-hydration
 * ───────────────────────────────────────────────────────────
 *   1. Server-side render and the FIRST client render both produce the
 *      same locale-independent placeholder: "2026-05-22" (ISO 8601
 *      calendar date, sliced from `Date.prototype.toISOString()`). Both
 *      runtimes emit identical bytes for this — Node's `toISOString`
 *      and the browser's are byte-stable. `useHasHydrated()` returns
 *      `false` on both runs, so the placeholder branch is taken.
 *   2. After hydration commits, `useHasHydrated()` flips to `true` via
 *      `useSyncExternalStore`, React schedules a re-render, and the
 *      derived text becomes the visitor's locale-formatted string via
 *      `toLocaleDateString(undefined, ...)`. Passing `undefined` defers
 *      to `navigator.language`, so a German visitor sees "22. Mai 2026",
 *      a French visitor sees "22 mai 2026", a NZ visitor sees
 *      "22 May 2026" — all without a single hydration warning.
 *   3. The brief flash from "2026-05-22" → "22 May 2026" is typically
 *      under one frame on modern hardware and is the price of correct
 *      worldwide locale support without per-user server-side locale
 *      negotiation. If we ever want to eliminate the flash, the next
 *      step is to read `Accept-Language` server-side and pass the
 *      negotiated locale to this component as a prop — same shape, no
 *      caller changes needed.
 *
 * React-Compiler note
 * ───────────────────
 * The previous implementation used `useState(placeholder)` plus a
 * `useEffect` that called `setText(localised)`. That tripped the
 * react-compiler readiness rule against set-state-in-effect — the
 * effect did nothing the render function couldn't do, given a stable
 * "have we hydrated" signal. `useHasHydrated()` provides that signal as
 * a `useSyncExternalStore` snapshot, so `text` is now pure derived
 * data: no state, no effect.
 *
 * Semantic markup
 * ───────────────
 * The wrapping `<time dateTime="…">` element carries the full ISO 8601
 * timestamp in its `dateTime` attribute. Screen readers, search crawlers,
 * and any RDF/JSON-LD parser see the canonical timestamp regardless of
 * what the visible text reads. This is recommended HTML for any rendered
 * date or time.
 *
 * @example
 *   <FormattedDate iso={billingStatus.renewalDate} />
 *   // SSR: <time dateTime="2026-05-22T06:00:00.000Z">2026-05-22</time>
 *   // post-hydrate (NZ): <time dateTime="…">22 May 2026</time>
 *   // post-hydrate (DE): <time dateTime="…">22. Mai 2026</time>
 */
export function FormattedDate({ iso, mode = "date" }: FormattedDateProps) {
  const date = useMemo(() => new Date(iso), [iso]);
  const isoTimestamp = useMemo(() => date.toISOString(), [date]);
  const isoCalendarDate = useMemo(() => isoTimestamp.slice(0, 10), [isoTimestamp]);

  // RC-08 (react-compiler-readiness, 2026-05-27): derived from a stable
  // hydration signal instead of useState + setState-in-effect. SSR and
  // first client paint both see hasHydrated=false → identical bytes,
  // then post-hydration `text` upgrades to the visitor's locale.
  const hasHydrated = useHasHydrated();
  const text = hasHydrated ? date.toLocaleDateString(undefined, FORMATS[mode]) : isoCalendarDate;

  return <time dateTime={isoTimestamp}>{text}</time>;
}
