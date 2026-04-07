/**
 * POST /api/auth/sudo
 *
 * Proxies to compute's sudo re-challenge endpoint. Issues a short-lived
 * action-scoped sudo token after verifying the user's TOTP code.
 *
 * Request body: { action: "rotate_keys" | "cancel_subscription" | "delete_account", totpCode: string }
 * Response:     { sudoToken, expiresAt, action }
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyCsrfOrigin } from "@/lib/csrf";

const COMPUTE_URL = process.env.MMPM_COMPUTE_URL ?? "http://localhost:3100";
const SESSION_COOKIE = "mmpm_session";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfError = verifyCsrfOrigin(request);
  if (csrfError) return csrfError;

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const res = await fetch(`${COMPUTE_URL}/api/auth/sudo`, {
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
