/**
 * POST /api/my-substrate/reactivate
 *
 * Proxies to compute's session-authenticated reactivate endpoint.
 * Compute calls Stripe to clear cancel_at_period_end, which triggers
 * customer.subscription.updated with cancel_at_period_end=false.
 * The webhook clears substrates.cancel_at so the dashboard removes the
 * "Cancels on [date]" pill and re-shows the Cancel button.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { computeProxy, authHeaders } from "@/lib/compute-proxy";

const SESSION_COOKIE = "mmpm_session";

export async function POST(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { response } = await computeProxy("api/v1/my-substrate/reactivate", {
    method: "POST",
    headers: authHeaders(sessionToken),
    label: "my-substrate/reactivate",
  });

  return response;
}
