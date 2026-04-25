"use client";

import { useEffect, useMemo, useState } from "react";

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
 * Strategy — SSR an ISO calendar date, upgrade post-mount
 * ───────────────────────────────────────────────────────
 *   1. Server-side render and the FIRST client render both produce the
 *      same locale-independent placeholder: "2026-05-22" (ISO 8601
 *      calendar date, sliced from `Date.prototype.toISOString()`). Both
 *      runtimes emit identical bytes for this — Node's `toISOString`
 *      and the browser's are byte-stable.
 *   2. After hydration commits, the `useEffect` below fires and replaces
 *      the placeholder with the visitor's locale-formatted string via
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

  // First render (server + initial client) emits the same calendar date.
  // useEffect upgrades to the visitor's locale after hydration commits.
  const [text, setText] = useState<string>(isoCalendarDate);

  useEffect(() => {
    setText(date.toLocaleDateString(undefined, FORMATS[mode]));
  }, [date, mode]);

  return <time dateTime={isoTimestamp}>{text}</time>;
}
