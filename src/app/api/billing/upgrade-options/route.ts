/**
 * GET /api/billing/upgrade-options
 *
 * Proxies to compute's session-authenticated
 *   GET /api/v1/billing/upgrade-options?substrateSlug=<slug>
 *
 * Returns the list of tiers the caller can move to from their current tier
 * on the given substrate, along with Stripe proration previews per candidate.
 * Only strictly higher tiers are returned in Phase 1 — downgrades are deferred.
 *
 * The `substrateSlug` query param is required — compute returns 400 without it.
 * This proxy forwards the query string transparently.
 *
 * @see PLAN-ADMIN-UPGRADE-FLOW.md §5.1
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { computeProxy, authHeaders } from "@/lib/compute-proxy";

const SESSION_COOKIE = "mmpm_session";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Forward substrateSlug verbatim. If missing, let compute reply 400 — the
  // BFF has no opinion about the shape beyond authentication.
  const substrateSlug = request.nextUrl.searchParams.get("substrateSlug");
  const qs = substrateSlug ? `?substrateSlug=${encodeURIComponent(substrateSlug)}` : "";

  const { response } = await computeProxy(`api/v1/billing/upgrade-options${qs}`, {
    headers: authHeaders(sessionToken),
    label: "billing/upgrade-options",
  });

  return response;
}
