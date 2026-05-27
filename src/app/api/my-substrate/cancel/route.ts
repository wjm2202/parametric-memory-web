/**
 * POST /api/my-substrate/cancel
 *
 * Proxies to compute's session-authenticated cancel endpoint.
 * Compute calls stripe.subscriptions.update(cancel_at_period_end: true) —
 * the user keeps full access until period end, then the webhook deprovisions
 * immediately (no read-only grace tail).
 *
 * CSRF: state-mutating proxy on a session-authenticated path. Origin-checked
 * via verifyCsrfOrigin before forwarding (P0-5, sprint 2026-05-18).
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { computeProxy, authHeaders } from "@/lib/compute-proxy";
import { verifyCsrfOrigin } from "@/lib/csrf";

const SESSION_COOKIE = "mmpm_session";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfError = verifyCsrfOrigin(request);
  if (csrfError) return csrfError;

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { response } = await computeProxy("api/v1/my-substrate/cancel", {
    method: "POST",
    headers: authHeaders(sessionToken),
    label: "my-substrate/cancel",
  });

  return response;
}
