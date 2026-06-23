/**
 * Tests for RecentAuthGate.
 *
 * Coverage:
 *   1. Loading state renders skeleton.
 *   2. recentAuthFresh=true renders children unchanged.
 *   3. recentAuthFresh=false renders the re-verify card.
 *   4. Clicking "Email me a sign-in link" calls triggerRecentAuthFlow.
 *   5. Successful send transitions to "Check your email" state.
 *   6. Failed send surfaces the error inline; gate stays on the stale card.
 *   7. Network error renders retry UI.
 *   8. Session-expired triggers redirect to /login.
 *   9. Resend from "Check your email" re-fires triggerRecentAuthFlow.
 *  10. "I clicked the link" calls refetch (visible to the user as an unlock
 *      mechanism if visibilitychange didn't fire).
 *
 * Mocks:
 *   - useRecentAuth (hook): controlled per test to drive each branch.
 *   - triggerRecentAuthFlow: spy + per-test resolved value.
 *   - useRouter (next/navigation): spy on .replace.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { RecentAuthGate } from "./RecentAuthGate";
import * as recentAuthFlow from "@/lib/recent-auth-flow";
import * as useRecentAuthModule from "@/hooks/useRecentAuth";

const replaceSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceSpy, push: vi.fn() }),
}));

beforeEach(() => {
  replaceSpy.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockUseRecentAuth(returnValue: ReturnType<typeof useRecentAuthModule.useRecentAuth>) {
  vi.spyOn(useRecentAuthModule, "useRecentAuth").mockReturnValue(returnValue);
}

const FRESH_STATUS = {
  enrolled: false,
  lastUsedAt: null,
  backupCodesRemaining: 0,
  recentAuthFresh: true,
  recentAuthExpiresAt: "2026-04-28T12:00:00.000Z",
};
const STALE_STATUS = { ...FRESH_STATUS, recentAuthFresh: false, recentAuthExpiresAt: null };

// ─── Loading ─────────────────────────────────────────────────────────────────

describe("RecentAuthGate — loading", () => {
  it("renders a skeleton card while loading", () => {
    mockUseRecentAuth({ status: null, loading: true, error: null, refetch: vi.fn() });
    render(
      <RecentAuthGate email="alice@example.com" next="/admin/security/two-factor">
        <div data-testid="children">unlocked</div>
      </RecentAuthGate>,
    );
    expect(screen.getByTestId("recent-auth-gate-loading")).toBeTruthy();
    expect(screen.queryByTestId("children")).toBeNull();
  });
});

// ─── Fresh ───────────────────────────────────────────────────────────────────

describe("RecentAuthGate — recentAuthFresh", () => {
  it("renders children when fresh", () => {
    mockUseRecentAuth({ status: FRESH_STATUS, loading: false, error: null, refetch: vi.fn() });
    render(
      <RecentAuthGate email="alice@example.com" next="/admin/security/two-factor">
        <div data-testid="children">unlocked</div>
      </RecentAuthGate>,
    );
    expect(screen.getByTestId("children")).toBeTruthy();
    expect(screen.queryByTestId("recent-auth-gate-stale")).toBeNull();
  });
});

// ─── Stale ───────────────────────────────────────────────────────────────────

describe("RecentAuthGate — recentAuthFresh=false", () => {
  it("renders the re-verify card with the user's email", () => {
    mockUseRecentAuth({ status: STALE_STATUS, loading: false, error: null, refetch: vi.fn() });
    render(
      <RecentAuthGate email="alice@example.com" next="/admin/security/two-factor">
        <div data-testid="children">unlocked</div>
      </RecentAuthGate>,
    );
    expect(screen.getByTestId("recent-auth-gate-stale")).toBeTruthy();
    expect(screen.getByText(/alice@example\.com/)).toBeTruthy();
    expect(screen.queryByTestId("children")).toBeNull();
  });

  it("clicking 'Email me a sign-in link' calls triggerRecentAuthFlow", async () => {
    mockUseRecentAuth({ status: STALE_STATUS, loading: false, error: null, refetch: vi.fn() });
    const triggerSpy = vi
      .spyOn(recentAuthFlow, "triggerRecentAuthFlow")
      .mockResolvedValue({ ok: true });
    render(
      <RecentAuthGate email="alice@example.com" next="/admin/security/two-factor">
        <div>unlocked</div>
      </RecentAuthGate>,
    );

    fireEvent.click(screen.getByTestId("recent-auth-gate-send-email"));
    await waitFor(() => {
      expect(triggerSpy).toHaveBeenCalledWith({
        email: "alice@example.com",
        next: "/admin/security/two-factor",
      });
    });
    // Successful send → "Check your email" card.
    await waitFor(() => expect(screen.getByTestId("recent-auth-gate-email-sent")).toBeTruthy());
  });

  it("send failure shows inline error, gate stays on stale card", async () => {
    mockUseRecentAuth({ status: STALE_STATUS, loading: false, error: null, refetch: vi.fn() });
    vi.spyOn(recentAuthFlow, "triggerRecentAuthFlow").mockResolvedValue({
      ok: false,
      errorCode: "rate_limited",
      errorMessage: "Too many requests. Try again in a few minutes.",
    });
    render(
      <RecentAuthGate email="alice@example.com" next="/admin/security/two-factor">
        <div>unlocked</div>
      </RecentAuthGate>,
    );

    fireEvent.click(screen.getByTestId("recent-auth-gate-send-email"));
    await waitFor(() =>
      expect(screen.getByTestId("recent-auth-gate-error-message").textContent).toMatch(
        /few minutes/i,
      ),
    );
    expect(screen.getByTestId("recent-auth-gate-stale")).toBeTruthy();
    expect(screen.queryByTestId("recent-auth-gate-email-sent")).toBeNull();
  });
});

// ─── Stale + reauth variant (audit page) ─────────────────────────────────────

describe("RecentAuthGate — staleVariant='reauth'", () => {
  it("renders the identity-provider reauth panel, not the magic-link email card", () => {
    mockUseRecentAuth({ status: STALE_STATUS, loading: false, error: null, refetch: vi.fn() });
    render(
      <RecentAuthGate email="alice@example.com" next="/admin/security/audit" staleVariant="reauth">
        <div data-testid="children">unlocked</div>
      </RecentAuthGate>,
    );

    // The reauth panel shows …
    expect(screen.getByTestId("recent-auth-gate-reauth")).toBeTruthy();
    // … and never the magic-link email affordances.
    expect(screen.queryByTestId("recent-auth-gate-stale")).toBeNull();
    expect(screen.queryByTestId("recent-auth-gate-send-email")).toBeNull();
    expect(screen.queryByTestId("children")).toBeNull();
  });

  it("the CTA bounces to /login (buildReauthUrl), not a magic-link email send", () => {
    mockUseRecentAuth({ status: STALE_STATUS, loading: false, error: null, refetch: vi.fn() });
    const triggerSpy = vi.spyOn(recentAuthFlow, "triggerRecentAuthFlow");
    render(
      <RecentAuthGate email="alice@example.com" next="/admin/security/audit" staleVariant="reauth">
        <div>unlocked</div>
      </RecentAuthGate>,
    );

    const cta = screen.getByTestId("recent-auth-gate-reauth-cta") as HTMLAnchorElement;
    expect(cta.getAttribute("href")).toMatch(/^\/login\?redirect=/);
    // No email round-trip is ever triggered from this variant.
    expect(triggerSpy).not.toHaveBeenCalled();
  });

  it("still renders children when recent-auth is fresh", () => {
    mockUseRecentAuth({ status: FRESH_STATUS, loading: false, error: null, refetch: vi.fn() });
    render(
      <RecentAuthGate email="alice@example.com" next="/admin/security/audit" staleVariant="reauth">
        <div data-testid="children">unlocked</div>
      </RecentAuthGate>,
    );
    expect(screen.getByTestId("children")).toBeTruthy();
    expect(screen.queryByTestId("recent-auth-gate-reauth")).toBeNull();
  });
});

// ─── Email-sent state ────────────────────────────────────────────────────────

describe("RecentAuthGate — email sent", () => {
  it("'I clicked the link' calls refetch", async () => {
    const refetchSpy = vi.fn().mockResolvedValue(undefined);
    mockUseRecentAuth({ status: STALE_STATUS, loading: false, error: null, refetch: refetchSpy });
    vi.spyOn(recentAuthFlow, "triggerRecentAuthFlow").mockResolvedValue({ ok: true });
    render(
      <RecentAuthGate email="alice@example.com" next="/admin/security/two-factor">
        <div>unlocked</div>
      </RecentAuthGate>,
    );
    fireEvent.click(screen.getByTestId("recent-auth-gate-send-email"));
    await waitFor(() => expect(screen.getByTestId("recent-auth-gate-email-sent")).toBeTruthy());

    fireEvent.click(screen.getByTestId("recent-auth-gate-recheck"));
    expect(refetchSpy).toHaveBeenCalled();
  });

  it("'resend' fires triggerRecentAuthFlow again", async () => {
    mockUseRecentAuth({ status: STALE_STATUS, loading: false, error: null, refetch: vi.fn() });
    const triggerSpy = vi
      .spyOn(recentAuthFlow, "triggerRecentAuthFlow")
      .mockResolvedValue({ ok: true });
    render(
      <RecentAuthGate email="alice@example.com" next="/admin/security/two-factor">
        <div>unlocked</div>
      </RecentAuthGate>,
    );
    fireEvent.click(screen.getByTestId("recent-auth-gate-send-email"));
    await waitFor(() => expect(screen.getByTestId("recent-auth-gate-email-sent")).toBeTruthy());

    fireEvent.click(screen.getByTestId("recent-auth-gate-resend"));
    await waitFor(() => expect(triggerSpy).toHaveBeenCalledTimes(2));
  });
});

// ─── Error states ────────────────────────────────────────────────────────────

describe("RecentAuthGate — error states", () => {
  it("network error renders retry button", () => {
    const refetchSpy = vi.fn().mockResolvedValue(undefined);
    mockUseRecentAuth({ status: null, loading: false, error: "network", refetch: refetchSpy });
    render(
      <RecentAuthGate email="alice@example.com" next="/admin/security/two-factor">
        <div>unlocked</div>
      </RecentAuthGate>,
    );
    fireEvent.click(screen.getByTestId("recent-auth-gate-retry"));
    expect(refetchSpy).toHaveBeenCalled();
  });

  it("session_expired redirects to /login", () => {
    mockUseRecentAuth({
      status: null,
      loading: false,
      error: "session_expired",
      refetch: vi.fn(),
    });
    render(
      <RecentAuthGate email="alice@example.com" next="/admin/security/two-factor">
        <div>unlocked</div>
      </RecentAuthGate>,
    );
    expect(replaceSpy).toHaveBeenCalledWith("/login?error=session_expired");
  });
});
