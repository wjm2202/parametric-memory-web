/**
 * Tests for DashboardClient — focused on the SubstrateCard and StatusBadge
 * changes: provision_failed label/style, health dot rendering, cancel subscription flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DashboardClient from "./DashboardClient";

// ── Next.js mocks ─────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseAccount = {
  id: "acc_1",
  email: "test@example.com",
  name: null,
  tier: "starter",
  status: "active",
  balanceCents: 0,
  createdAt: "2026-01-01T00:00:00Z",
};

function makeSubstrate(overrides: Partial<ReturnType<typeof makeSubstrate>> = {}) {
  return {
    id: "sub_1",
    slug: "bold-junction",
    tier: "starter",
    status: "running",
    createdAt: "2026-04-13T00:00:00Z",
    updatedAt: "2026-04-13T00:00:00Z",
    hasActiveSubscription: false,
    renewsAt: null,
    ...overrides,
  };
}

const runningSubstrate = makeSubstrate({ status: "running" });
const failedSubstrate = makeSubstrate({ status: "provision_failed", hasActiveSubscription: true });

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Stub fetch so billing/status call doesn't throw. */
function stubFetch() {
  const original = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    });
  });
  afterEach(() => {
    globalThis.fetch = original;
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DashboardClient — StatusBadge", () => {
  stubFetch();

  it('renders "Provision Failed" label for provision_failed status', () => {
    render(<DashboardClient account={baseAccount} substrates={[failedSubstrate]} />);
    expect(screen.getByText("Provision Failed")).toBeInTheDocument();
  });

  it('renders "Running" label for running status', () => {
    render(<DashboardClient account={baseAccount} substrates={[runningSubstrate]} />);
    expect(screen.getByText("Running")).toBeInTheDocument();
  });
});

describe("DashboardClient — SubstrateCard health indicators", () => {
  stubFetch();

  it("shows animated ping dot for running substrate", () => {
    const { container } = render(
      <DashboardClient account={baseAccount} substrates={[runningSubstrate]} />,
    );
    // The pinging dot has animate-ping class
    const pingDot = container.querySelector(".animate-ping");
    expect(pingDot).toBeInTheDocument();
  });

  it("shows static red dot for provision_failed substrate", () => {
    const { container } = render(
      <DashboardClient account={baseAccount} substrates={[failedSubstrate]} />,
    );
    // Red dot has bg-red-500 and no animate-ping
    const redDot = container.querySelector(".bg-red-500:not(.animate-ping)");
    expect(redDot).toBeInTheDocument();
  });

  it("shows no health dot for provisioning substrate", () => {
    const substrate = makeSubstrate({ status: "provisioning" });
    const { container } = render(
      <DashboardClient account={baseAccount} substrates={[substrate]} />,
    );
    expect(container.querySelector(".animate-ping")).not.toBeInTheDocument();
  });
});

describe("DashboardClient — cancel subscription flow", () => {
  stubFetch();

  // hasActiveSubscription: true → Stripe subscription still live, show cancel button
  const deprovisionedSubstrate = makeSubstrate({
    status: "deprovisioned",
    slug: "ashen-north",
    hasActiveSubscription: true,
  });
  const failedSub = makeSubstrate({
    status: "provision_failed",
    slug: "bad-start",
    id: "sub_2",
    hasActiveSubscription: true,
  });
  // hasActiveSubscription: false → already cancelled in Stripe, hide cancel button
  const alreadyCancelled = makeSubstrate({
    status: "deprovisioned",
    slug: "gone-away",
    id: "sub_3",
    hasActiveSubscription: false,
  });

  it("shows 'Cancel subscription' button on deprovisioned cards", () => {
    render(<DashboardClient account={baseAccount} substrates={[deprovisionedSubstrate]} />);
    expect(screen.getByRole("button", { name: /cancel subscription/i })).toBeInTheDocument();
  });

  it("shows 'Cancel subscription' button on provision_failed cards", () => {
    render(<DashboardClient account={baseAccount} substrates={[failedSub]} />);
    expect(screen.getByRole("button", { name: /cancel subscription/i })).toBeInTheDocument();
  });

  it("does NOT show cancel button on running cards", () => {
    render(<DashboardClient account={baseAccount} substrates={[runningSubstrate]} />);
    expect(screen.queryByRole("button", { name: /cancel subscription/i })).not.toBeInTheDocument();
  });

  it("does NOT show cancel button when subscription is already cancelled in Stripe", () => {
    render(<DashboardClient account={baseAccount} substrates={[alreadyCancelled]} />);
    // Deprovisioned but hasActiveSubscription=false → already gone from Stripe
    expect(screen.queryByRole("button", { name: /cancel subscription/i })).not.toBeInTheDocument();
  });

  it("opens warning modal when cancel button is clicked", () => {
    render(<DashboardClient account={baseAccount} substrates={[deprovisionedSubstrate]} />);
    const cancelBtn = screen.getByRole("button", { name: /cancel subscription/i });
    fireEvent.click(cancelBtn);
    // Modal heading contains the slug
    expect(screen.getByText(/cancel subscription for ashen-north/i)).toBeInTheDocument();
  });

  it("modal warning text is specific to deprovisioned status", () => {
    render(<DashboardClient account={baseAccount} substrates={[deprovisionedSubstrate]} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel subscription/i }));
    expect(screen.getByText(/deprovisioned and its data removed/i)).toBeInTheDocument();
  });

  it("modal warning text is specific to provision_failed status", () => {
    render(<DashboardClient account={baseAccount} substrates={[failedSub]} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel subscription/i }));
    // The copy reads "no containers were ever started" — match on the core phrase.
    expect(screen.getByText(/ever started/i)).toBeInTheDocument();
  });

  it("closes modal when 'Keep it' is clicked", () => {
    render(<DashboardClient account={baseAccount} substrates={[deprovisionedSubstrate]} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel subscription/i }));
    expect(screen.getByText(/cancel subscription for ashen-north/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /keep it/i }));
    expect(screen.queryByText(/cancel subscription for ashen-north/i)).not.toBeInTheDocument();
  });

  it("closes modal when backdrop is clicked", () => {
    const { container } = render(
      <DashboardClient account={baseAccount} substrates={[deprovisionedSubstrate]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel subscription/i }));
    // Click the backdrop (fixed inset-0 overlay)
    const backdrop = container.querySelector(".fixed.inset-0");
    expect(backdrop).toBeInTheDocument();
    fireEvent.click(backdrop!);
    expect(screen.queryByText(/cancel subscription for ashen-north/i)).not.toBeInTheDocument();
  });
});
