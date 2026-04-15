/**
 * GET /api/billing/status
 *
 * Proxies to compute's session-authenticated GET /api/v1/billing/status.
 * Returns the unified billing snapshot for the dashboard billing widget.
 *
 * Supports optional `?slug=<substrate_slug>` query parameter to scope
 * billing status to a specific substrate (multi-substrate support).
 *
 * @see docs/api-contracts-multi-substrate.md §5
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

  // Forward slug query param for substrate-scoped billing status
  const slug = request.nextUrl.searchParams.get("slug");
  const path = slug
    ? `api/v1/billing/status?slug=${encodeURIComponent(slug)}`
    : "api/v1/billing/status";

  const { response } = await computeProxy(path, {
    headers: authHeaders(sessionToken),
    label: "billing/status",
  });

  return response;
}
