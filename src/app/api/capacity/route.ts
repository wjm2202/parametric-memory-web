/**
 * GET /api/capacity
 * POST /api/capacity
 *
 * GET: Proxies to compute's /api/v1/capacity endpoint.
 * Returns tier availability and capacity status.
 * No longer ISR-cached — capacity is now event-driven. The pricing page
 * fetches on mount (hydrate badge) and again on CTA click (gate checkout).
 * Compute's own 60 s in-memory cache deduplicates rapid requests.
 *
 * POST: Proxies to compute's /api/v1/capacity/waitlist endpoint.
 * Forwards request body and passes through 4xx errors. Returns 500 on upstream errors.
 */

import { NextResponse, NextRequest } from "next/server";

const COMPUTE_URL = process.env.MMPM_COMPUTE_URL ?? "http://localhost:3100";

// Removed: export const revalidate = 60;
// Capacity is now event-driven, not ISR-polled.
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
  try {
    const res = await fetch(`${COMPUTE_URL}/api/v1/capacity`, {
      cache: "no-store",
    });

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Capacity endpoint error:", error);
    return NextResponse.json(FAIL_OPEN_RESPONSE, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();

    const res = await fetch(`${COMPUTE_URL}/api/v1/capacity/waitlist`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.text();

    // Pass through 4xx status codes (semantic errors like bad email, invalid tier)
    if (res.status >= 400 && res.status < 500) {
      return new NextResponse(data, {
        status: res.status,
        headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
      });
    }

    // 5xx or network errors: return generic error
    if (!res.ok) {
      return NextResponse.json(
        { error: "Could not save your details. Please try again." },
        { status: 500 },
      );
    }

    // Success: return upstream body with 201
    return new NextResponse(data, {
      status: 201,
      headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (error) {
    console.error("Capacity waitlist error:", error);
    return NextResponse.json(
      { error: "Could not save your details. Please try again." },
      { status: 500 },
    );
  }
}
