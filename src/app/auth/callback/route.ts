import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

const COMPUTE_URL = process.env.MMPM_COMPUTE_URL ?? "http://localhost:3100";

const SESSION_COOKIE = "mmpm_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

/**
 * Magic link callback — exchanges the raw token for a session.
 *
 * Flow:
 *   1. Email contains link: GET /auth/callback?token=RAW_TOKEN
 *   2. This handler calls mmpm-compute /api/auth/verify?token=RAW_TOKEN
 *   3. On success: sets httpOnly session cookie, redirects to /admin
 *   4. On failure: redirects to /login?error=...
 *
 * Using a Route Handler (not a Server Component) because only Route
 * Handlers can set cookies on the response in Next.js App Router.
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

  // Resolve the verify call — store result or error path, redirect after the try/catch.
  let sessionToken: string | null = null;
  let accountId: string | null = null;
  let errorPath: string | null = null;

  try {
    const res = await fetch(`${COMPUTE_URL}/api/auth/verify?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.warn("[auth/callback] Verify failed:", res.status, body);
      // Mark for redirect — do NOT call redirect() here, it throws and the catch
      // would intercept it and mask the real error with "server_error".
      errorPath = "/login?error=invalid_token";
    } else {
      const data = (await res.json()) as {
        ok: boolean;
        sessionToken: string;
        accountId: string;
      };
      sessionToken = data.sessionToken;
      accountId = data.accountId;
    }
  } catch (err) {
    console.error("[auth/callback] Network error:", err);
    errorPath = "/login?error=server_error";
  }

  // All redirects happen outside the try/catch so Next.js NEXT_REDIRECT is never swallowed.
  if (errorPath) {
    redirect(errorPath);
  }

  // Set the session cookie — httpOnly so JS can't read it
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionToken!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  console.info(`[auth/callback] Session set for account ${accountId}`);

  // Redirect to admin dashboard
  redirect("/admin");
}
