import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const COMPUTE_URL = process.env.MMPM_COMPUTE_URL ?? "http://localhost:3100";
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

  try {
    const res = await fetch(`${COMPUTE_URL}/api/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const responseBody = await res.text();
    return new NextResponse(responseBody, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[checkout-proxy] POST /api/checkout failed:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
