/**
 * Website-side login-verify route — bridges the 2FA challenge UI to compute.
 *
 * ## Why this lives here, not in the [...path] catch-all
 *
 * The catch-all proxy at `/api/auth/[...path]/route.ts` forwards every
 * `/api/auth/*` POST verbatim to compute. For login-verify we need MORE
 * than that: we have to read the `mmpm_pending_token` httpOnly cookie
 * server-side (the client can't read it; that's the whole point of
 * httpOnly), forward it to compute as part of the body, and on success
 * set the `mmpm_session` cookie + clear `mmpm_pending_token`. Doing this
 * in the catch-all would mean the catch-all knows about every flow's
 * cookies, which violates its single-responsibility "transparent proxy"
 * shape.
 *
 * Next.js routes more-specific paths before catch-alls, so this handler
 * wins over `/api/auth/[...path]` for this exact URL.
 *
 * ## Request shape
 *
 *   POST /api/auth/factors/totp/login-verify
 *   Body: { code: string }                     (NO pendingToken — read from cookie)
 *
 * ## Response shape
 *
 *   200 → { ok: true, accountId }              (sessionToken is set as cookie, NOT returned)
 *   400 → { error: { code: 'totp_invalid_input', message } }
 *   401 → { error: { code: 'totp_invalid', message, attemptsRemaining } }
 *   401 → { error: { code: 'pending_token_invalid_or_expired', message } }
 *         (cookie cleared on this response)
 *   429 → { error: { code: 'totp_locked', message, lockedUntil } }
 *
 * ## Why we don't return sessionToken in the body
 *
 * The website's job is to be the place where the session cookie is set.
 * Returning the raw token in the body would either mean (a) the client
 * stores it (breaking httpOnly) or (b) the response carries it for no
 * reason (information leak via XSS or browser history). Setting it as
 * cookie + returning only `{ ok }` is the cleanest pattern and matches
 * how `/auth/callback` handles its own session minting.
 */

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { verifyCsrfOrigin } from "@/lib/csrf";

const COMPUTE_URL = process.env.MMPM_COMPUTE_URL ?? "http://localhost:3100";
const SESSION_COOKIE = "mmpm_session";
const PENDING_COOKIE = "mmpm_pending_token";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days, matches /auth/callback

interface ApiError {
  code: string;
  message: string;
  attemptsRemaining?: number;
  lockedUntil?: string;
}

function jsonError(status: number, error: ApiError): NextResponse {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // CSRF — same gate the catch-all proxy uses for all auth POSTs.
  const csrfError = verifyCsrfOrigin(request);
  if (csrfError) return csrfError;

  // Parse body. Only `code` is expected; pendingToken comes from the cookie.
  let body: { code?: unknown };
  try {
    body = (await request.json()) as { code?: unknown };
  } catch {
    return jsonError(400, {
      code: "totp_invalid_input",
      message: "Request body must be JSON with a 'code' field.",
    });
  }
  if (typeof body.code !== "string" || body.code.trim().length === 0) {
    return jsonError(400, {
      code: "totp_invalid_input",
      message: "A 6-digit code or backup code is required.",
    });
  }

  const cookieStore = await cookies();
  const pendingToken = cookieStore.get(PENDING_COOKIE)?.value;

  if (!pendingToken) {
    // The user hit /auth/two-factor without a pending token — either
    // the cookie expired (10-min TTL) or they navigated here directly.
    // Surface the same error code compute would for an unknown pending
    // row so the UI can render a uniform "request a new sign-in link" CTA.
    return jsonError(401, {
      code: "pending_token_invalid_or_expired",
      message: "This sign-in attempt has expired. Request a new sign-in link.",
    });
  }

  // Forward to compute. We do NOT use the existing computeProxy helper
  // because we need to inspect the response status + body to decide
  // cookie operations.
  let res: Response;
  try {
    res = await fetch(`${COMPUTE_URL}/api/auth/factors/totp/login-verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken, code: body.code.trim() }),
      cache: "no-store",
    });
  } catch (err) {
    console.error("[auth/factors/totp/login-verify] Network error:", err);
    return jsonError(502, {
      code: "network_error",
      message: "Could not reach the auth server. Try again.",
    });
  }

  // Parse the response body. Compute always returns JSON for this route.
  let upstreamBody: {
    ok?: boolean;
    sessionToken?: string;
    accountId?: string;
    error?: ApiError;
  };
  try {
    upstreamBody = (await res.json()) as typeof upstreamBody;
  } catch {
    console.error(
      "[auth/factors/totp/login-verify] Non-JSON upstream response, status=",
      res.status,
    );
    return jsonError(502, {
      code: "upstream_invalid_response",
      message: "The auth server returned an unexpected response. Try again.",
    });
  }

  // Failure paths — forward the error envelope verbatim. On
  // pending_token_invalid_or_expired, also clear our cookie so a stale
  // pending pointer doesn't outlive its row in compute.
  if (!res.ok) {
    if (upstreamBody.error?.code === "pending_token_invalid_or_expired") {
      cookieStore.delete(PENDING_COOKIE);
    }
    return jsonError(
      res.status,
      upstreamBody.error ?? {
        code: "unknown",
        message: "The auth server rejected the request.",
      },
    );
  }

  // Success — mint the session cookie and clear the pending pointer.
  if (!upstreamBody.sessionToken || !upstreamBody.accountId) {
    // Defensive: compute returned 2xx without the expected fields. Treat
    // as upstream contract violation — the UI sees a network-class error.
    console.error(
      "[auth/factors/totp/login-verify] Upstream 200 missing sessionToken/accountId",
      upstreamBody,
    );
    return jsonError(502, {
      code: "upstream_invalid_response",
      message: "The auth server returned an incomplete response. Try again.",
    });
  }

  const isLocalhost =
    request.nextUrl.hostname === "localhost" || request.nextUrl.hostname === "127.0.0.1";
  cookieStore.set(SESSION_COOKIE, upstreamBody.sessionToken, {
    httpOnly: true,
    secure: !isLocalhost,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  cookieStore.delete(PENDING_COOKIE);

  console.info(
    `[auth/factors/totp/login-verify] Session set for account ${upstreamBody.accountId}`,
  );

  // Return only `{ ok, accountId }` — sessionToken is in the cookie, never the body.
  return NextResponse.json({ ok: true, accountId: upstreamBody.accountId });
}
