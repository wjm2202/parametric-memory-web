/**
 * POST /api/substrates/:slug/cancel
 *
 * Sprint 2026-05-18 E1. Slug-scoped BFF that proxies to compute's
 *   POST /api/v1/substrates/:slug/cancel (createCancelHandler in
 *   src/api/substrates/routes.ts).
 *
 * Distinct from the legacy `/api/my-substrate/cancel` BFF which uses the
 * implicit-substrate resolver — fine for single-substrate accounts but
 * incorrect for multi-substrate accounts where the user must be able to
 * pick which substrate to cancel.
 *
 * Compute call sets `cancel_at_period_end: true` with an idempotency key
 * (P0-7 — `cancel:${subId}:${YYYY-MM-DD}`). The user keeps full access
 * until period end, then `customer.subscription.deleted` fires and the
 * webhook immediately marks the substrate `deprovisioned` (no read-only
 * grace tail per D1).
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

  // R10 — forward the cancellation mode. 'period_end' (default, unchanged
  // behaviour) or 'refund_now' (stop now + pro-rata refund). Tolerate an empty
  // body → period_end, so older callers keep working.
  let mode: "period_end" | "refund_now" = "period_end";
  try {
    const parsed = await request.json();
    if (parsed?.mode === "refund_now") mode = "refund_now";
  } catch {
    // no/invalid body → period_end
  }

  const { response } = await computeProxy(`api/v1/substrates/${encodeURIComponent(slug)}/cancel`, {
    method: "POST",
    headers: authHeaders(sessionToken),
    body: { mode },
    label: "substrates/cancel",
    inbound: request,
  });

  return response;
}
