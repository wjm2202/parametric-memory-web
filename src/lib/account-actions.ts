/**
 * Shared client-side handlers for "logged-in account" actions.
 *
 * Why: Both DashboardClient and AdminClient (and now SiteNavbar's mobile
 * drawer) need to open the Stripe billing portal and sign the user out.
 * Centralising the fetch + redirect logic here means every entry point
 * behaves identically — same error handling, same redirect target.
 */

/**
 * Open the Stripe customer portal in the current tab.
 *
 * Returns true on success (browser is navigating away), false otherwise so
 * callers can show their own error toast / banner.
 */
export async function openBillingPortal(): Promise<boolean> {
  try {
    const res = await fetch("/api/billing/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (res.status === 422) {
      alert("No billing account found. Please subscribe first.");
      return false;
    }
    if (!res.ok) {
      alert("Could not open billing portal. Please try again.");
      return false;
    }
    const data = (await res.json()) as { portalUrl?: string };
    if (data.portalUrl) {
      window.location.href = data.portalUrl;
      return true;
    }
    alert("Could not open billing portal. Please try again.");
    return false;
  } catch {
    alert("Could not open billing portal. Please try again.");
    return false;
  }
}

/**
 * Sign the user out and redirect to /login.
 *
 * The sign-out API clears the session cookie server-side; we then bounce to
 * /login to ensure no stale client state leaks. If the network call fails we
 * still redirect — the user has clearly indicated intent to leave.
 */
export async function signOut(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // Network failure is non-blocking — the cookie is httpOnly so the only
    // way to clear it is the server, but we still want to leave the page.
  } finally {
    window.location.href = "/login";
  }
}
