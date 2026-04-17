/**
 * Tests for AdminClient:
 *   1. provision_failed callout renders correctly
 *   2. Deprovision available for provision_failed regardless of tier
 *   3. Cancel Subscription hidden for provision_failed
 *   4. MCP block hidden for provision_failed (not running)
 *   5. Health/SSL badges render from substrate.health data
 *   6. Tier-change wiring — progress banner + ChangePlanButton
 *   7. ?upgrade=pending | ?upgrade=cancelled toast handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AdminClient from "./AdminClient";
import { IDLE_TIER_CHANGE, type TierChangePollResult } from "@/hooks/useTierChangePoll";
import type { CurrentTierLimits } from "./ChangePlanSheet";

// ── Hoisted spy state ─────────────────────────────────────────────────────────
//
// vi.mock() factories are hoisted to the top of the file, BEFORE any const
// declarations. That means plain `const mockX = vi.fn()` can't be referenced
// from inside a factory — the factory runs first and sees `undefined` (or
// throws TDZ on a real const). `vi.hoisted()` is the escape hatch: its body
// is hoisted alongside the mock calls, so the returned object is available
// when the factory executes.

const h = vi.hoisted(() => {
  return {
    mockSearchParamsGet: vi.fn<(key: string) => string | null>(() => null),
    mockUseTierChangePoll: vi.fn<(slug: string | null | undefined) => TierChangePollResult>(),
    mockBannerRender: vi.fn(),
    mockButtonRender: vi.fn(),
    // mockToast is callable (neutral toast) AND carries .info/.success/.error
    // methods. Object.assign on a fresh vi.fn gives us both shapes.
    mockToast: Object.assign(vi.fn(), {
      info: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
    }),
  };
});

// ── Next.js mocks ─────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: h.mockSearchParamsGet }),
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

vi.mock("@/components/ui/RotationStepper", () => ({
  RotationStepper: () => <div data-testid="rotation-stepper" />,
}));

vi.mock("@/components/ui/UpdateInstructions", () => ({
  UpdateInstructions: () => <div data-testid="update-instructions" />,
}));

// ── sonner mock ───────────────────────────────────────────────────────────────

vi.mock("sonner", () => ({
  toast: h.mockToast,
  Toaster: () => null,
}));

// ── useTierChangePoll mock ────────────────────────────────────────────────────
//
// The real hook polls /api/billing/tier-change/:slug on a 3s interval. We
// replace the hook itself with our spy so AdminClient sees a controllable
// result without any fetch traffic. IDLE_TIER_CHANGE is re-exported from the
// real module for anyone importing it in this file.

vi.mock("@/hooks/useTierChangePoll", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useTierChangePoll")>();
  return {
    ...actual,
    useTierChangePoll: (slug: string | null | undefined) => h.mockUseTierChangePoll(slug),
  };
});

// ── TierChangeProgressBanner + ChangePlanButton stubs ────────────────────────
//
// We mock these to minimal shells so:
//   (a) the AdminClient tests don't pull in the full banner / sheet tree;
//   (b) we can assert AdminClient wires up the right props.

vi.mock("./TierChangeProgressBanner", () => ({
  TierChangeProgressBanner: (props: { result: TierChangePollResult; currentTierName: string }) => {
    h.mockBannerRender(props);
    return (
      <div data-testid="mock-progress-banner" data-tier-name={props.currentTierName}>
        banner(state={props.result.state})
      </div>
    );
  },
}));

vi.mock("./ChangePlanButton", () => ({
  ChangePlanButton: (props: {
    substrateSlug: string;
    currentTier: string;
    currentLimits: CurrentTierLimits | null;
    nextBillingDate: Date | null;
    pollResult: TierChangePollResult;
    className?: string;
  }) => {
    h.mockButtonRender(props);
    return (
      <button
        data-testid="mock-change-plan-button"
        data-slug={props.substrateSlug}
        data-tier={props.currentTier}
      >
        change plan
      </button>
    );
  },
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

function makeSubstrate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "sub_1",
    slug: "bold-junction",
    tier: "starter",
    status: "running",
    mcpEndpoint: null,
    hostingModel: "dedicated",
    provisioning: null,
    health: null,
    maxAtoms: 10000,
    maxBootstrapsMonth: 100,
    maxStorageMB: 512,
    atomCount: 0,
    bootstrapCountMonth: 0,
    storageUsedMB: 0,
    provisionedAt: null,
    gracePeriodEndsAt: null,
    cancelAt: null,
    keyUnclaimed: false,
    ...overrides,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function renderAdmin(substrateOverrides: Partial<Record<string, unknown>> = {}) {
  const substrate = makeSubstrate(substrateOverrides);
  return render(
    <AdminClient
      account={baseAccount}
      slug={substrate.slug as string}
      initialSubstrate={substrate as Parameters<typeof AdminClient>[0]["initialSubstrate"]}
    />,
  );
}

// ── Global lifecycle — reset all the spy/mock state between tests ───────────
//
// Every test block relies on these mocks starting clean. The individual test
// groups below layer their own beforeEach/afterEach on top (for fetch stubbing
// and URL reset), but resetting the spies up here keeps things predictable.

beforeEach(() => {
  h.mockSearchParamsGet.mockReset();
  h.mockSearchParamsGet.mockImplementation(() => null);
  h.mockUseTierChangePoll.mockReset();
  h.mockUseTierChangePoll.mockImplementation(() => IDLE_TIER_CHANGE);
  h.mockBannerRender.mockReset();
  h.mockButtonRender.mockReset();
  h.mockToast.mockReset();
  h.mockToast.info.mockReset();
  h.mockToast.success.mockReset();
  h.mockToast.error.mockReset();
});

// ── provision_failed callout ──────────────────────────────────────────────────

describe("AdminClient — provision_failed callout", () => {
  stubFetch();

  it("shows provisioning failed callout for provision_failed status", () => {
    renderAdmin({ status: "provision_failed" });
    expect(screen.getByText("Provisioning failed")).toBeInTheDocument();
  });

  it("shows 'Deprovision & start fresh' button in the callout", () => {
    renderAdmin({ status: "provision_failed" });
    // There may be multiple deprovision buttons (callout + danger zone) — at least one should exist
    const btns = screen.getAllByRole("button", { name: /deprovision/i });
    expect(btns.length).toBeGreaterThanOrEqual(1);
  });

  it("shows contact support link with correct mailto", () => {
    renderAdmin({ status: "provision_failed", slug: "my-slug" });
    const link = screen.getByRole("link", { name: /contact support/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("support@parametric-memory.dev"));
  });

  it("does NOT show the callout for running status", () => {
    renderAdmin({ status: "running", mcpEndpoint: null });
    expect(screen.queryByText("Provisioning failed")).not.toBeInTheDocument();
  });
});

// ── Danger Zone ───────────────────────────────────────────────────────────────

describe("AdminClient — Danger Zone", () => {
  stubFetch();

  // For provision_failed, the Danger Zone block is intentionally suppressed:
  // the callout above it already exposes a "Deprovision & start fresh" button,
  // which is the primary UX (see AdminClient.tsx: "provision_failed uses the
  // callout above"). These two tests just verify *some* deprovision action
  // is reachable regardless of tier — /deprovision/i matches the callout
  // button. The free-tier test below uses the tighter /deprovision substrate/i
  // because that state renders the Danger Zone button, not the callout.
  it("shows a Deprovision action for provision_failed Starter tier", () => {
    renderAdmin({ status: "provision_failed", tier: "starter" });
    expect(screen.getByRole("button", { name: /deprovision/i })).toBeInTheDocument();
  });

  it("shows a Deprovision action for provision_failed Pro tier", () => {
    renderAdmin({ status: "provision_failed", tier: "pro" });
    expect(screen.getByRole("button", { name: /deprovision/i })).toBeInTheDocument();
  });

  it("shows Deprovision button for free tier (existing behaviour)", () => {
    renderAdmin({ status: "running", tier: "free" });
    expect(screen.getByRole("button", { name: /deprovision substrate/i })).toBeInTheDocument();
  });

  it("does NOT show Deprovision for running non-free tier without cancelAt", () => {
    renderAdmin({ status: "running", tier: "starter", cancelAt: null });
    expect(
      screen.queryByRole("button", { name: /deprovision substrate/i }),
    ).not.toBeInTheDocument();
  });

  it("does NOT show Cancel Subscription for provision_failed", () => {
    renderAdmin({ status: "provision_failed", tier: "starter", cancelAt: null });
    expect(screen.queryByRole("button", { name: /cancel subscription/i })).not.toBeInTheDocument();
  });

  it("shows Cancel Subscription for running non-free tier without cancelAt", () => {
    renderAdmin({ status: "running", tier: "starter", cancelAt: null });
    expect(screen.getByRole("button", { name: /cancel subscription/i })).toBeInTheDocument();
  });
});

// ── MCP block ─────────────────────────────────────────────────────────────────

describe("AdminClient — MCP block", () => {
  stubFetch();

  it("does NOT show MCP connection block for provision_failed", () => {
    renderAdmin({ status: "provision_failed", mcpEndpoint: "https://example.com/mcp" });
    expect(screen.queryByText("MCP Connection")).not.toBeInTheDocument();
  });

  it("shows MCP connection block for running with endpoint", () => {
    renderAdmin({ status: "running", mcpEndpoint: "https://example.com/mcp" });
    expect(screen.getByText("MCP Connection")).toBeInTheDocument();
  });
});

// ── Health badges ─────────────────────────────────────────────────────────────

const fullHealth = {
  droplet: { status: "active", ip: "192.0.2.10", sshReady: true },
  substrate: { status: "running", mcpEndpoint: "https://example.com/mcp", reachable: true },
  https: { configured: true, endpoint: "https://example.com/mcp" },
};

describe("AdminClient — health badges", () => {
  stubFetch();

  it("shows SSL badge when https.configured is true", () => {
    renderAdmin({ status: "running", health: fullHealth });
    expect(screen.getByText("SSL")).toBeInTheDocument();
  });

  it("shows MCP badge when substrate.reachable is true", () => {
    renderAdmin({ status: "running", health: fullHealth });
    expect(screen.getByText("MCP")).toBeInTheDocument();
  });

  it("shows SSH badge when droplet.sshReady is true", () => {
    renderAdmin({ status: "running", health: fullHealth });
    expect(screen.getByText("SSH")).toBeInTheDocument();
  });

  it("shows droplet IP pill when ip is present", () => {
    renderAdmin({ status: "running", health: fullHealth });
    expect(screen.getByText("192.0.2.10")).toBeInTheDocument();
  });

  it("does NOT show health badges when health is null", () => {
    renderAdmin({ status: "running", health: null });
    expect(screen.queryByText("SSL")).not.toBeInTheDocument();
    expect(screen.queryByText("MCP")).not.toBeInTheDocument();
    expect(screen.queryByText("SSH")).not.toBeInTheDocument();
  });

  it("SSL badge is grey when https.configured is false", () => {
    const health = { ...fullHealth, https: { configured: false, endpoint: null } };
    renderAdmin({ status: "running", health });
    // The SSL badge should exist but without emerald colour classes
    const sslBadge = screen.getByText("SSL").closest("span");
    expect(sslBadge?.className).toContain("zinc");
  });

  it("MCP badge is red when substrate.reachable is false", () => {
    const health = {
      ...fullHealth,
      substrate: { ...fullHealth.substrate, reachable: false },
    };
    renderAdmin({ status: "running", health });
    const mcpBadge = screen.getByText("MCP").closest("span");
    expect(mcpBadge?.className).toContain("red");
  });
});

// ── Merged Billing card ───────────────────────────────────────────────────────
//
// The Billing card and the old standalone Status card were merged on
// 2026-04-15 on user request: "status card should be on billing, that's the
// thing you're paying for". These tests pin the merge so a future refactor
// that re-splits them gets caught.
//
// Invariant: the "Billing" label, the runtime status pill, and the health
// pills (SSL / MCP / SSH / IP) must all share the same ancestor card — the
// card being the nearest element with the `rounded-xl` class, which is how
// every top-level card on this page is framed.

describe("AdminClient — merged Billing + Status card", () => {
  stubFetch();

  /**
   * Walk up from an element to the nearest ancestor with a `rounded-xl`
   * class. That's the card boundary on this page. Returns null if nothing
   * up the tree matches (which would itself be a test failure).
   */
  function closestCard(el: HTMLElement | null): HTMLElement | null {
    let cur: HTMLElement | null = el;
    while (cur) {
      if (
        cur.className &&
        typeof cur.className === "string" &&
        cur.className.includes("rounded-xl")
      ) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  it("renders the Billing label", () => {
    renderAdmin({ status: "running", health: fullHealth });
    expect(screen.getByText("Billing")).toBeInTheDocument();
  });

  it("does NOT render a separate Status card label (merged into Billing)", () => {
    renderAdmin({ status: "running", health: fullHealth });
    // The old standalone card used "Status" as its uppercase label.
    // `Billing` should be the only top-level section label on the merged card.
    expect(screen.queryByText("Status")).not.toBeInTheDocument();
  });

  it("the Billing label and the SSL/MCP/SSH health pills share one card", () => {
    renderAdmin({ status: "running", health: fullHealth });
    const billingCard = closestCard(screen.getByText("Billing"));
    expect(billingCard).not.toBeNull();

    const sslCard = closestCard(screen.getByText("SSL"));
    const mcpCard = closestCard(screen.getByText("MCP"));
    const sshCard = closestCard(screen.getByText("SSH"));

    // All four should resolve to the EXACT same DOM node.
    expect(sslCard).toBe(billingCard);
    expect(mcpCard).toBe(billingCard);
    expect(sshCard).toBe(billingCard);
  });

  it("the runtime status pill ('running') sits inside the Billing card", () => {
    renderAdmin({ status: "running", health: fullHealth });
    const billingCard = closestCard(screen.getByText("Billing"));
    // StatusBadge renders the raw lowercase status string (see the component
    // definition at the top of AdminClient.tsx). If StatusBadge is ever
    // changed to title-case, this assertion needs updating.
    const runningBadge = screen.getByText("running");
    expect(closestCard(runningBadge)).toBe(billingCard);
  });

  it("falls back to substrate.tier when no billingStatus is available", () => {
    // stubFetch mocks /api/admin/billing-status to fail, so billingStatus
    // stays null. The card should still render a tier label taken from
    // substrate.tier so the header never goes blank.
    renderAdmin({ status: "running", tier: "starter", health: fullHealth });
    // getTierLabel("starter") is expected to be "Starter"; if that ever
    // changes, the test fixture needs updating alongside the config.
    expect(screen.getByText("Starter")).toBeInTheDocument();
  });
});

// ── Tier-change wiring — progress banner + ChangePlanButton ─────────────────
//
// The progress banner and ChangePlanButton are both driven by a single shared
// useTierChangePoll instance owned by AdminClient. These tests pin the wiring:
// banner always mounts when there's a substrate, ChangePlanButton mounts only
// when the substrate is running, and both receive the expected props.
//
// TierChangeProgressBanner + ChangePlanButton are mocked at module scope to
// record-prop stubs — we're testing AdminClient's wiring, not the components
// themselves (those have their own test files).

describe("AdminClient — tier-change wiring", () => {
  stubFetch();

  it("mounts the progress banner with the poll result and current tier name", () => {
    renderAdmin({ status: "running", tier: "starter" });

    // The banner stub always renders; we verify its props came through.
    expect(screen.getByTestId("mock-progress-banner")).toBeInTheDocument();

    const lastBannerProps = h.mockBannerRender.mock.calls.at(-1)![0];
    expect(lastBannerProps.result).toBe(IDLE_TIER_CHANGE);
    // getTierLabel("starter") → "Starter"
    expect(lastBannerProps.currentTierName).toBe("Starter");
  });

  it("passes the in-flight poll result through to the banner", () => {
    const inFlight: TierChangePollResult = {
      ...IDLE_TIER_CHANGE,
      state: "processing",
      targetTier: "pro",
      transitionKind: "shared_to_shared",
    };
    h.mockUseTierChangePoll.mockImplementation(() => inFlight);

    renderAdmin({ status: "running", tier: "starter" });

    const lastBannerProps = h.mockBannerRender.mock.calls.at(-1)![0];
    expect(lastBannerProps.result.state).toBe("processing");
    expect(lastBannerProps.result.targetTier).toBe("pro");
  });

  it("mounts ChangePlanButton for running substrates with current limits derived from substrate", () => {
    renderAdmin({
      status: "running",
      tier: "indie",
      maxAtoms: 10_000,
      maxBootstrapsMonth: 1_000,
      maxStorageMB: 500,
    });

    // The button stub is rendered — presence proves the conditional fires.
    expect(screen.getByTestId("mock-change-plan-button")).toBeInTheDocument();

    const lastBtnProps = h.mockButtonRender.mock.calls.at(-1)![0];
    expect(lastBtnProps.substrateSlug).toBe("bold-junction");
    expect(lastBtnProps.currentTier).toBe("indie");
    // Note the casing flip: substrate.maxStorageMB → currentLimits.maxStorageMb.
    expect(lastBtnProps.currentLimits).toEqual({
      maxAtoms: 10_000,
      maxBootstrapsMonth: 1_000,
      maxStorageMb: 500,
    });
    expect(lastBtnProps.pollResult).toBe(IDLE_TIER_CHANGE);
  });

  it("does NOT mount ChangePlanButton when substrate is provision_failed", () => {
    renderAdmin({ status: "provision_failed" });
    expect(screen.queryByTestId("mock-change-plan-button")).not.toBeInTheDocument();
  });

  it("does NOT mount ChangePlanButton when substrate is provisioning", () => {
    renderAdmin({ status: "provisioning", provisioning: null });
    expect(screen.queryByTestId("mock-change-plan-button")).not.toBeInTheDocument();
  });

  it("prefers billingStatus.tier over substrate.tier when both are present", async () => {
    // Wire fetch so /api/billing/status returns a tier different from the
    // substrate's raw tier — exercise the coalescing ?? logic in both the
    // banner's currentTierName and the button's currentTier.
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/billing/status")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ tier: "pro", status: "active", renewalDate: "2026-05-17" }),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });

    try {
      renderAdmin({ status: "running", tier: "starter" });

      // Wait for the billing fetch to resolve, setBillingStatus to run, and
      // the ChangePlanButton to re-render with the billing-derived values.
      await waitFor(() => {
        const lastBtnProps = h.mockButtonRender.mock.calls.at(-1)?.[0];
        expect(lastBtnProps?.currentTier).toBe("pro");
      });

      const lastBtnProps = h.mockButtonRender.mock.calls.at(-1)![0];
      expect(lastBtnProps.currentTier).toBe("pro");
      expect(lastBtnProps.nextBillingDate).toBeInstanceOf(Date);
      expect((lastBtnProps.nextBillingDate as Date).toISOString().startsWith("2026-05-17")).toBe(
        true,
      );
    } finally {
      globalThis.fetch = original;
    }
  });
});

// ── Upgrade query-param toast handling ──────────────────────────────────────
//
// On return from Stripe Checkout, the URL gains a ?upgrade=pending or
// ?upgrade=cancelled query string. AdminClient reads it once, fires the
// matching sonner toast, then strips the param from the URL via
// history.replaceState so a reload doesn't refire.

describe("AdminClient — upgrade query-param toasts", () => {
  stubFetch();

  // history.replaceState is called by the effect. JSDOM supports it, but we
  // spy on it to confirm the strip step actually runs.
  let replaceStateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Reset the URL to a canonical base before each test so the assertions
    // about "upgrade param stripped" are deterministic.
    window.history.replaceState({}, "", "/admin/bold-junction?upgrade=pending");
    replaceStateSpy = vi.spyOn(window.history, "replaceState");
  });

  afterEach(() => {
    replaceStateSpy.mockRestore();
    window.history.replaceState({}, "", "/");
  });

  it("fires toast.info with pending copy when ?upgrade=pending", () => {
    h.mockSearchParamsGet.mockImplementation((key) => (key === "upgrade" ? "pending" : null));
    renderAdmin({ status: "running" });

    expect(h.mockToast.info).toHaveBeenCalledTimes(1);
    const [title, opts] = h.mockToast.info.mock.calls[0];
    expect(title).toBe("Processing your upgrade…");
    expect(opts).toEqual({
      description: expect.stringContaining("confirming your payment"),
    });
  });

  it("fires toast (neutral) with cancelled copy when ?upgrade=cancelled", () => {
    h.mockSearchParamsGet.mockImplementation((key) => (key === "upgrade" ? "cancelled" : null));
    renderAdmin({ status: "running" });

    expect(h.mockToast).toHaveBeenCalledTimes(1);
    const [title, opts] = h.mockToast.mock.calls[0];
    expect(title).toBe("Upgrade cancelled");
    expect(opts).toEqual({
      description: expect.stringContaining("No charge was made"),
    });
    // The neutral toast() shouldn't double-fire as toast.info.
    expect(h.mockToast.info).not.toHaveBeenCalled();
  });

  it("strips the ?upgrade param from the URL after firing the toast", () => {
    h.mockSearchParamsGet.mockImplementation((key) => (key === "upgrade" ? "pending" : null));
    renderAdmin({ status: "running" });

    // replaceState should have been called with a URL that no longer contains
    // the upgrade param.
    expect(replaceStateSpy).toHaveBeenCalled();
    const newUrl = replaceStateSpy.mock.calls.at(-1)![2] as string;
    expect(newUrl).not.toContain("upgrade=");
  });

  it("does nothing when no ?upgrade param is present", () => {
    h.mockSearchParamsGet.mockImplementation(() => null);
    renderAdmin({ status: "running" });

    expect(h.mockToast).not.toHaveBeenCalled();
    expect(h.mockToast.info).not.toHaveBeenCalled();
    // replaceState shouldn't fire either when there's nothing to strip.
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  it("ignores unknown ?upgrade values but still strips the param", () => {
    h.mockSearchParamsGet.mockImplementation((key) => (key === "upgrade" ? "mystery-value" : null));
    renderAdmin({ status: "running" });

    expect(h.mockToast).not.toHaveBeenCalled();
    expect(h.mockToast.info).not.toHaveBeenCalled();
    // But we still clean up the URL so a refresh doesn't hold on to garbage.
    expect(replaceStateSpy).toHaveBeenCalled();
  });
});
