"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { CapacityBadge } from "./CapacityBadge";
import { PricingCTA } from "./PricingCTA";

type CapacityStatus = "open" | "waitlist" | "paused";

interface TierCapacity {
  status: CapacityStatus;
  slotsRemaining: number | null;
  /**
   * Total configured slots for this tier on the active shared host
   * (compute_hosts.max_tenants). Null for unlimited tiers (team) or when
   * compute didn't return the field (e.g. fail-open fallback). Paired with
   * slotsRemaining so the badge can render "12 / 30 slots available".
   */
  maxSlots: number | null;
  message: string | null;
}

interface PricingCardClientProps {
  tierId: string;
  tierName: string;
  ctaLabel: string;
  isLoggedIn: boolean;
  children: React.ReactNode;
}

/** Minimum ms between capacity fetches triggered by CTA clicks. */
const DEBOUNCE_MS = 3_000;

/**
 * Client wrapper for pricing card capacity state.
 *
 * Capacity data is event-driven — no ISR background polling.
 *
 *  1. On mount: fires a single GET /api/capacity to hydrate the badge
 *     with the last cached result from compute (fast, no SSH, reads DB).
 *  2. On CTA click: fires another GET /api/capacity for the freshest
 *     cached data before proceeding to Stripe checkout.
 *  3. Debounced: rapid CTA clicks reuse the last result within 3 s.
 *
 * Both calls hit compute's existing 60 s in-memory cache, which reads
 * from DB-backed telemetry — never SSH. The health signals that feed
 * that DB are only written on meaningful events (tenant count change,
 * threshold crossing) on the compute side.
 */
export function PricingCardClient({
  tierId,
  tierName,
  ctaLabel,
  isLoggedIn,
  children,
}: PricingCardClientProps) {
  const [capacity, setCapacity] = useState<TierCapacity>({
    status: "open",
    slotsRemaining: null,
    maxSlots: null,
    message: null,
  });
  const [checking, setChecking] = useState(false);
  /** Tracks whether the mount fetch has resolved so the badge can show real data. */
  const [hydrated, setHydrated] = useState(false);
  /** Timestamp of the last successful capacity fetch — used for debounce. */
  const lastCheckRef = useRef<number>(0);

  // ── Shared fetch logic ──────────────────────────────────────────────
  const fetchCapacity = useCallback(async (): Promise<TierCapacity> => {
    const res = await fetch("/api/capacity", { cache: "no-store" });
    if (!res.ok) throw new Error(`capacity ${res.status}`);

    const data = await res.json();
    const tierData = data.tiers?.[tierId];

    if (tierData) {
      return {
        status: tierData.status ?? "open",
        slotsRemaining: tierData.slotsRemaining ?? null,
        maxSlots: tierData.maxSlots ?? null,
        message: tierData.message ?? null,
      };
    }
    // Tier not in response — fail open
    return { status: "open", slotsRemaining: null, maxSlots: null, message: null };
  }, [tierId]);

  // ── Mount: hydrate badge with cached capacity ───────────────────────
  useEffect(() => {
    let cancelled = false;

    fetchCapacity()
      .then((fresh) => {
        if (!cancelled) {
          setCapacity(fresh);
          lastCheckRef.current = Date.now();
        }
      })
      .catch(() => {
        // Fail open — keep default "open" state
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchCapacity]);

  // ── CTA click: fresh check with debounce ────────────────────────────
  const checkCapacity = useCallback(async (): Promise<TierCapacity> => {
    // Debounce: if we checked recently, reuse the last result
    if (Date.now() - lastCheckRef.current < DEBOUNCE_MS) {
      return capacity;
    }

    setChecking(true);
    try {
      const fresh = await fetchCapacity();
      setCapacity(fresh);
      lastCheckRef.current = Date.now();
      return fresh;
    } catch {
      // Fail open — let the buyer proceed
      return capacity;
    } finally {
      setChecking(false);
    }
  }, [fetchCapacity, capacity]);

  return (
    <>
      <CapacityBadge
        status={capacity.status}
        slotsRemaining={capacity.slotsRemaining}
        maxSlots={capacity.maxSlots}
        checking={checking}
        hydrated={hydrated}
      />
      {/* Children slot: price block sits between badge and CTA */}
      {children}
      <PricingCTA
        tierId={tierId}
        tierName={tierName}
        label={ctaLabel}
        isLoggedIn={isLoggedIn}
        capacityStatus={capacity.status}
        capacityMessage={capacity.message}
        onCheckCapacity={checkCapacity}
        checkingCapacity={checking}
      />
    </>
  );
}
