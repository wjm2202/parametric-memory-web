/**
 * POST /api/billing/upgrade
 *
 * Proxies to compute's session-authenticated
 *   POST /api/v1/billing/upgrade
 *
 * Body (forwarded verbatim):
 *   { substrateSlug: string, targetTier: string, idempotencyKey?: string }
 *
 * Response: { checkoutUrl: string } — the Stripe Checkout URL the admin
 * page redirects to.
 *
 * The BFF has no opinion about body shape — compute validates and returns
 * 400 with a structured error if anything is missing. This keeps the
 * contract single-sourced at compute.
 *
 * @see PLAN-ADMIN-UPGRADE-FLOW.md §5.1
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
    // Empty or malformed body → forward an empty object. Compute will 400
    // with a structured error, which the proxy forwards untouched.
  }

  const { response } = await computeProxy("api/v1/billing/upgrade", {
    method: "POST",
    body,
    headers: authHeaders(sessionToken),
    label: "billing/upgrade",
  });

  return response;
}
