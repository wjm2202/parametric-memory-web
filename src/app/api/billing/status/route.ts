/**
 * GET /api/billing/status
 *
 * Proxies to compute's session-authenticated GET /api/v1/billing/status.
 * Returns the unified billing snapshot for the dashboard billing widget.
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

  const { response } = await computeProxy("api/v1/billing/status", {
    headers: authHeaders(sessionToken),
    label: "billing/status",
  });

  return response;
}
