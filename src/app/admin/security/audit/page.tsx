/**
 * /admin/security/audit — Sprint 7.
 *
 * Server component for the auth-events feed page. Resolves the session
 * cookie, fetches the account email so RecentAuthGate can render the
 * magic-link prompt without an extra client-side round-trip to /me, and
 * delegates everything else to AuditClient.
 *
 * Mirrors the structure of /admin/security/two-factor/page.tsx (Sprint 8)
 * — same shape, same redirect pattern, same dynamic = "force-dynamic".
 *
 * The page is gated by RecentAuthGate (rendered inside AuditClient) per
 * the Sprint 7 plan: "Reading your own audit log is a sensitive action".
 * The gate's UX matches the rest of the security surface — same magic-link
 * round-trip, same affordances.
 *
 * Why we DON'T fetch the first page of audit events server-side
 * ─────────────────────────────────────────────────────────────
 *
 * Two reasons:
 *
 *   1. **The recent-auth gate may not be fresh on initial render.**
 *      If we fetch /api/auth/audit server-side and the user's recent-auth
 *      window has lapsed, the response is 401 reauth_required. We'd then
 *      have to translate that into a client-renderable shape. Easier to
 *      let the client render the gate; the gate calls audit AFTER recent-auth
 *      is fresh.
 *
 *   2. **Cursor pagination is a client concern.** The next-page button
 *      mutates the request URL — that's a client interaction. There's no
 *      benefit to pre-loading the first page and then immediately switching
 *      to client-side fetching for page 2.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AuditClient from "./AuditClient";

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
    return (await res.json()) as AccountInfo;
  } catch {
    return null;
  }
}

/**
 * Per-request rendering. The audit feed is per-user and reflects the
 * current account_id from the cookie — never statically cacheable.
 */
export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) redirect("/login?next=/admin/security/audit");

  const account = await getAccount(sessionToken);
  if (!account) {
    cookieStore.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
    redirect("/login?error=session_expired");
  }

  return <AuditClient account={account} />;
}
