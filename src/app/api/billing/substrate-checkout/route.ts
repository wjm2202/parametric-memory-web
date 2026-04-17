/**
 * POST /api/billing/substrate-checkout
 *
 * Creates a Stripe checkout session for a new substrate subscription.
 * Proxies to compute's POST /api/v1/billing/substrate-checkout.
 *
 * Body:  { accountId: string, tier: string }
 * Returns: { sessionId, sessionUrl, tier, amountCents, limits }
 *
 * @see docs/api-contracts-multi-substrate.md §5
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
    return NextResponse.json(
      { error: "invalid_body", message: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const { response } = await computeProxy("api/v1/billing/substrate-checkout", {
    method: "POST",
    headers: authHeaders(sessionToken),
    body,
    label: "billing/substrate-checkout",
  });

  return response;
}
