/**
 * POST /api/my-substrate/reactivate
 *
 * Proxies to compute's session-authenticated reactivate endpoint.
 * Compute calls Stripe to clear cancel_at_period_end, which triggers
 * customer.subscription.updated with cancel_at_period_end=false.
 * The webhook clears substrates.cancel_at so the dashboard removes the
 * "Cancels on [date]" pill and re-shows the Cancel button.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const COMPUTE_URL = process.env.MMPM_COMPUTE_URL ?? "http://localhost:3100";
const SESSION_COOKIE = "mmpm_session";

export async function POST(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(`${COMPUTE_URL}/api/v1/my-substrate/reactivate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionToken}` },
    });

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json(
      { error: "upstream_error", message: "Failed to reach compute service" },
      { status: 502 },
    );
  }
}
