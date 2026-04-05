import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

const COMPUTE_URL = process.env.MMPM_COMPUTE_URL ?? "http://localhost:3100";

const SESSION_COOKIE = "mmpm_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

/**
 * Magic link callback — exchanges the raw token for a session.
 *
 * Flow (no TOTP):
 *   1. Email contains link: GET /auth/callback?token=RAW_TOKEN
 *   2. This handler calls mmpm-compute /api/auth/verify?token=RAW_TOKEN
 *   3. On success: sets httpOnly session cookie, redirects to /admin
 *   4. On failure: redirects to /login?error=...
 *
 * Flow (TOTP enrolled):
 *   1-2. Same as above.
 *   3. Compute returns { totpRequired: true, pendingToken, accountId }
 *   4. This handler redirects to /auth/totp?pending=PENDING_TOKEN
 *   5. User enters TOTP code → POST /api/auth/totp/challenge → session set
 *
 * IMPORTANT: redirect() in Next.js App Router works by throwing a special
 * NEXT_REDIRECT error internally. Calling redirect() inside a try/catch means
 * the catch block intercepts it and the redirect never fires correctly — every
 * error shows as the catch's fallback message regardless of the real cause.
 * All redirect() calls must live OUTSIDE try/catch blocks.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const token = request.nextUrl.searchParams.get("token");

  if (!token || token.trim().length === 0) {
    redirect("/login?error=missing_token");
  }

  // Resolve the verify call — store outcome or redirect path outside the try/catch.
  let sessionToken: string | null = null;
  let accountId: string | null = null;
  /**
   * redirectPath is set for any non-cookie outcome:
   *   - Error:          /login?error=*
   *   - TOTP required:  /auth/totp?pending=*
   * When set, we redirect instead of setting a cookie.
   */
  let redirectPath: string | null = null;

  try {
    const res = await fetch(`${COMPUTE_URL}/api/auth/verify?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.warn("[auth/callback] Verify failed:", res.status, body);
      redirectPath = "/login?error=invalid_token";
    } else {
      const data = (await res.json()) as {
        ok: boolean;
        totpRequired?: boolean;
        sessionToken?: string;
        pendingToken?: string;
        accountId: string;
      };
      accountId = data.accountId;

      if (data.totpRequired && data.pendingToken) {
        // TOTP enrolled — redirect to challenge page with the pending token.
        // Do NOT set a cookie yet — the full session is only issued after TOTP succeeds.
        redirectPath = `/auth/totp?pending=${encodeURIComponent(data.pendingToken)}`;
      } else {
        sessionToken = data.sessionToken ?? null;
      }
    }
  } catch (err) {
    console.error("[auth/callback] Network error:", err);
    redirectPath = "/login?error=server_error";
  }

  // All redirects happen outside the try/catch so Next.js NEXT_REDIRECT is never swallowed.
  if (redirectPath) {
    redirect(redirectPath);
  }

  // Set the session cookie — httpOnly so JS can't read it.
  // SEC: secure must be false on localhost (HTTP) or the browser silently drops the cookie.
  const isLocalhost =
    request.nextUrl.hostname === "localhost" || request.nextUrl.hostname === "127.0.0.1";
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionToken!, {
    httpOnly: true,
    secure: !isLocalhost,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  console.info(`[auth/callback] Session set for account ${accountId}`);

  // Check for a post-login redirect destination (set by /login page as a cookie).
  // Only allow relative paths starting with / to prevent open redirect attacks.
  const rawRedirect = cookieStore.get("mmpm_redirect")?.value;
  const postLoginRedirect = rawRedirect ? decodeURIComponent(rawRedirect) : null;
  let destination = "/admin";

  if (
    postLoginRedirect &&
    postLoginRedirect.startsWith("/") &&
    !postLoginRedirect.startsWith("//")
  ) {
    destination = postLoginRedirect;
    // Clear the redirect cookie — it's single-use
    cookieStore.delete("mmpm_redirect");
  }

  redirect(destination);
}
