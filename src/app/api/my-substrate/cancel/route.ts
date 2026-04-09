/**
 * POST /api/my-substrate/cancel
 *
 * Proxies to compute's session-authenticated cancel endpoint.
 * Compute calls Stripe to cancel the subscription, which triggers the
 * webhook to set the substrate to read_only with a 30-day grace period.
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

  const { response } = await computeProxy("api/v1/my-substrate/cancel", {
    method: "POST",
    headers: authHeaders(sessionToken),
    label: "my-substrate/cancel",
  });

  return response;
}
