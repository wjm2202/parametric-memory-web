/**
 * POST /api/my-substrate/claim-key
 *
 * Proxies to compute's claim-key endpoint, which reveals the pending_api_key
 * once and then clears it from the DB. The raw key is returned exactly once —
 * after this call it is irretrievable.
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
    const res = await fetch(`${COMPUTE_URL}/api/v1/my-substrate/claim-key`, {
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
