/**
 * POST /api/my-substrate/claim-key
 *
 * Proxies to compute's claim-key endpoint, which reveals the pending_api_key
 * once and then clears it from the DB. The raw key is returned exactly once —
 * after this call it is irretrievable.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { computeProxy, authHeaders } from "@/lib/compute-proxy";
import { verifyCsrfOrigin } from "@/lib/csrf";

const SESSION_COOKIE = "mmpm_session";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfError = verifyCsrfOrigin(request);
  if (csrfError) return csrfError;

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { response } = await computeProxy("api/v1/my-substrate/claim-key", {
    method: "POST",
    headers: authHeaders(sessionToken),
    label: "my-substrate/claim-key",
  });

  return response;
}
