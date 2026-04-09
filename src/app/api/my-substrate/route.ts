/**
 * GET /api/my-substrate
 *
 * Client-side polling endpoint for the dashboard.
 * Proxies to compute's session-authenticated /api/v1/my-substrate endpoint.
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

  const { response } = await computeProxy("api/v1/my-substrate", {
    headers: authHeaders(sessionToken),
    label: "my-substrate",
  });

  return response;
}
