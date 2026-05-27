/**
 * Tests for BillingReturnClient — D4 return-page state machine.
 *
 * Covers:
 *   1. No session_id in URL → error view
 *   2. status='open' → "Checkout didn't complete" retry view
 *   3. status='complete' + substrateStatus='running' on first poll → ready view
 *   4. status='complete' + substrateStatus='provisioning' → provisioning view
 *      then ready view after a poll returns 'running'
 *   5. 404 from BFF → no-leak generic error view (covers ownership-mismatch
 *      AND Stripe resource_missing — both arrive as 404 with same body shape)
 *   6. URL is stripped via history.replaceState on mount (P1-3)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

// ── Stub next/navigation hooks ─────────────────────────────────────────────
const mockSearchGet = vi.fn();
const mockRouterPush = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: mockSearchGet }),
  useRouter: () => ({ push: mockRouterPush }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// SiteNavbar is heavy / pulls in unrelated globals; stub to a marker.
vi.mock("@/components/ui/SiteNavbar", () => ({
  default: () => <nav data-testid="mock-site-navbar" />,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import BillingReturnClient from "./BillingReturnClient";

// ── Helpers ────────────────────────────────────────────────────────────────

function mockSessionResponse(payload: unknown, ok = true, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok,
    status,
    json: () => Promise.resolve(payload),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default — tests that exercise the success/provisioning paths set this.
  mockSearchGet.mockReturnValue("cs_test_default");
  // Reset URL so URL-strip assertion starts from a known state.
  window.history.replaceState(null, "", "/billing/return?session_id=cs_test_default");
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("BillingReturnClient", () => {
  it("renders error view when no session_id is present in the URL", async () => {
    mockSearchGet.mockReturnValue(null);
    await act(async () => {
      render(<BillingReturnClient />);
    });
    await waitFor(() => {
      expect(screen.getByTestId("billing-return-error")).toBeInTheDocument();
    });
    expect(screen.getByTestId("billing-return-error").textContent).toContain("Missing session id");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("strips session_id from the URL on mount (P1-3 defence-in-depth)", async () => {
    mockSessionResponse({
      status: "open",
      customerEmail: null,
      tier: "indie",
      substrateId: null,
      substrateSlug: null,
      substrateStatus: null,
    });
    await act(async () => {
      render(<BillingReturnClient />);
    });
    await waitFor(() => {
      expect(window.location.search).toBe("");
    });
  });

  it("renders retry view when Stripe status is 'open'", async () => {
    mockSessionResponse({
      status: "open",
      customerEmail: null,
      tier: "indie",
      substrateId: null,
      substrateSlug: null,
      substrateStatus: null,
    });
    await act(async () => {
      render(<BillingReturnClient />);
    });
    await waitFor(() => {
      expect(screen.getByTestId("billing-return-open")).toBeInTheDocument();
    });
    expect(screen.getByTestId("billing-return-open").textContent).toContain("Checkout didn");
  });

  it("renders ready view immediately when substrate is already 'running'", async () => {
    mockSessionResponse({
      status: "complete",
      customerEmail: "jane@example.com",
      tier: "indie",
      substrateId: "subst_001",
      substrateSlug: "spicy-tortoise",
      substrateStatus: "running",
    });
    await act(async () => {
      render(<BillingReturnClient />);
    });
    await waitFor(() => {
      expect(screen.getByTestId("billing-return-ready")).toBeInTheDocument();
    });
    expect(screen.getByTestId("billing-return-ready").textContent).toContain("spicy-tortoise");
  });

  it("auto-pushes to /dashboard 1.5s after entering ready", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockSessionResponse({
      status: "complete",
      customerEmail: null,
      tier: "indie",
      substrateId: "subst_001",
      substrateSlug: "x",
      substrateStatus: "running",
    });
    await act(async () => {
      render(<BillingReturnClient />);
    });
    await waitFor(() => {
      expect(screen.getByTestId("billing-return-ready")).toBeInTheDocument();
    });
    await act(async () => {
      vi.advanceTimersByTime(1_600);
    });
    expect(mockRouterPush).toHaveBeenCalledWith("/dashboard");
  });

  it("renders provisioning view then ready view after a poll returns 'running'", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Initial: complete + provisioning
    mockSessionResponse({
      status: "complete",
      customerEmail: "jane@example.com",
      tier: "indie",
      substrateId: "subst_001",
      substrateSlug: "spicy-tortoise",
      substrateStatus: "provisioning",
    });
    // Poll: running
    mockSessionResponse({
      status: "complete",
      customerEmail: "jane@example.com",
      tier: "indie",
      substrateId: "subst_001",
      substrateSlug: "spicy-tortoise",
      substrateStatus: "running",
    });

    await act(async () => {
      render(<BillingReturnClient />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("billing-return-provisioning")).toBeInTheDocument();
    });

    // Advance past one poll interval (2s). The poll fires a fetch which
    // resolves to status='running' → the view flips to ready.
    await act(async () => {
      vi.advanceTimersByTime(2_100);
    });

    await waitFor(() => {
      expect(screen.getByTestId("billing-return-ready")).toBeInTheDocument();
    });
  });

  it("forwards 404 verbatim — generic error view (no-leak posture)", async () => {
    mockSessionResponse({ error: "session_not_found" }, false, 404);
    await act(async () => {
      render(<BillingReturnClient />);
    });
    await waitFor(() => {
      expect(screen.getByTestId("billing-return-error")).toBeInTheDocument();
    });
    // Generic message — no hint about whether the cause was ownership
    // mismatch or a genuinely missing Stripe session.
    expect(screen.getByTestId("billing-return-error").textContent).toContain("couldn't find");
  });
});
