/**
 * GET /api/substrates
 *
 * List all substrates for the authenticated account.
 * Proxies to compute's GET /api/v1/substrates.
 *
 * @see docs/api-contracts-multi-substrate.md §4
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

  const { response } = await computeProxy("api/v1/substrates", {
    headers: authHeaders(sessionToken),
    label: "substrates/list",
  });

  return response;
}
