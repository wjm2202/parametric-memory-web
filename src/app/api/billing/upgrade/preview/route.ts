/**
 * GET /api/billing/upgrade/preview
 *
 * Proxies to compute's session-authenticated
 *   GET /api/v1/substrates/:slug/upgrade/preview?tier=<target>
 *
 * Query params (both required):
 *   substrateSlug  — slug of the substrate being upgraded
 *   tier           — target tier to preview proration for
 *
 * Returns compute's UpgradePreviewResponse verbatim:
 *   {
 *     currentTier, targetTier, transitionType,
 *     currentPriceCents, newPriceCents,
 *     prorationCents,        ← immediate charge (0 if no proration due)
 *     currency,
 *     nextInvoiceDate,       ← ISO string (period_end from Stripe)
 *     nextInvoiceTotalCents
 *   }
 *
 * Error cases forwarded from compute:
 *   400 — invalid tier or account has no active subscription
 *   404 — substrate not found
 *   500 — Stripe preview call failed (preview_failed)
 *   503 — Stripe not configured
 *
 * This endpoint is called when ConfirmUpgradeDialog opens so the user
 * sees real proration figures BEFORE confirming any payment. The upgrade
 * button is blocked until this resolves — "for any payment journeys we
 * MUST inform the user." (2026-06-12 requirement)
 *
 * Note: the upgrade-options list endpoint (/api/billing/upgrade-options)
 * stubs estimatedProrationCents: 0 rather than joining previews into the
 * list, because previewing every available tier on sheet-open would make
 * N Stripe API calls. We preview only the selected tier, lazily, here.
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

  const { searchParams } = request.nextUrl;
  const substrateSlug = searchParams.get("substrateSlug");
  const tier = searchParams.get("tier");

  if (!substrateSlug) {
    return NextResponse.json({ error: "substrateSlug_required" }, { status: 400 });
  }
  if (!tier) {
    return NextResponse.json({ error: "tier_required" }, { status: 400 });
  }

  // Forward compute's response verbatim — the UpgradePreviewResponse shape is
  // already dashboard-friendly (camelCase, cents, ISO dates). No transform needed.
  const { response } = await computeProxy(
    `api/v1/substrates/${encodeURIComponent(substrateSlug)}/upgrade/preview?tier=${encodeURIComponent(tier)}`,
    {
      headers: authHeaders(sessionToken),
      label: "billing/upgrade/preview",
    },
  );

  return response;
}
