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
