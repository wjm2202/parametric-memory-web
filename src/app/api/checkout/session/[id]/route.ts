/**
 * GET /api/checkout/session/:id
 *
 * Thin BFF proxy to compute's GET /api/v1/checkout/session/:id. The
 * `/billing/return` page calls this on mount and during the provisioning
 * poll to decide between rendering success and remounting Embedded
 * Checkout for a retry.
 *
 * Sprint 2026-05-18 D4.
 *
 * Auth: forwards the session cookie as a Bearer token; compute's policy
 * for `checkout.sessionRetrieve` enforces `session: 'required'`.
 *
 * CSRF: GET is non-mutating; `verifyCsrfOrigin` is intentionally not called
 * (the helper itself returns null for safe methods). See src/lib/csrf.ts.
 *
 * The compute handler returns 404 on either "Stripe session not found" OR
 * "ownership mismatch" with the SAME body shape — this BFF forwards both
 * verbatim so the no-leak posture is preserved end-to-end.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { computeProxy, authHeaders } from "@/lib/compute-proxy";

const SESSION_COOKIE = "mmpm_session";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "invalid_session_id" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { response } = await computeProxy(`api/v1/checkout/session/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: authHeaders(sessionToken),
    label: "checkout/session-retrieve",
  });

  return response;
}
