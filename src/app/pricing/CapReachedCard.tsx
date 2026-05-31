"use client";

/**
 * CapReachedCard — shown when a checkout attempt is refused with the compute
 * 409 `substrate_cap_reached` error (session-route.ts). It replaces the old
 * dead-end red error text ("…Deprovision an existing substrate first, or
 * upgrade your plan.") with an actionable card.
 *
 * SM-MULTI-1. The 409 body carries { tier, activeCount, ceiling } where `tier`
 * is the ACCOUNT tier. After SM-MULTI-3 the cap gates on
 * GREATEST(account, purchased) ceiling, so this 409 now fires only when the
 * account is at its TRUE ceiling — where adding any instance is impossible by
 * construction. The valid remedies are therefore UPGRADE (to a higher tier with
 * more headroom) or DEPROVISION. The "upgrade vs add new" CHOICE for a customer
 * who is NOT at their ceiling lives at the purchase point (the pricing-CTA
 * chooser, SM-MULTI-5) and the dashboard — not here.
 *
 * Pure presentational component — no IO — so it unit-tests offline.
 */

import Link from "next/link";
import { TIER_ORDER, getTierLabel, type TierId } from "@/config/tiers";

interface CapReachedCardProps {
  /** Account tier the ceiling is computed from (409 body `tier`). */
  tier: string;
  /** Current count of non-deprovisioned substrates on the account. */
  activeCount: number;
  /** Max instances the account's tier allows. */
  ceiling: number;
  /** When provided, renders a Close button (drawer/modal context). */
  onClose?: () => void;
}

/** The next tier up from `tier` in canonical order, or null if already top. */
function nextTierUp(tier: string): TierId | null {
  const idx = TIER_ORDER.indexOf(tier as TierId);
  if (idx === -1 || idx >= TIER_ORDER.length - 1) return null;
  return TIER_ORDER[idx + 1];
}

export function CapReachedCard({ tier, activeCount, ceiling, onClose }: CapReachedCardProps) {
  const tierLabel = getTierLabel(tier);
  const next = nextTierUp(tier);
  const nextLabel = next ? getTierLabel(next) : null;
  const instanceWord = ceiling === 1 ? "instance" : "instances";

  return (
    <div
      data-testid="cap-reached-card"
      role="alert"
      className="m-4 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-4 text-sm text-white/80"
    >
      <p className="mb-1 font-semibold text-white">
        You&apos;ve reached your plan&apos;s instance limit
      </p>

      <p className="mb-3 leading-relaxed">
        Your <span className="font-medium text-white">{tierLabel}</span> plan includes {ceiling}{" "}
        memory {instanceWord}, and you&apos;re already running {activeCount}.{" "}
        {nextLabel ? (
          <>
            To run another, upgrade this instance to{" "}
            <span className="font-medium text-white">{nextLabel}</span> — your memory and data stay
            exactly as they are.
          </>
        ) : (
          <>You&apos;re on the highest tier. Deprovision an instance to free a slot.</>
        )}
      </p>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/dashboard"
          data-testid="cap-reached-upgrade-cta"
          className="bg-brand-500 hover:bg-brand-400 ring-brand-400/30 inline-flex items-center justify-center rounded-md px-4 py-2 text-xs font-semibold text-white ring-1 transition-all"
        >
          {nextLabel ? `Upgrade this instance to ${nextLabel}` : "Manage my plan"}
        </Link>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-md border border-white/10 px-4 py-2 text-xs font-medium text-white/70 hover:bg-white/5"
          >
            Close
          </button>
        )}
      </div>

      <p className="mt-3 text-xs text-white/50">
        Prefer to start fresh? You can deprovision an existing instance from your{" "}
        <Link href="/dashboard" className="underline underline-offset-2 hover:text-white/80">
          dashboard
        </Link>{" "}
        to free a slot.
      </p>
    </div>
  );
}
