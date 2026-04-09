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
import { computeProxy, authHeaders } from "@/lib/compute-proxy";

const SESSION_COOKIE = "mmpm_session";

export async function GET(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { response } = await computeProxy("api/v1/my-substrate/key-rotation/status", {
    headers: authHeaders(sessionToken),
    label: "my-substrate/key-rotation/status",
  });

  return response;
}
