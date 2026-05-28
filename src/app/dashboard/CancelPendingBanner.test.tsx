/**
 * Tests for CancelPendingBanner + CancelPendingBadge (Sprint 2026-05-18 E2).
 *
 * Covers:
 *   - Banner shows on first load (no dismissal flag in localStorage)
 *   - Banner hides when dismissal flag is set for today
 *   - Dismiss button writes the dismissal flag
 *   - Reactivate POSTs to /api/substrates/:slug/reactivate
 *   - Error path renders an inline notice and the banner stays open
 *   - Badge always renders with "Cancelling" text + endsOn tooltip
 *
 * Each test starts with localStorage cleared so the day-bucketed key is
 * never accidentally pre-set from a sibling test.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { CancelPendingBanner, CancelPendingBadge } from "./CancelPendingBanner";

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

// ── Banner ─────────────────────────────────────────────────────────────────

describe("CancelPendingBanner", () => {
  it("shows on first load when no dismissal flag is set", async () => {
    render(
      <CancelPendingBanner
        substrateId="subst_001"
        endsOn="14 Jun 2026"
        slug="spicy-tortoise"
        onReactivated={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("cancel-pending-banner-subst_001")).toBeInTheDocument();
    });
    expect(screen.getByText("14 Jun 2026")).toBeInTheDocument();
    expect(screen.getByTestId("cancel-pending-banner-reactivate-subst_001")).toBeInTheDocument();
  });

  it("stays hidden when today's dismissal flag is already set", async () => {
    const today = new Date();
    const bucket = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(today.getDate()).padStart(2, "0")}`;
    window.localStorage.setItem(`mmpm-cancel-banner-dismissed:subst_002:${bucket}`, "1");

    const { container } = render(
      <CancelPendingBanner
        substrateId="subst_002"
        endsOn="14 Jun 2026"
        slug="x"
        onReactivated={() => {}}
      />,
    );
    // The component starts hidden during SSR and the effect flips it on
    // ONLY if not dismissed. Wait a tick and confirm it stayed hidden.
    await new Promise((r) => setTimeout(r, 10));
    expect(container.firstChild).toBeNull();
  });

  it("dismiss button writes the day-bucketed flag and hides the banner", async () => {
    render(
      <CancelPendingBanner
        substrateId="subst_003"
        endsOn="14 Jun 2026"
        slug="x"
        onReactivated={() => {}}
      />,
    );
    const banner = await screen.findByTestId("cancel-pending-banner-subst_003");
    expect(banner).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("cancel-pending-banner-dismiss-subst_003"));

    await waitFor(() => {
      expect(screen.queryByTestId("cancel-pending-banner-subst_003")).toBeNull();
    });
    // localStorage key exists and is non-empty.
    const matchingKey = Object.keys(window.localStorage).find((k) =>
      k.startsWith("mmpm-cancel-banner-dismissed:subst_003:"),
    );
    expect(matchingKey).toBeDefined();
    expect(window.localStorage.getItem(matchingKey!)).toBe("1");
  });

  it("Reactivate POSTs to /api/substrates/:slug/reactivate and fires onReactivated on 200", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ reactivated: true }),
    });
    const onReactivated = vi.fn();
    render(
      <CancelPendingBanner
        substrateId="subst_004"
        endsOn="14 Jun 2026"
        slug="spicy-tortoise"
        onReactivated={onReactivated}
      />,
    );
    fireEvent.click(await screen.findByTestId("cancel-pending-banner-reactivate-subst_004"));
    await waitFor(() => {
      expect(onReactivated).toHaveBeenCalledTimes(1);
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/substrates/spicy-tortoise/reactivate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows the banner and lets the user dismiss for the session when localStorage throws", async () => {
    // Simulate private browsing / blocked storage: both getItem and setItem throw.
    const originalGetItem = window.localStorage.getItem;
    const originalSetItem = window.localStorage.setItem;
    window.localStorage.getItem = vi.fn(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    window.localStorage.setItem = vi.fn(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    try {
      render(
        <CancelPendingBanner
          substrateId="subst_storage_blocked"
          endsOn="14 Jun 2026"
          slug="x"
          onReactivated={() => {}}
        />,
      );
      // Storage blocked → snapshot returns UNAVAILABLE_SENTINEL → banner visible.
      const banner = await screen.findByTestId("cancel-pending-banner-subst_storage_blocked");
      expect(banner).toBeInTheDocument();

      // Dismiss button still works for the session (no setItem possible).
      fireEvent.click(
        screen.getByTestId("cancel-pending-banner-dismiss-subst_storage_blocked"),
      );
      await waitFor(() => {
        expect(
          screen.queryByTestId("cancel-pending-banner-subst_storage_blocked"),
        ).toBeNull();
      });
    } finally {
      window.localStorage.getItem = originalGetItem;
      window.localStorage.setItem = originalSetItem;
    }
  });

  it("renders inline error when reactivate fails; banner stays open", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "reactivation_failed" }),
    });
    const onReactivated = vi.fn();
    render(
      <CancelPendingBanner
        substrateId="subst_005"
        endsOn="14 Jun 2026"
        slug="x"
        onReactivated={onReactivated}
      />,
    );
    fireEvent.click(await screen.findByTestId("cancel-pending-banner-reactivate-subst_005"));
    await waitFor(() => {
      expect(screen.getByTestId("cancel-pending-banner-error-subst_005")).toBeInTheDocument();
    });
    expect(onReactivated).not.toHaveBeenCalled();
    // Banner did NOT auto-dismiss on error.
    expect(screen.getByTestId("cancel-pending-banner-subst_005")).toBeInTheDocument();
  });
});

// ── Badge ──────────────────────────────────────────────────────────────────

describe("CancelPendingBadge", () => {
  it("renders 'Cancelling' text with an endsOn tooltip", () => {
    render(<CancelPendingBadge endsOn="14 Jun 2026" />);
    const badge = screen.getByTestId("cancel-pending-badge");
    expect(badge.textContent).toContain("Cancelling");
    expect(badge.getAttribute("title")).toBe("Cancels on 14 Jun 2026");
  });
});
