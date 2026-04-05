/**
 * POST /api/my-substrate/deprovision
 *
 * Proxies to compute's session-authenticated deprovision endpoint.
 * Compute marks the substrate deprovisioned and queues a soft-destroy job
 * (containers down, data retained for 30 days).
 *
 * Only allowed for free-tier substrates with no active Stripe subscription.
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
    const res = await fetch(`${COMPUTE_URL}/api/v1/my-substrate/deprovision`, {
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
