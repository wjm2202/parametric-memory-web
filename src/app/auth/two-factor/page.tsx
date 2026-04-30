/**
 * /auth/two-factor — login-time TOTP challenge page.
 *
 * Routed here from /auth/callback when compute's magic-link verify
 * returned `requiresFactor: 'totp'` instead of a session token. The
 * pending token is in the httpOnly `mmpm_pending_token` cookie set by
 * /auth/callback; this page does not need to read it (it's
 * server-handled by /api/auth/factors/totp/login-verify).
 *
 * The server component here checks the cookie exists and redirects to
 * /login if not — that protects against direct navigation to this URL
 * by a user who never went through the magic-link flow. The actual UI
 * lives in TwoFactorChallengeClient.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import TwoFactorChallengeClient from "./TwoFactorChallengeClient";

const PENDING_COOKIE = "mmpm_pending_token";

/**
 * Per-request rendering. The cookie check has to happen on every request
 * (not at static-build time) and the redirect on missing cookie is itself
 * dynamic.
 */
export const dynamic = "force-dynamic";

export default async function TwoFactorChallengePage() {
  const cookieStore = await cookies();
  const pending = cookieStore.get(PENDING_COOKIE)?.value;

  if (!pending) {
    // No pending token = either expired (10-min TTL) or direct navigation.
    // Send the user back to /login with a stable error code the page already
    // surfaces in its ERROR_MESSAGES table.
    redirect("/login?error=pending_expired");
  }

  return <TwoFactorChallengeClient />;
}
