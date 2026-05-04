/**
 * GET /api/billing/upgrade-options
 *
 * Proxies to compute's session-authenticated
 *   GET /api/v1/substrates/:slug/upgrade/tiers
 *
 * Returns the list of tiers the caller can move to from their current tier
 * on the given substrate. Only strictly higher tiers are returned in
 * Phase 1 — downgrades are deferred. Stripe proration previews are NOT
 * included here; the dashboard fetches them lazily per-card from
 *   GET /api/v1/substrates/:slug/upgrade/preview?tier=<target>
 * (a separate compute endpoint) when the user picks a row.
 *
 * The `substrateSlug` query param is required — without it, compute can't
 * resolve which substrate to look at, so we 400 in the BFF rather than
 * fabricating a path with an empty slug segment.
 *
 * ## Response transform (BFF responsibility)
 *
 * Compute returns the canonical `{ currentTier, availableUpgrades[] }`
 * shape. The dashboard's `ChangePlanSheet.tsx` + `ConfirmUpgradeDialog.tsx`
 * still expect a legacy `{ currentTier, options[] }` shape with renamed
 * fields. Rather than fan a rename out across every consumer (and risk
 * breaking the visualiser, the e2e tests, and the staging fixtures), we
 * adapt at the BFF edge:
 *
 *   compute                     →  dashboard
 *   ─────────────────────────────────────────────────
 *   availableUpgrades           →  options
 *   transitionType              →  transitionKind
 *   limits.maxBootstrapsPerMonth → limits.maxBootstrapsMonth
 *   limits.maxStorageMB         →  limits.maxStorageMb
 *   (n/a — separate /preview)   →  estimatedProrationCents: 0
 *   description                 →  (dropped — frontend doesn't render it)
 *
 * Fields the frontend types as optional (`stripePriceId`, `warnings`,
 * `currentHostingModel`) are simply omitted; the dashboard handles
 * undefined with no fallback rendering changes.
 *
 * Historical: this proxy used to target a non-existent compute path
 * `/api/v1/billing/upgrade-options`, which 404'd as HTML and broke the
 * dashboard's "Manage Billing" sheet. The real compute endpoint lives
 * under the substrates router — see compute
 *   src/api/substrates/routes.ts (`/:slug/upgrade/tiers`)
 *   src/api/substrates/upgrade-handlers.ts (createListUpgradeTiersHandler)
 *
 * @see PLAN-ADMIN-UPGRADE-FLOW.md §5.1
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { computeProxy, authHeaders } from "@/lib/compute-proxy";

const SESSION_COOKIE = "mmpm_session";

// ─── Compute's response shape (input) ────────────────────────────────────

interface ComputeUpgradeTier {
  tier: string;
  name: string;
  description?: string;
  amountCents: number;
  hostingModel: "shared" | "dedicated";
  limits: {
    maxAtoms: number;
    maxBootstrapsPerMonth: number;
    maxStorageMB: number;
  };
  transitionType: string;
}

interface ComputeListUpgradeTiersResponse {
  currentTier: string;
  availableUpgrades: ComputeUpgradeTier[];
}

// ─── Dashboard's expected shape (output) ─────────────────────────────────

interface DashboardUpgradeOption {
  tier: string;
  name: string;
  amountCents: number;
  hostingModel: "shared" | "dedicated";
  transitionKind: string;
  estimatedProrationCents: number;
  limits: {
    maxAtoms: number;
    maxBootstrapsMonth: number;
    maxStorageMb: number;
  };
}

interface DashboardUpgradeOptionsResponse {
  currentTier: string;
  options: DashboardUpgradeOption[];
}

/**
 * Map one compute upgrade tier to the dashboard's row shape.
 * `estimatedProrationCents: 0` is a deliberate placeholder — the
 * per-tier proration is fetched lazily by the confirm dialog from
 * `/upgrade/preview?tier=X`, not joined into this list.
 */
function transformOption(t: ComputeUpgradeTier): DashboardUpgradeOption {
  return {
    tier: t.tier,
    name: t.name,
    amountCents: t.amountCents,
    hostingModel: t.hostingModel,
    transitionKind: t.transitionType,
    estimatedProrationCents: 0,
    limits: {
      maxAtoms: t.limits.maxAtoms,
      maxBootstrapsMonth: t.limits.maxBootstrapsPerMonth,
      maxStorageMb: t.limits.maxStorageMB,
    },
  };
}

/**
 * Type guard — narrow `unknown` to compute's response shape so we can
 * transform without risking runtime crashes on malformed bodies. We are
 * deliberately strict: any deviation falls through to a passthrough of
 * the raw response (the dashboard's "couldn't load" branch).
 */
function isComputeResponse(d: unknown): d is ComputeListUpgradeTiersResponse {
  if (!d || typeof d !== "object") return false;
  const r = d as Record<string, unknown>;
  return typeof r.currentTier === "string" && Array.isArray(r.availableUpgrades);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const substrateSlug = request.nextUrl.searchParams.get("substrateSlug");
  if (!substrateSlug) {
    // Compute's substrates router needs a non-empty slug in the path. We
    // short-circuit here so we don't issue a guaranteed-404 upstream call.
    return NextResponse.json({ error: "substrateSlug_required" }, { status: 400 });
  }

  const result = await computeProxy(
    `api/v1/substrates/${encodeURIComponent(substrateSlug)}/upgrade/tiers`,
    {
      headers: authHeaders(sessionToken),
      label: "billing/upgrade-options",
    },
  );

  // Non-2xx, malformed JSON, or upstream failure → forward verbatim. The
  // dashboard's error path treats !res.ok as "couldn't load options".
  if (!result.ok || !isComputeResponse(result.data)) {
    return result.response;
  }

  // Happy path: transform and emit the dashboard's expected shape.
  const transformed: DashboardUpgradeOptionsResponse = {
    currentTier: result.data.currentTier,
    options: result.data.availableUpgrades.map(transformOption),
  };

  return NextResponse.json(transformed, { status: 200 });
}
