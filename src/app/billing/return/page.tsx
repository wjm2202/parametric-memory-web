/**
 * /billing/return
 *
 * Sprint 2026-05-18 D4 — landing page after Stripe's Embedded Checkout
 * completes. Stripe substitutes `{CHECKOUT_SESSION_ID}` in the
 * `return_url` we set at session-create time, then redirects the parent
 * frame here with `?session_id=cs_test_…`.
 *
 * The page is rendered as a thin server-component wrapper; all of the
 * actual logic (session retrieve, URL hygiene, substrate polling, retry
 * remount) lives in the client component so we can use hooks.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import BillingReturnClient from "./BillingReturnClient";

export const metadata: Metadata = {
  title: "Completing your subscription",
  robots: { index: false, follow: false },
  // Sprint D4 + P1-3: session_id is in the URL. The global Referrer-Policy
  // already trims off path+query for cross-origin requests, but third-party
  // scripts that load on this page during the brief render would receive
  // the full URL if the policy weren't tightened. `no-referrer` blocks any
  // referer header on outbound requests originating from this page.
  // (Set as `referrer` in metadata — Next.js maps this to the <meta> tag
  // AND the HTTP response header when rendered via the App Router.)
  referrer: "no-referrer",
};

export default function BillingReturnPage() {
  // Next.js 15 requires components that use useSearchParams() to be wrapped
  // in a Suspense boundary so the static-prerender pass can bail out
  // cleanly. The fallback matches the client's loading view to avoid a
  // flash of empty page during the brief client-render handoff.
  return (
    <Suspense fallback={null}>
      <BillingReturnClient />
    </Suspense>
  );
}
