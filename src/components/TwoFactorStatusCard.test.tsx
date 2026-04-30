/**
 * Tests for TwoFactorStatusCard.
 *
 * Coverage:
 *   1. Loading state renders the skeleton.
 *   2. Network error renders the soft-fallback CTA.
 *   3. Not-enrolled renders the "Set up" button + "Off" badge.
 *   4. Enrolled renders last-used + backup-codes-remaining + "Manage" + "On".
 *   5. Enrolled with lastUsedAt=null renders "Never".
 *   6. CTA links target /admin/security/two-factor.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TwoFactorStatusCard } from "./TwoFactorStatusCard";
import * as useRecentAuthModule from "@/hooks/useRecentAuth";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockUseRecentAuth(returnValue: ReturnType<typeof useRecentAuthModule.useRecentAuth>) {
  vi.spyOn(useRecentAuthModule, "useRecentAuth").mockReturnValue(returnValue);
}

const NOT_ENROLLED = {
  enrolled: false,
  lastUsedAt: null,
  backupCodesRemaining: 0,
  recentAuthFresh: true,
  recentAuthExpiresAt: "2026-04-28T12:00:00.000Z",
};
const ENROLLED = {
  enrolled: true,
  lastUsedAt: "2026-04-28T11:55:00.000Z",
  backupCodesRemaining: 7,
  recentAuthFresh: true,
  recentAuthExpiresAt: "2026-04-28T12:00:00.000Z",
};

describe("TwoFactorStatusCard", () => {
  it("renders skeleton while loading", () => {
    mockUseRecentAuth({ status: null, loading: true, error: null, refetch: vi.fn() });
    render(<TwoFactorStatusCard />);
    expect(screen.getByTestId("two-factor-status-card-loading")).toBeTruthy();
  });

  it("renders soft-fallback on network error", () => {
    mockUseRecentAuth({ status: null, loading: false, error: "network", refetch: vi.fn() });
    render(<TwoFactorStatusCard />);
    expect(screen.getByTestId("two-factor-status-card-error")).toBeTruthy();
    const link = screen.getByTestId("two-factor-status-card-cta-fallback") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/admin/security/two-factor");
  });

  it("renders the 'Set up' CTA when not enrolled", () => {
    mockUseRecentAuth({ status: NOT_ENROLLED, loading: false, error: null, refetch: vi.fn() });
    render(<TwoFactorStatusCard />);
    expect(screen.getByTestId("two-factor-status-card-not-enrolled")).toBeTruthy();
    expect(screen.getByText("Off")).toBeTruthy();
    const link = screen.getByTestId("two-factor-status-card-enable") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/admin/security/two-factor");
    expect(link.textContent).toMatch(/set up/i);
  });

  it("renders enrolled state with all fields", () => {
    mockUseRecentAuth({ status: ENROLLED, loading: false, error: null, refetch: vi.fn() });
    render(<TwoFactorStatusCard />);
    expect(screen.getByTestId("two-factor-status-card-enrolled")).toBeTruthy();
    expect(screen.getByText("On")).toBeTruthy();
    expect(screen.getByTestId("two-factor-status-card-backup-count").textContent).toContain(
      "7 of 10",
    );
    const manage = screen.getByTestId("two-factor-status-card-manage") as HTMLAnchorElement;
    expect(manage.getAttribute("href")).toBe("/admin/security/two-factor");
  });

  it("renders 'Never' when enrolled but lastUsedAt is null", () => {
    mockUseRecentAuth({
      status: { ...ENROLLED, lastUsedAt: null },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<TwoFactorStatusCard />);
    expect(screen.getByTestId("two-factor-status-card-last-used").textContent).toBe("Never");
  });
});
