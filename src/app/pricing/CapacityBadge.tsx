interface CapacityBadgeProps {
  status: "open" | "waitlist" | "paused";
  slotsRemaining: number | null;
  /** When true, shows a "Checking availability…" spinner (CTA click). */
  checking?: boolean;
  /** When false, the mount fetch hasn't resolved yet — show a subtle loading state. */
  hydrated?: boolean;
}

export function CapacityBadge({ status, slotsRemaining, checking, hydrated }: CapacityBadgeProps) {
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
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium ring-1 ring-amber-400/20">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
        <span className="text-amber-400">
          {slotsRemaining} {slotText} left
        </span>
      </div>
    );
  }

  if (status === "open") {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium ring-1 ring-emerald-400/20">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        <span className="text-emerald-400">Available</span>
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
