import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { computeProxy, authHeaders } from "@/lib/compute-proxy";

const SESSION_COOKIE = "mmpm_session";

/**
 * POST /api/checkout
 *
 * Proxies to mmpm-compute POST /api/checkout.
 * Forwards the session cookie as a Bearer token so compute can identify the user.
 *
 * Body:  { tier: string }
 * Returns: { sessionUrl: string, tier: string, amountCents: number }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* empty body */
  }

  const { response } = await computeProxy("api/checkout", {
    method: "POST",
    headers: authHeaders(sessionToken),
    body,
    label: "checkout",
  });

  return response;
}
