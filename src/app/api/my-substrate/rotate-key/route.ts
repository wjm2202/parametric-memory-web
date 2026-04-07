/**
 * POST /api/my-substrate/rotate-key
 *
 * Proxies to compute's rotate-key endpoint, which starts an async key
 * rotation job: generates a new key, updates the container config, restarts
 * containers, verifies health, and commits to the database.
 *
 * Request body must include { sudoToken } — obtained via POST /api/auth/sudo
 * with action "rotate_keys".
 *
 * Returns { jobId, status } on success.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const COMPUTE_URL = process.env.MMPM_COMPUTE_URL ?? "http://localhost:3100";
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
    /* empty body — compute will return 400 missing_sudo_token */
  }

  try {
    const res = await fetch(`${COMPUTE_URL}/api/v1/my-substrate/rotate-key`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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
