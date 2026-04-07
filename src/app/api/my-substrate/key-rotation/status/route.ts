/**
 * GET /api/my-substrate/key-rotation/status
 *
 * Proxies to compute's key-rotation status endpoint.  The dashboard polls
 * this every 2 seconds while a rotation is in progress to drive the
 * RotationStepper UI through its seven phases.
 *
 * Returns { status, errorMessage? } where status is one of:
 *   pending | generating | updating_config | restarting | verifying |
 *   committing | complete | failed
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
    const res = await fetch(`${COMPUTE_URL}/api/v1/my-substrate/key-rotation/status`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      cache: "no-store",
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
