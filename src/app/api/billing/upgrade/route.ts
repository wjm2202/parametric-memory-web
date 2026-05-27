/**
 * POST /api/billing/upgrade
 *
 * Proxies to compute's session-authenticated
 *   POST /api/v1/substrates/:slug/upgrade
 *
 * Body in (from `ConfirmUpgradeDialog.tsx`):
 *   { substrateSlug, targetTier, idempotencyKey? }
 *
 * Body forwarded to compute:
 *   { tier, idempotencyKey? }                   ← `targetTier` is renamed to
 *                                                 `tier` (compute's field
 *                                                 name); `substrateSlug`
 *                                                 moves to the path segment.
 *
 * Response shape (compute):
 *   { accepted: true, currentTier, targetTier, transitionType,
 *     stripeSubscriptionId, prorationCents }
 *
 * NOTE — response shape mismatch with the legacy frontend. The dashboard's
 * dialog still expects `{ checkoutUrl }` (left over from the Stripe Checkout
 * flow that this endpoint replaced with in-place `subscriptions.update`).
 * After this proxy fix the BFF returns the in-place commit response
 * verbatim; the dialog will toast "Submission error" because `checkoutUrl`
 * is undefined. Fixing that is a frontend follow-up — close the dialog on
 * 200, let `useTierChangePoll` pick up the in-flight tier-change row, and
 * render the progress banner. See PLAN-ADMIN-UPGRADE-FLOW.md §4.3.
 *
 * Historical: this proxy used to call `api/v1/billing/upgrade` which never
 * existed on compute. It silently 404'd as HTML which `computeProxy`
 * remapped to a 502 — same class of bug as the upgrade-options endpoint
 * (fixed alongside this one). The real handler lives in
 *   src/api/substrates/upgrade-handlers.ts → createUpgradeCommitHandler
 * and is mounted under the substrates router at `/:slug/upgrade`.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { computeProxy, authHeaders } from "@/lib/compute-proxy";
import { verifyCsrfOrigin } from "@/lib/csrf";

const SESSION_COOKIE = "mmpm_session";

interface UpgradeBody {
  substrateSlug?: unknown;
  targetTier?: unknown;
  idempotencyKey?: unknown;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfError = verifyCsrfOrigin(request);
  if (csrfError) return csrfError;

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Read the dialog body. Treat malformed JSON as "missing slug" — same
  // surface as a deliberate empty body. We don't pass-through to compute
  // because the slug now belongs in the path segment, not the body.
  let body: UpgradeBody = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object") body = parsed as UpgradeBody;
  } catch {
    /* falls through to the slug check below */
  }

  const substrateSlug = typeof body.substrateSlug === "string" ? body.substrateSlug : "";
  if (!substrateSlug) {
    // Compute's substrates router needs a non-empty slug in the path.
    return NextResponse.json({ error: "substrateSlug_required" }, { status: 400 });
  }

  // Build the upstream body. Compute reads `tier` (not `targetTier`) and
  // doesn't currently use `idempotencyKey` (it uses an in-flight DB check),
  // but we forward it anyway so the field is reserved for future use and
  // doesn't get silently dropped at this layer.
  const upstreamBody: Record<string, unknown> = {};
  if (typeof body.targetTier === "string") upstreamBody.tier = body.targetTier;
  if (typeof body.idempotencyKey === "string") upstreamBody.idempotencyKey = body.idempotencyKey;

  const { response } = await computeProxy(
    `api/v1/substrates/${encodeURIComponent(substrateSlug)}/upgrade`,
    {
      method: "POST",
      body: upstreamBody,
      headers: authHeaders(sessionToken),
      label: "billing/upgrade",
    },
  );

  return response;
}
