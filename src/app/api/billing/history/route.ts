/**
 * GET /api/billing/history
 *
 * Proxies to compute's session-authenticated GET /api/v1/billing/history.
 * Returns the account-level billing history (Stripe-authoritative invoices with
 * their line-item breakdown, plus refund annotations) for the "Billing" tab of
 * the account Recent-activity page.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { computeProxy, authHeaders } from "@/lib/compute-proxy";

const SESSION_COOKIE = "mmpm_session";

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { response } = await computeProxy("api/v1/billing/history", {
    headers: authHeaders(sessionToken),
    label: "billing/history",
  });

  return response;
}
