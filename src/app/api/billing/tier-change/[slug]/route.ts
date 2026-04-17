/**
 * GET /api/billing/tier-change/:slug
 *
 * Proxies to compute's session-authenticated
 *   GET /api/v1/billing/tier-change/:slug
 *
 * Returns the in-flight tier-change state for a single substrate. Used by
 * the useTierChangePoll hook which re-hits this endpoint every 3 s while a
 * change is in flight. Returns 404 when no substrate_tier_changes row
 * exists — the hook interprets 404 as "idle, nothing happening".
 *
 * Response (200) shape:
 *   {
 *     state: "none" | "payment_pending" | "queued" | "processing"
 *          | "completed" | "failed" | "rolled_back",
 *     phase: string | null,
 *     targetTier: string | null,
 *     transitionKind: "shared_to_shared" | "shared_to_dedicated" | ... | null,
 *     startedAt, estimatedCompletionAt, transferAttempts,
 *     migrationProgress, error
 *   }
 *
 * @see PLAN-ADMIN-UPGRADE-FLOW.md §5.1
 * @see src/hooks/useTierChangePoll.ts — the primary caller
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { computeProxy, authHeaders } from "@/lib/compute-proxy";

const SESSION_COOKIE = "mmpm_session";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

  const { response } = await computeProxy(
    `api/v1/billing/tier-change/${encodeURIComponent(slug)}`,
    {
      headers: authHeaders(sessionToken),
      label: "billing/tier-change",
    },
  );

  return response;
}
