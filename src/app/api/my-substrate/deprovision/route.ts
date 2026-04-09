/**
 * POST /api/my-substrate/deprovision
 *
 * Proxies to compute's session-authenticated deprovision endpoint.
 * Compute marks the substrate deprovisioned and queues a soft-destroy job
 * (containers down, data retained for 30 days).
 *
 * Only allowed for free-tier substrates with no active Stripe subscription.
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

  const { response } = await computeProxy("api/v1/my-substrate/deprovision", {
    method: "POST",
    headers: authHeaders(sessionToken),
    label: "my-substrate/deprovision",
  });

  return response;
}
