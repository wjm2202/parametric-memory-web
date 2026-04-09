/**
 * POST /api/my-substrate/rotate-key
 *
 * Proxies to compute's rotate-key endpoint, which starts an async key
 * rotation job: generates a new key, updates the container config, restarts
 * containers, verifies health, and commits to the database.
 *
 * Returns { jobId, status } on success.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { computeProxy, authHeaders } from "@/lib/compute-proxy";

const SESSION_COOKIE = "mmpm_session";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* empty body is fine — no required fields */
  }

  const { response } = await computeProxy("api/v1/my-substrate/rotate-key", {
    method: "POST",
    body,
    headers: authHeaders(sessionToken),
    label: "my-substrate/rotate-key",
  });

  return response;
}
