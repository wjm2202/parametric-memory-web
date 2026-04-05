/**
 * GET /api/billing/status
 *
 * Proxies to compute's session-authenticated GET /api/v1/billing/status.
 * Returns the unified billing snapshot for the dashboard billing widget.
 *
 * Response shape (from compute):
 * {
 *   tier: string,
 *   status: 'active' | 'trialing' | 'past_due' | 'suspended' | 'cancelled',
 *   renewsAt: string | null,
 *   trialEndsAt: string | null,
 *   lastPaymentFailed: boolean,
 *   hasStripeCustomer: boolean,
 *   tierDisplay: {
 *     name: string,
 *     atomsUsed: number,
 *     atomsLimit: number,
 *     bootstrapsUsed: number,
 *     bootstrapsLimit: number,
 *   }
 * }
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const COMPUTE_URL = process.env.MMPM_COMPUTE_URL ?? "http://localhost:3100";
const SESSION_COOKIE = "mmpm_session";

export async function GET(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(`${COMPUTE_URL}/api/v1/billing/status`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      cache: "no-store",
    });

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json(
      { error: "upstream_error", message: "Failed to reach compute service" },
      { status: 502 },
    );
  }
}
