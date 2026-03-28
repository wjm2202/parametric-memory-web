/**
 * POST /api/auth/totp
 *
 * Server-side proxy for TOTP challenge and recovery flows.
 * These routes MUST be server-side so the session token never touches the client —
 * the cookie is set httpOnly here, same pattern as /auth/callback.
 *
 * Dispatch by query param (?action=challenge|recover):
 *   POST /api/auth/totp?action=challenge — pendingToken + code → set session cookie
 *   POST /api/auth/totp?action=recover   — pendingToken + backupCode → set session cookie
 *
 * On success: sets httpOnly session cookie, returns { ok: true, accountId }.
 * On failure: returns the compute error response (401/429/500) with no cookie.
 */

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { verifyCsrfOrigin } from "@/lib/csrf";

const COMPUTE_URL = process.env.MMPM_COMPUTE_URL ?? "http://localhost:3100";
const SESSION_COOKIE = "mmpm_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfError = verifyCsrfOrigin(request);
  if (csrfError) return csrfError;

  const action = request.nextUrl.searchParams.get("action");

  if (action !== "challenge" && action !== "recover") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const computePath =
    action === "challenge"
      ? "/api/auth/totp/challenge"
      : "/api/auth/totp/recover";

  let computeRes: Response;
  try {
    computeRes = await fetch(`${COMPUTE_URL}${computePath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    console.error(`[totp-proxy] ${computePath} network error:`, err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  // On failure — return the error response as-is (no cookie)
  if (!computeRes.ok) {
    const errorBody = await computeRes.text();
    return new NextResponse(errorBody, {
      status: computeRes.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = (await computeRes.json()) as {
    ok: boolean;
    sessionToken: string;
    accountId: string;
    codesRemaining?: number;
  };

  // Set the httpOnly session cookie — session token never reaches the browser
  // SEC: secure must be false on localhost (HTTP) or the browser silently drops the cookie.
  const isLocalhost = request.nextUrl.hostname === "localhost" || request.nextUrl.hostname === "127.0.0.1";
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, data.sessionToken, {
    httpOnly: true,
    secure: !isLocalhost,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  console.info(`[totp-proxy] Session set via ${action} for account ${data.accountId}`);

  // Return success without the session token (it's in the cookie)
  return NextResponse.json({
    ok: true,
    accountId: data.accountId,
    ...(data.codesRemaining !== undefined ? { codesRemaining: data.codesRemaining } : {}),
  });
}
