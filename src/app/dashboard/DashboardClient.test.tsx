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

// ── F-BILLING-3 + F-PROV-1 — per-substrate attention banners ──────────────────

describe("DashboardClient — pending_payment state (F-BILLING-3)", () => {
  stubFetch();

  const pendingSubstrate = makeSubstrate({
    status: "pending_payment",
    slug: "pending-one",
  });

  it('renders the "Payment Pending" badge for pending_payment status', () => {
    // This is the specific F-BILLING-3 regression guard — before the fix the
    // badge fell through to the default gray pill with the literal string
    // "pending_payment". Customers now see a dedicated amber label.
    render(<DashboardClient account={baseAccount} substrates={[pendingSubstrate]} />);
    expect(screen.getByText("Payment Pending")).toBeInTheDocument();
    // Ensure we're not accidentally rendering the raw snake_case status.
    expect(screen.queryByText("pending_payment")).not.toBeInTheDocument();
  });

  it("renders the SubstrateStateBanner above the grid for pending_payment", () => {
    render(<DashboardClient account={baseAccount} substrates={[pendingSubstrate]} />);
    const banner = screen.getByTestId("substrate-banner-pending-one");
    expect(banner).toHaveAttribute("data-variant", "pending_payment");
    expect(banner).toHaveTextContent("pending-one");
    expect(screen.getByRole("button", { name: /Complete payment/i })).toBeInTheDocument();
  });

  it("does NOT render a banner for a healthy running substrate", () => {
    render(<DashboardClient account={baseAccount} substrates={[runningSubstrate]} />);
    expect(screen.queryByTestId(/substrate-banner-/)).not.toBeInTheDocument();
  });

  it("stacks one banner per attention-worthy substrate", () => {
    const anotherPending = makeSubstrate({
      id: "sub_2",
      status: "pending_payment",
      slug: "pending-two",
    });
    render(
      <DashboardClient
        account={baseAccount}
        substrates={[pendingSubstrate, runningSubstrate, anotherPending]}
      />,
    );
    // Two pending substrates → two banners; the running one stays silent.
    expect(screen.getByTestId("substrate-banner-pending-one")).toBeInTheDocument();
    expect(screen.getByTestId("substrate-banner-pending-two")).toBeInTheDocument();
    expect(screen.queryByTestId("substrate-banner-bold-junction")).not.toBeInTheDocument();
  });
});

describe("DashboardClient — provision_failed state (F-PROV-1)", () => {
  stubFetch();

  const failedStandalone = makeSubstrate({
    status: "provision_failed",
    slug: "doomed-alpha",
    hasActiveSubscription: false, // focus this block on the banner, not the cancel footer
  });

  it("renders the support-CTA banner above the grid for provision_failed", () => {
    render(<DashboardClient account={baseAccount} substrates={[failedStandalone]} />);
    const banner = screen.getByTestId("substrate-banner-doomed-alpha");
    expect(banner).toHaveAttribute("data-variant", "provision_failed");
    expect(banner).toHaveTextContent("doomed-alpha");
  });

  it("banner CTA links to a mailto: with the slug in the subject", () => {
    render(<DashboardClient account={baseAccount} substrates={[failedStandalone]} />);
    const link = screen.getByRole("link", { name: /Contact support/i });
    const href = link.getAttribute("href") ?? "";
    expect(href.startsWith("mailto:")).toBe(true);
    expect(decodeURIComponent(href)).toContain("Provisioning failed for doomed-alpha");
  });

  it("keeps the existing Provision Failed badge on the card (regression guard)", () => {
    // Before F-PROV-1 the card already showed the badge + red dot; we must
    // not have regressed those.
    render(<DashboardClient account={baseAccount} substrates={[failedStandalone]} />);
    expect(screen.getByText("Provision Failed")).toBeInTheDocument();
  });
});

// ── F-BILLING-2 — read_only badge tooltip + banner ────────────────────────────

describe("DashboardClient — read_only state (F-BILLING-2)", () => {
  stubFetch();

  const readOnlySubstrate = makeSubstrate({
    status: "read_only",
    slug: "frozen-peak",
  });

  it('renders the "Read Only" badge for read_only status', () => {
    render(<DashboardClient account={baseAccount} substrates={[readOnlySubstrate]} />);
    expect(screen.getByText("Read Only")).toBeInTheDocument();
    // Regression guard: never show the raw snake_case status string.
    expect(screen.queryByText("read_only")).not.toBeInTheDocument();
  });

  it("adds a tooltip to the Read Only badge explaining reads still work", () => {
    // F-BILLING-2 key UX: the amber badge reads as "warning". The tooltip is
    // the customer's first line of self-service context — it must clarify
    // that reads still work and point them at billing.
    render(<DashboardClient account={baseAccount} substrates={[readOnlySubstrate]} />);
    const badge = screen.getByText("Read Only");
    const title = badge.getAttribute("title") ?? "";
    expect(title).toMatch(/reads still work/i);
    expect(title).toMatch(/billing/i);
  });

  it("adds tooltips to other status badges too (regression guard on the titles map)", () => {
    // Guard against a refactor that drops the titles map. We assert on
    // `running` because it's the most common state and the tooltip copy is
    // stable.
    render(<DashboardClient account={baseAccount} substrates={[runningSubstrate]} />);
    const badge = screen.getByText("Running");
    expect(badge.getAttribute("title")).toMatch(/running/i);
  });

  it("renders the read_only SubstrateStateBanner above the grid", () => {
    render(<DashboardClient account={baseAccount} substrates={[readOnlySubstrate]} />);
    const banner = screen.getByTestId("substrate-banner-frozen-peak");
    expect(banner).toHaveAttribute("data-variant", "read_only");
    expect(banner).toHaveTextContent("frozen-peak");
    expect(screen.getByRole("button", { name: /Manage billing/i })).toBeInTheDocument();
  });

  it("banner explains reads still work (customer calm)", () => {
    // Copy must explicitly distinguish read_only from a total outage — this is
    // the single most important piece of read_only UX.
    render(<DashboardClient account={baseAccount} substrates={[readOnlySubstrate]} />);
    expect(screen.getByText(/reads still work/i)).toBeInTheDocument();
  });

  it("stacks banners correctly when mixing read_only with healthy substrates", () => {
    render(
      <DashboardClient account={baseAccount} substrates={[readOnlySubstrate, runningSubstrate]} />,
    );
    expect(screen.getByTestId("substrate-banner-frozen-peak")).toBeInTheDocument();
    // Running substrate must stay silent — no banner for healthy states.
    expect(screen.queryByTestId("substrate-banner-bold-junction")).not.toBeInTheDocument();
  });
});

// ── Dashboard top-nav links — regression guard (2026-04-19) ───────────────────
//
// Regression: the Docs link in the dashboard's top nav was a hardcoded
// `<a href="https://mmpm.co.nz/docs" target="_blank">` — a leftover from before
// the /docs route existed on parametric-memory.dev. Every other surface uses
// a client-side `<Link href="/docs">`, so the dashboard was the odd one out
// and kicked users out to a different domain.
//
// The fix swaps in `<Link href="/docs">`. These tests ensure a future refactor
// doesn't re-introduce the external URL or open-in-new-tab behaviour.

describe("DashboardClient — top-nav Docs link (regression guard)", () => {
  stubFetch();

  it("Docs link points to the internal /docs route, not an external domain", () => {
    render(<DashboardClient account={baseAccount} substrates={[runningSubstrate]} />);
    const docsLink = screen.getByRole("link", { name: /^docs$/i });
    expect(docsLink).toHaveAttribute("href", "/docs");
  });

  it("Docs link does not open in a new tab (stays in-app)", () => {
    render(<DashboardClient account={baseAccount} substrates={[runningSubstrate]} />);
    const docsLink = screen.getByRole("link", { name: /^docs$/i });
    expect(docsLink).not.toHaveAttribute("target");
    expect(docsLink).not.toHaveAttribute("rel", expect.stringMatching(/noopener/));
  });

  it("Docs link href never references mmpm.co.nz (external-domain regression)", () => {
    render(<DashboardClient account={baseAccount} substrates={[runningSubstrate]} />);
    const docsLink = screen.getByRole("link", { name: /^docs$/i });
    const href = docsLink.getAttribute("href") ?? "";
    expect(href).not.toMatch(/mmpm\.co\.nz/);
    expect(href).not.toMatch(/^https?:\/\//);
  });
});
