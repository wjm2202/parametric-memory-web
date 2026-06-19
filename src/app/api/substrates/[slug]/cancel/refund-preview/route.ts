/**
 * GET /api/substrates/:slug/cancel/refund-preview  (R10)
 *
 * Slug-scoped BFF proxying to compute's read-only
 *   GET /api/v1/substrates/:slug/cancel/refund-preview
 * (createCancelRefundPreviewHandler). Returns the exact pro-rata refund a
 * `refund_now` cancellation would issue, so the cancel modal can show the
 * figure before the customer confirms. Read-only → no CSRF Origin check
 * (matches the other GET reads).
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { computeProxy, authHeaders } from "@/lib/compute-proxy";

const SESSION_COOKIE = "mmpm_session";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;
  if (!slug) {
    return NextResponse.json({ error: "slug_required" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { response } = await computeProxy(
    `api/v1/substrates/${encodeURIComponent(slug)}/cancel/refund-preview`,
    {
      method: "GET",
      headers: authHeaders(sessionToken),
      label: "substrates/cancel-refund-preview",
      inbound: request,
    },
  );

  return response;
}
