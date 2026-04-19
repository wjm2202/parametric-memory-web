interface CapacityBadgeProps {
  status: "open" | "waitlist" | "paused";
  slotsRemaining: number | null;
  /**
   * Total configured slots for this tier on the active shared host
   * (compute_hosts.max_tenants). When both this and slotsRemaining are
   * numbers, the badge renders "N / M slots available" so customers
   * see real headroom rather than a vague "Available". Null for
   * unlimited tiers (team) or when compute didn't return the field.
   */
  maxSlots?: number | null;
  /** When true, shows a "Checking availability…" spinner (CTA click). */
  checking?: boolean;
  /** When false, the mount fetch hasn't resolved yet — show a subtle loading state. */
  hydrated?: boolean;
}

export function CapacityBadge({
  status,
  slotsRemaining,
  maxSlots,
  checking,
  hydrated,
}: CapacityBadgeProps) {
  // Before mount fetch resolves — subtle placeholder so there's no layout jump
  if (hydrated === false) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium ring-1 ring-white/10">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/30" />
        <span className="text-white/30">Loading…</span>
      </div>
    );
  }

  // CTA-click capacity check in flight
  if (checking) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium ring-1 ring-white/10">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/40" />
        <span className="text-white/40">Checking availability…</span>
      </div>
    );
  }

  // Low capacity: open with <= 5 slots
  const isLowCapacity = status === "open" && slotsRemaining !== null && slotsRemaining <= 5;

  if (isLowCapacity) {
    const slotText = slotsRemaining === 1 ? "slot" : "slots";
    // When we also know the ceiling, show "3 / 30 slots left" so the
    // urgency is grounded in the actual host size rather than a bare
    // number that could be read as either "lots" or "almost none".
    const label =
      maxSlots !== null && maxSlots !== undefined
        ? `${slotsRemaining} / ${maxSlots} ${slotText} left`
        : `${slotsRemaining} ${slotText} left`;
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium ring-1 ring-amber-400/20">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
        <span className="text-amber-400">{label}</span>
      </div>
    );
  }

  if (status === "open") {
    // Healthy headroom: render "12 / 30 slots available" when we know
    // both numbers — shows customers the shared-substrate is not a black
    // box. Fall back to the plain "Available" badge when the ceiling is
    // unknown (team / fail-open / tier not in snapshot).
    const slotText = slotsRemaining === 1 ? "slot" : "slots";
    const hasCount =
      slotsRemaining !== null &&
      slotsRemaining !== undefined &&
      maxSlots !== null &&
      maxSlots !== undefined;
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium ring-1 ring-emerald-400/20">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        <span className="text-emerald-400">
          {hasCount ? `${slotsRemaining} / ${maxSlots} ${slotText} available` : "Available"}
        </span>
      </div>
    );
  }

  if (status === "waitlist") {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium ring-1 ring-amber-400/20">
        <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        <span className="text-amber-400">Full — join waitlist</span>
      </div>
    );
  }

  // status === 'paused'
  return (
    <div className="bg-surface-800 ring-surface-700 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1">
      <div className="bg-surface-400 h-1.5 w-1.5 rounded-full" />
      <span className="text-surface-400">Maintenance</span>
    </div>
  );
}
