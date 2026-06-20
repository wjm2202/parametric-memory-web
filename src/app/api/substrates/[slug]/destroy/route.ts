/**
 * POST /api/substrates/:slug/destroy   (D1/D2 — unified Destroy & Unsubscribe)
 *
 * Slug-scoped BFF that proxies to compute's
 *   POST /api/v1/substrates/:slug/destroy (createDestroyHandler).
 *
 * One atomic action that keeps Stripe and the substrate in agreement, replacing
 * the legacy /cancel + /deprovision pair:
 *   - timing: 'now'        → refund unused portion + deprovision + unsubscribe.
 *   - timing: 'period_end' → stop renewal, keep access, auto-destroy at period end.
 *
 * The compute response (including 409 refund_requires_manual_review / 500) is
 * passed through verbatim so the UI can surface it (NO SILENT BLOCK).
 *
 * CSRF: mutating route → Origin check via verifyCsrfOrigin (P0-5).
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { computeProxy, authHeaders } from "@/lib/compute-proxy";
import { verifyCsrfOrigin } from "@/lib/csrf";

const SESSION_COOKIE = "mmpm_session";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const csrfError = verifyCsrfOrigin(request);
  if (csrfError) return csrfError;

  const { slug } = await params;
  if (!slug) {
    return NextResponse.json({ error: "slug_required" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Require an explicit, valid timing — no silent default for a destructive op.
  let timing: "now" | "period_end" | null = null;
  try {
    const parsed = await request.json();
    if (parsed?.timing === "now" || parsed?.timing === "period_end") timing = parsed.timing;
  } catch {
    // fall through → 400
  }
  if (!timing) {
    return NextResponse.json({ error: "invalid_timing" }, { status: 400 });
  }

  const { response } = await computeProxy(`api/v1/substrates/${encodeURIComponent(slug)}/destroy`, {
    method: "POST",
    headers: authHeaders(sessionToken),
    body: { timing },
    label: "substrates/destroy",
    inbound: request,
  });

  return response;
}
