"use client";

import { useEffect, useState } from "react";

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
 * Strategy — SSR with en-US, upgrade post-mount
 * ─────────────────────────────────────────────
 *   1. Initial useState value formats with a fixed `"en-US"` locale —
 *      stable, identical on server and first client render.
 *   2. After hydration commits, `useEffect` re-runs with `undefined`
 *      locale, deferring to `navigator.language`. Visitors in non-Latin
 *      locales see grouping separators that match their conventions,
 *      with no hydration warning.
 *
 * For visitors in any English locale (en-US, en-GB, en-NZ, en-AU, …) the
 * post-mount text is identical to the SSR placeholder, so there is no
 * visible flash. Only non-English locales see a brief comma → period
 * (or space) swap, typically under one frame.
 *
 * @example
 *   <FormattedNumber value={substrateAtomCount} />
 *   // SSR / en-* clients: "1,234,567"
 *   // de-DE post-hydrate: "1.234.567"
 *   // fr-FR post-hydrate: "1 234 567"
 */
export function FormattedNumber({ value }: FormattedNumberProps) {
  const [text, setText] = useState<string>(() => value.toLocaleString("en-US"));

  useEffect(() => {
    setText(value.toLocaleString(undefined));
  }, [value]);

  return <>{text}</>;
}
