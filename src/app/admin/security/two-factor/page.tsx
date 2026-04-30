/**
 * /admin/security/two-factor — TOTP enrolment + management page.
 *
 * Server component. Resolves the session cookie, fetches the account, and
 * passes the email down to the client component so the recent-auth gate can
 * render the magic-link round-trip UX without an extra client-side round-
 * trip to /api/auth/me.
 *
 * The client component (`TwoFactorClient`) decides which sub-flow to render
 * based on the live /status response:
 *
 *   - Not enrolled    → enrolment wizard (intro → QR → verify → backup codes)
 *   - Half-enrolled   → enrolment wizard (resumes from QR step — server
 *                       state is the same as not-enrolled from the client's
 *                       perspective)
 *   - Enrolled        → management screen (Disable + Regenerate buttons,
 *                       each gating to its own confirmation flow)
 *
 * ## Why a single page handles both flows
 *
 * The original Sprint 8 design plan had separate /two-factor/disable and
 * /two-factor/regenerate routes. We collapsed them into the same URL with
 * an in-page state machine because:
 *
 *   1. The disable + regenerate flows both need a 6-digit code and the
 *      RecentAuthGate; the body of each is ~30 lines. Sub-pages would force
 *      duplicate layout chrome and a wider router surface for no real
 *      separation gain.
 *   2. Browser back-button semantics are cleaner — "Cancel" returns to
 *      /admin/security every time, regardless of which sub-flow the user
 *      was in.
 *   3. The OpenAPI contract still has all 4 management endpoints exposed
 *      separately; this is a UI-grouping decision, not an API change.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import TwoFactorClient from "./TwoFactorClient";

const COMPUTE_URL = process.env.MMPM_COMPUTE_URL ?? "http://localhost:3100";
const SESSION_COOKIE = "mmpm_session";

interface AccountInfo {
  id: string;
  email: string;
}

async function getAccount(sessionToken: string): Promise<AccountInfo | null> {
  try {
    const res = await fetch(`${COMPUTE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Per-request rendering. The page reads the session cookie at request
 * time and the wizard state changes per-user (enrolled vs not) — there's
 * no static-cacheable content here.
 */
export const dynamic = "force-dynamic";

export default async function TwoFactorPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) redirect("/login?next=/admin/security/two-factor");

  const account = await getAccount(sessionToken);
  if (!account) {
    cookieStore.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
    redirect("/login?error=session_expired");
  }

  return <TwoFactorClient account={account} />;
}
