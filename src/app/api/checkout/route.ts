import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { computeProxy, authHeaders } from "@/lib/compute-proxy";
import { verifyCsrfOrigin } from "@/lib/csrf";

const SESSION_COOKIE = "mmpm_session";

/**
 * POST /api/checkout
 *
 * Proxies to mmpm-compute POST /api/checkout.
 * Forwards the session cookie as a Bearer token so compute can identify the user.
 *
 * After Phase D this returns { clientSecret } for Embedded Checkout instead of
 * { sessionUrl } — same body shape upstream, only the response field changes.
 *
 * Body:
 *   { tier: string, trial?: boolean, mode?: "embedded" | "hosted" }
 *
 * Returns (mode-branched; sprint 2026-05-29 adblock resilience):
 *   - embedded (default): { clientSecret: string, tier: string, amountCents: number }
 *   - hosted:             { url: string,          tier: string, amountCents: number }
 *
 * The body is forwarded verbatim to compute via the compute-proxy utility, so
 * `mode` (and any future field) flows through without any explicit handling
 * at this layer — keeps the BFF and compute decoupled. The frontend branches
 * on which field is present in the response.
 *
 * CSRF: state-mutating proxy on session-authenticated path. Origin-checked
 * via verifyCsrfOrigin (P0-5, sprint 2026-05-18).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfError = verifyCsrfOrigin(request);
  if (csrfError) return csrfError;

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
