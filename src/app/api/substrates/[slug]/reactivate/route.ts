/**
 * POST /api/substrates/:slug/reactivate
 *
 * Sprint 2026-05-18 E2. Slug-scoped BFF that proxies to compute's
 *   POST /api/v1/substrates/:slug/reactivate (createReactivateHandler).
 *
 * Inverse of /api/substrates/:slug/cancel: clears `cancel_at_period_end`
 * on the Stripe subscription via stripe.subscriptions.update with an
 * idempotency key (P0-7 — `reactivate:${subId}:${YYYY-MM-DD}`). The
 * webhook fan-out clears `substrates.cancel_at` and the dashboard banner
 * disappears on the next poll.
 *
 * CSRF: mutating route → Origin check via verifyCsrfOrigin (P0-5).
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { computeProxy, authHeaders } from "@/lib/compute-proxy";
import { verifyCsrfOrigin } from "@/lib/csrf";

const SESSION_COOKIE = "mmpm_session";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const csrfError = verifyCsrfOrigin(request);
  if (csrfError) return csrfError;

  const { slug } = await params;
  if (!slug) {
    return NextResponse.json({ error: "slug_required" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { response } = await computeProxy(
    `api/v1/substrates/${encodeURIComponent(slug)}/reactivate`,
    {
      method: "POST",
      headers: authHeaders(sessionToken),
      label: "substrates/reactivate",
    },
  );

  return response;
}
