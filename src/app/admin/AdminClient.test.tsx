/**
 * Tests for AdminClient:
 *   1. provision_failed callout renders correctly
 *   2. Deprovision available for provision_failed regardless of tier
 *   3. Cancel Subscription hidden for provision_failed
 *   4. MCP block hidden for provision_failed (not running)
 *   5. Health/SSL badges render from substrate.health data
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminClient from "./AdminClient";

// ── Next.js mocks ─────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
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

  it("shows Deprovision button for provision_failed Starter tier", () => {
    renderAdmin({ status: "provision_failed", tier: "starter" });
    expect(screen.getByRole("button", { name: /deprovision substrate/i })).toBeInTheDocument();
  });

  it("shows Deprovision button for provision_failed Pro tier", () => {
    renderAdmin({ status: "provision_failed", tier: "pro" });
    expect(screen.getByRole("button", { name: /deprovision substrate/i })).toBeInTheDocument();
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
