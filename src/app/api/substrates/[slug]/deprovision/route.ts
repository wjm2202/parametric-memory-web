/**
 * POST /api/substrates/:slug/deprovision
 *
 * Slug-scoped BFF proxying to compute's POST /api/v1/substrates/:slug/deprovision
 * (SM-7 createDeprovisionHandler). This DEDICATED route exists so the
 * destructive deprovision gets the same Origin/CSRF check as cancel — the
 * `[...path]` catch-all proxy does NOT verify Origin, and a static segment
 * takes precedence over the catch-all, so this closes that gap (SM-DEP).
 *
 * Body: { cancelActiveSubscription?: boolean }. When true, compute's paid-tier
 * 403 guard is bypassed and the active subscription is cancelled immediately —
 * the remaining paid period is forfeited (no refund) — as part of the
 * deprovision. The website only sends this after the type-"destroy"
 * confirmation in DeprovisionModal.
 *
 * CSRF: mutating route → Origin check via verifyCsrfOrigin.
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

  // Forward only the one flag we understand; default false. Tolerate an empty
  // or non-JSON body (a free-tier deprovision may send none).
  let cancelActiveSubscription = false;
  try {
    const parsed = await request.json();
    cancelActiveSubscription = parsed?.cancelActiveSubscription === true;
  } catch {
    // no/invalid body → plain deprovision (compute's 403 guard still applies)
  }

  const { response } = await computeProxy(
    `api/v1/substrates/${encodeURIComponent(slug)}/deprovision`,
    {
      method: "POST",
      headers: authHeaders(sessionToken),
      body: { cancelActiveSubscription },
      label: "substrates/deprovision",
      inbound: request,
    },
  );

  return response;
}
