import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

const COMPUTE_URL = process.env.MMPM_COMPUTE_URL ?? "http://localhost:3100";

const SESSION_COOKIE = "mmpm_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

// Pending-session cookie set when compute returns requiresFactor: 'totp'.
// Bridges /auth/callback → /auth/two-factor → /api/auth/factors/totp/login-verify.
// httpOnly so client JS cannot read it; the website-side login-verify route
// reads it from the cookie store. Path "/" so the /auth/two-factor page and
// the /api/auth/factors/totp/login-verify handler both see it.
const PENDING_COOKIE = "mmpm_pending_token";
// 10 minutes — matches compute's totp_pending_sessions TTL. If the user
// can't complete 2FA in 10 minutes, they'll need a fresh magic link
// regardless; the cookie outliving the row is wasted entropy.
const PENDING_MAX_AGE = 10 * 60;

/**
 * Magic link callback — exchanges the raw token for a session.
 *
 * Flow:
 *   1. Email contains link: GET /auth/callback?token=RAW_TOKEN
 *   2. This handler calls mmpm-compute /api/auth/verify?token=RAW_TOKEN
 *   3. On success: sets httpOnly session cookie, redirects to /admin
 *   4. On failure: redirects to /login?error=...
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
  // Sprint 5/9: the magic-link fork. When compute returns requiresFactor,
  // we set a short-lived pending-token cookie and route to /auth/two-factor
  // instead of minting a session. Both branches are mutually exclusive in
  // a single response — compute returns either { sessionToken, accountId }
  // or { requiresFactor, pendingToken, accountId }, never both.
  let pendingToken: string | null = null;
  let requiresFactor: string | null = null;
  /**
   * redirectPath is set for any non-cookie outcome (e.g. /login?error=*).
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
        sessionToken?: string;
        accountId: string;
        requiresFactor?: string;
        pendingToken?: string;
      };
      accountId = data.accountId;
      sessionToken = data.sessionToken ?? null;
      requiresFactor = data.requiresFactor ?? null;
      pendingToken = data.pendingToken ?? null;
    }
  } catch (err) {
    console.error("[auth/callback] Network error:", err);
    redirectPath = "/login?error=server_error";
  }

  // All redirects happen outside the try/catch so Next.js NEXT_REDIRECT is never swallowed.
  if (redirectPath) {
    redirect(redirectPath);
  }

  // ─── Sprint 5/9 login fork — pending-token branch ─────────────────────────
  //
  // Compute returned requiresFactor. The user's account has an active
  // second factor (TOTP today; WebAuthn future). Set the pending-token
  // cookie and route to the 2FA challenge page. The mmpm_redirect cookie
  // (if set by /login) stays in place so the user lands on the right
  // destination after the challenge succeeds — /auth/two-factor's
  // success path reads the same cookie that /auth/callback would have
  // honoured.
  if (requiresFactor === "totp" && pendingToken) {
    const isLocalhostFork =
      request.nextUrl.hostname === "localhost" || request.nextUrl.hostname === "127.0.0.1";
    const cookieStoreFork = await cookies();
    cookieStoreFork.set(PENDING_COOKIE, pendingToken, {
      httpOnly: true,
      secure: !isLocalhostFork,
      sameSite: "lax",
      path: "/",
      maxAge: PENDING_MAX_AGE,
    });
    console.info(
      `[auth/callback] Login fork — pending token set for account=${accountId}, redirecting to /auth/two-factor`,
    );
    redirect("/auth/two-factor");
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
