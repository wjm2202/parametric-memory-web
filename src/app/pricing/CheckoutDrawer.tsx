/**
 * CheckoutDrawer — right-side slide-in drawer that hosts Stripe's
 * Embedded Checkout iframe.
 *
 * Sprint 2026-05-18 D3.
 *
 * Layout / interaction mirrors `src/app/admin/ChangePlanSheet.tsx`:
 *   - fixed full-viewport overlay; flex justify-end so the panel sticks right
 *   - backdrop click + Esc close (the iframe doesn't listen to either, so
 *     this is the user's only exit if they change their mind mid-payment)
 *   - max-w-xl on desktop; mobile drops the max width so the panel fills
 *     the viewport (Stripe's iframe handles small screens natively)
 *
 * What this component is NOT:
 *   - It does NOT call /api/checkout itself. The caller (PricingCTA) does the
 *     adblock probe BEFORE opening the drawer, so by the time we mount Stripe
 *     is known to be loadable. We just bind a `fetchClientSecret` callback
 *     and let <EmbeddedCheckoutProvider> drive the network call.
 *   - It does NOT decide what to render when checkout completes. Stripe
 *     redirects the parent frame to `return_url` automatically; the
 *     `/billing/return` page (D4) handles success / retry.
 *
 * Failure modes left to the drawer:
 *   - If `fetchClientSecret` rejects (eg /api/checkout returns 409
 *     tier_at_capacity or 401), we surface an error notice in place of the
 *     iframe with a Close action. PricingCTA's pre-mount capacity check
 *     should catch the 409 path, but the inline guard is the safety net.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";

// Module-singleton Stripe.js promise. loadStripe is safe to call once per
// publishable key per page; PricingCTA also calls it for the adblock probe,
// but Stripe.js itself caches the script tag — a second call is cheap.
let stripeSingleton: Promise<Stripe | null> | null = null;
function getStripe(): Promise<Stripe | null> {
  if (!stripeSingleton) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      // Misconfigured deploy. Surface as a rejected promise so the drawer
      // shows its error state rather than mounting a broken iframe.
      stripeSingleton = Promise.resolve(null);
    } else {
      stripeSingleton = loadStripe(key);
    }
  }
  return stripeSingleton;
}

interface Props {
  /** Controls visibility. When false the drawer renders nothing. */
  open: boolean;
  /** Fires on backdrop click, Esc, or × button. */
  onClose: () => void;
  /**
   * Tier id (`solo` / `pro` / `team`). Forwarded to /api/checkout when the
   * `fetchClientSecret` callback runs.
   */
  tierId: string;
  /** Human-readable tier name. Header only — not sent to compute. */
  tierName: string;
  /** Optional monthly price string for the header (e.g. "$9/month"). */
  priceLabel?: string;
}

type FetchState = { kind: "ready" } | { kind: "error"; message: string };

export function CheckoutDrawer({ open, onClose, tierId, tierName, priceLabel }: Props) {
  // RC-07 (react-compiler-readiness, 2026-05-27): state starts as
  // { kind: "ready" } via useState's initial value. The previous
  // reset-on-open useEffect was removed because the parent
  // (PricingCTA) now renders <CheckoutDrawer> conditionally — every
  // open is a fresh mount with fresh state, which is also what the
  // Stripe iframe wants. See the comment over the conditional render
  // in PricingCTA.tsx for the architectural reasoning.
  const [state, setState] = useState<FetchState>({ kind: "ready" });

  // ── Esc closes (Stripe's iframe doesn't listen to Esc inside its own
  //    frame, so the parent must) ───────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // ── fetchClientSecret — bound per-mount ────────────────────────────────
  // <EmbeddedCheckoutProvider> calls this once to obtain the clientSecret
  // for the session. Errors here become a Stripe.js-level mount failure
  // unless we intercept; the try/catch surfaces the failure as a friendly
  // error state in the drawer body.
  const fetchClientSecret = useCallback(async (): Promise<string> => {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: tierId }),
      // Same-origin Origin is added automatically by the browser for fetch
      // calls; the CSRF check on the BFF passes without extra config.
    });
    if (!res.ok) {
      // Surface enough information for the drawer to render a useful
      // message. 401 + 409 are the two business-meaningful failures.
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      const message =
        res.status === 401
          ? "You need to sign in again before paying. Please reload."
          : res.status === 409
            ? (body?.message ?? "This tier is temporarily full. Please come back shortly.")
            : (body?.error ?? `Checkout failed (HTTP ${res.status}).`);
      setState({ kind: "error", message });
      // Returning an empty string makes <EmbeddedCheckoutProvider> render
      // nothing (Stripe.js bails out on an empty client secret). Our error
      // notice handles the user-facing message.
      return "";
    }
    const body = (await res.json()) as { clientSecret?: string };
    if (!body.clientSecret) {
      setState({ kind: "error", message: "Stripe returned no client secret. Please retry." });
      return "";
    }
    return body.clientSecret;
  }, [tierId]);

  // Memoise the options object so <EmbeddedCheckoutProvider> doesn't see
  // a new reference on each render — preventing iframe re-mounts.
  const providerOptions = useMemo(() => ({ fetchClientSecret }), [fetchClientSecret]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-drawer-title"
      data-testid="checkout-drawer"
      className="fixed inset-0 z-40 flex justify-end"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        data-testid="checkout-drawer-backdrop"
        onClick={onClose}
      />

      <aside className="relative flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-white/10 bg-[#0d0d14] shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-white/5 px-6 py-5">
          <div>
            <h2
              id="checkout-drawer-title"
              className="font-[family-name:var(--font-syne)] text-lg font-semibold text-white"
            >
              {tierName}
            </h2>
            {priceLabel && <p className="mt-1 text-sm text-white/50">{priceLabel}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close checkout"
            data-testid="checkout-drawer-close"
            className="rounded-md p-1 text-white/40 transition-colors hover:bg-white/5 hover:text-white/80"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-2 py-3">
          {state.kind === "error" ? (
            <ErrorBody message={state.message} onClose={onClose} />
          ) : (
            <EmbeddedCheckoutProvider stripe={getStripe()} options={providerOptions}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          )}
        </div>
      </aside>
    </div>
  );
}

function ErrorBody({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      data-testid="checkout-drawer-error"
      className="m-4 rounded-md border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-200"
    >
      <p className="mb-3">{message}</p>
      <button
        type="button"
        onClick={onClose}
        className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/5"
      >
        Close
      </button>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/**
 * Probe whether Stripe.js can load in the current page environment.
 *
 * Returns `{ ok: true }` if loadStripe resolves to a non-null Stripe object,
 * or `{ ok: false, reason }` when Stripe is blocked (adblock, CSP, network
 * unavailable, or NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY missing).
 *
 * Used by PricingCTA before opening the drawer — the drawer expects Stripe
 * to be reachable when it mounts, so PricingCTA short-circuits with a
 * "disable adblock" notice if the probe fails. (Sprint 2026-05-18 D10 — D3
 * implementation.)
 *
 * Idempotent: subsequent calls hit the module-cached stripeSingleton.
 */
export async function probeStripeAvailability(): Promise<
  { ok: true } | { ok: false; reason: "load_failed" | "stripe_unavailable" }
> {
  try {
    const stripe = await getStripe();
    return stripe ? { ok: true } : { ok: false, reason: "stripe_unavailable" };
  } catch {
    return { ok: false, reason: "load_failed" };
  }
}
