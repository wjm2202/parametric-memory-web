/**
 * GET /api/capacity
 * POST /api/capacity
 *
 * GET: Proxies to compute's /api/v1/capacity endpoint.
 * Returns tier availability and capacity status. Uses fail-open: if compute
 * is unreachable or returns garbage, all tiers default to "available".
 *
 * POST: Proxies to compute's /api/v1/capacity/waitlist endpoint.
 * Forwards request body and passes through 4xx errors.
 *
 * Uses the shared compute-proxy utility to guarantee JSON responses.
 */

import { NextResponse, NextRequest } from "next/server";
import { computeProxy } from "@/lib/compute-proxy";

export const dynamic = "force-dynamic";

const FAIL_OPEN_RESPONSE = {
  tiers: {
    indie: {
      available: true,
      status: "open",
      fillPct: null,
      slotsRemaining: null,
      message: null,
    },
    pro: {
      available: true,
      status: "open",
      fillPct: null,
      slotsRemaining: null,
      message: null,
    },
    team: {
      available: true,
      status: "open",
      fillPct: null,
      slotsRemaining: null,
      message: null,
    },
  },
  cachedAt: new Date().toISOString(),
};

export async function GET(): Promise<NextResponse> {
  const result = await computeProxy("api/v1/capacity", {
    label: "capacity",
  });

  // Capacity is special: fail open so the pricing page never blocks signups.
  // The compute server enforces real capacity gating at checkout time.
  if (!result.ok) {
    return NextResponse.json(FAIL_OPEN_RESPONSE, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json(result.data, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* empty body */
  }

  const result = await computeProxy("api/v1/capacity/waitlist", {
    method: "POST",
    body,
    label: "capacity/waitlist",
  });

  return result.response;
}
