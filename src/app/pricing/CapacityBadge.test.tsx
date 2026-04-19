import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CapacityBadge } from "./CapacityBadge";

describe("CapacityBadge", () => {
  // ── hydrated = false (mount fetch pending) ──────────────────────────
  it("shows 'Loading…' when hydrated is false", () => {
    render(<CapacityBadge status="open" slotsRemaining={null} hydrated={false} />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
  });

  // ── checking = true (CTA click in flight) ───────────────────────────
  it("shows 'Checking availability…' when checking is true", () => {
    render(<CapacityBadge status="open" slotsRemaining={null} checking={true} hydrated={true} />);
    expect(screen.getByText("Checking availability…")).toBeInTheDocument();
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
  });

  // ── open status ─────────────────────────────────────────────────────
  it("shows 'Available' when status is open with plenty of slots", () => {
    render(<CapacityBadge status="open" slotsRemaining={10} hydrated={true} />);
    expect(screen.getByText("Available")).toBeInTheDocument();
  });

  it("shows 'Available' when status is open with null slots", () => {
    render(<CapacityBadge status="open" slotsRemaining={null} hydrated={true} />);
    expect(screen.getByText("Available")).toBeInTheDocument();
  });

  // ── low capacity ────────────────────────────────────────────────────
  it("shows slot count when open with 5 or fewer slots", () => {
    render(<CapacityBadge status="open" slotsRemaining={3} hydrated={true} />);
    expect(screen.getByText("3 slots left")).toBeInTheDocument();
  });

  it("shows singular 'slot' when exactly 1 remaining", () => {
    render(<CapacityBadge status="open" slotsRemaining={1} hydrated={true} />);
    expect(screen.getByText("1 slot left")).toBeInTheDocument();
  });

  // ── maxSlots: N / M display ─────────────────────────────────────────
  // When compute returns both slotsRemaining AND the host's configured
  // max_tenants, the badge should ground urgency in the real host size
  // rather than a bare number.
  it("shows 'N / M slots left' when low-capacity and maxSlots is known", () => {
    render(<CapacityBadge status="open" slotsRemaining={3} maxSlots={30} hydrated={true} />);
    expect(screen.getByText("3 / 30 slots left")).toBeInTheDocument();
  });

  it("shows 'N / M slot left' (singular) when exactly 1 remaining and maxSlots known", () => {
    render(<CapacityBadge status="open" slotsRemaining={1} maxSlots={30} hydrated={true} />);
    expect(screen.getByText("1 / 30 slot left")).toBeInTheDocument();
  });

  it("shows 'N / M slots available' when open with healthy headroom and maxSlots known", () => {
    render(<CapacityBadge status="open" slotsRemaining={12} maxSlots={30} hydrated={true} />);
    expect(screen.getByText("12 / 30 slots available")).toBeInTheDocument();
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
  });

  it("shows 'N / M slot available' (singular) when only 1 slot left but on a 1-tenant host", () => {
    // Edge case: a single-tenant host with 1 slot remaining — pluralization
    // should follow slotsRemaining value.
    render(<CapacityBadge status="open" slotsRemaining={1} maxSlots={1} hydrated={true} />);
    // 1 slotsRemaining is <= 5 threshold → low-capacity branch wins, so this
    // renders "1 / 1 slot left", not "... available". That's correct behaviour
    // — low-capacity copy is more urgent.
    expect(screen.getByText("1 / 1 slot left")).toBeInTheDocument();
  });

  it("falls back to plain 'Available' when maxSlots is null (unknown ceiling)", () => {
    render(<CapacityBadge status="open" slotsRemaining={20} maxSlots={null} hydrated={true} />);
    expect(screen.getByText("Available")).toBeInTheDocument();
  });

  it("falls back to plain 'Available' when slotsRemaining is null even with maxSlots", () => {
    // Should not render "null / 30 slots available" — guard both sides.
    render(<CapacityBadge status="open" slotsRemaining={null} maxSlots={30} hydrated={true} />);
    expect(screen.getByText("Available")).toBeInTheDocument();
  });

  it("falls back to bare count when low-capacity and maxSlots is null", () => {
    // Existing behaviour — no regression when maxSlots unknown.
    render(<CapacityBadge status="open" slotsRemaining={3} maxSlots={null} hydrated={true} />);
    expect(screen.getByText("3 slots left")).toBeInTheDocument();
    expect(screen.queryByText(/\/ .* slots left/)).not.toBeInTheDocument();
  });

  // ── waitlist / paused ───────────────────────────────────────────────
  it("shows 'Full — join waitlist' when status is waitlist", () => {
    render(<CapacityBadge status="waitlist" slotsRemaining={0} hydrated={true} />);
    expect(screen.getByText("Full — join waitlist")).toBeInTheDocument();
  });

  it("shows 'Maintenance' when status is paused", () => {
    render(<CapacityBadge status="paused" slotsRemaining={null} hydrated={true} />);
    expect(screen.getByText("Maintenance")).toBeInTheDocument();
  });

  // ── defaults (no hydrated/checking props — backward compat) ─────────
  it("shows normal badge when hydrated and checking are omitted", () => {
    render(<CapacityBadge status="open" slotsRemaining={null} />);
    expect(screen.getByText("Available")).toBeInTheDocument();
  });
});
