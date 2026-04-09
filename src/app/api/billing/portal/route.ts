/**
 * POST /api/billing/portal
 *
 * Proxies to compute's session-authenticated POST /api/v1/billing/portal.
 * Returns { portalUrl } — the frontend navigates to this URL directly.
 *
 * 422 if the account has no Stripe customer (never completed checkout).
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { computeProxy, authHeaders } from "@/lib/compute-proxy";

const SESSION_COOKIE = "mmpm_session";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* empty body is fine — no required fields */
  }

  const { response } = await computeProxy("api/v1/billing/portal", {
    method: "POST",
    body,
    headers: authHeaders(sessionToken),
    label: "billing/portal",
  });

  return response;
}
