/**
 * Tests for TierChangeProgressBanner.
 *
 * Covers:
 *   1. state: "none" renders nothing.
 *   2. Fast path (shared_to_shared) shows FAST_PATH_STEPS label for the
 *      current state (queued, payment_pending, processing).
 *   3. Slow path (shared_to_dedicated) renders the unique phase list with the
 *      correct active bucket and done-status on earlier buckets.
 *   4. Retry counter appears only when transferAttempts > 0.
 *   5. Success (fast path): emerald banner with fastPathSuccessHeadline.
 *   6. Success (fast path) auto-dismisses after 5 s.
 *   7. Success (slow path): emerald banner with slowPathSuccessHeadline, does
 *      NOT auto-dismiss.
 *   8. Failure (failed / rolled_back): amber banner with FAILURE_HEADLINE,
 *      failureBody(currentTierName), and FAILURE_SUPPORT_LINE.
 *
 * We use fake timers for the auto-dismiss test.
 *
 * The dismissal-reset behaviour (new change kicks off after a previous one
 * auto-dismissed) isn't explicitly tested here — it's a simple effect and
 * testing it requires a rerender flow that would add more noise than value.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { act } from "react";
import { TierChangeProgressBanner } from "./TierChangeProgressBanner";
import { IDLE_TIER_CHANGE, type TierChangePollResult } from "@/hooks/useTierChangePoll";

function result(overrides: Partial<TierChangePollResult> = {}): TierChangePollResult {
  return { ...IDLE_TIER_CHANGE, ...overrides };
}

describe("TierChangeProgressBanner — idle", () => {
  it("renders nothing when state is 'none'", () => {
    const { container } = render(
      <TierChangeProgressBanner result={IDLE_TIER_CHANGE} currentTierName="Starter" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("TierChangeProgressBanner — fast path (shared_to_shared)", () => {
  it("shows 'Confirming your payment' for queued", () => {
    render(
      <TierChangeProgressBanner
        result={result({
          state: "queued",
          transitionKind: "shared_to_shared",
          targetTier: "indie",
        })}
        currentTierName="Starter"
      />,
    );
    expect(screen.getByText(/confirming your payment/i)).toBeInTheDocument();
    expect(screen.getByText(/Upgrading to Solo/)).toBeInTheDocument();
  });

  it("shows 'Confirming your payment' for payment_pending", () => {
    render(
      <TierChangeProgressBanner
        result={result({
          state: "payment_pending",
          transitionKind: "shared_to_shared",
          targetTier: "pro",
        })}
        currentTierName="Starter"
      />,
    );
    expect(screen.getByText(/confirming your payment/i)).toBeInTheDocument();
    expect(screen.getByText(/Upgrading to Professional/)).toBeInTheDocument();
  });

  it("shows 'Applying your new limits' for processing", () => {
    render(
      <TierChangeProgressBanner
        result={result({
          state: "processing",
          transitionKind: "shared_to_shared",
          targetTier: "indie",
        })}
        currentTierName="Starter"
      />,
    );
    expect(screen.getByText(/applying your new limits/i)).toBeInTheDocument();
  });

  it("does not render the slow-path phase list", () => {
    render(
      <TierChangeProgressBanner
        result={result({
          state: "processing",
          transitionKind: "shared_to_shared",
          targetTier: "indie",
        })}
        currentTierName="Starter"
      />,
    );
    expect(screen.queryByTestId("tier-change-phase-list")).not.toBeInTheDocument();
  });
});

describe("TierChangeProgressBanner — slow path (shared_to_dedicated)", () => {
  it("renders the unique phase list with 6 entries", () => {
    render(
      <TierChangeProgressBanner
        result={result({
          state: "processing",
          transitionKind: "shared_to_dedicated",
          phase: "provisioning",
          targetTier: "team",
        })}
        currentTierName="Pro"
      />,
    );
    const list = screen.getByTestId("tier-change-phase-list");
    // SLOW_PATH_UNIQUE_LABELS has 6 entries (9 raw phases collapse to 6 labels).
    expect(list.children.length).toBe(6);
  });

  it("marks 'Provisioning' as active and 'Confirming payment' as done when phase is provisioning", () => {
    render(
      <TierChangeProgressBanner
        result={result({
          state: "processing",
          transitionKind: "shared_to_dedicated",
          phase: "provisioning",
          targetTier: "team",
        })}
        currentTierName="Pro"
      />,
    );
    const list = screen.getByTestId("tier-change-phase-list");
    const items = list.querySelectorAll("li");

    // Bucket 0 = "Confirming your payment…" → done (active bucket is 1)
    expect(items[0].getAttribute("data-phase-state")).toBe("done");
    // Bucket 1 = "Provisioning your dedicated droplet…" → active
    expect(items[1].getAttribute("data-phase-state")).toBe("active");
    // Bucket 2+ → pending
    expect(items[2].getAttribute("data-phase-state")).toBe("pending");
  });

  it("marks 'Transferring' as active when phase is transferring", () => {
    render(
      <TierChangeProgressBanner
        result={result({
          state: "processing",
          transitionKind: "shared_to_dedicated",
          phase: "transferring",
          targetTier: "team",
        })}
        currentTierName="Pro"
      />,
    );
    const items = screen.getByTestId("tier-change-phase-list").querySelectorAll("li");
    // Buckets 0 (payment), 1 (provisioning), 2 (preparing) → done
    expect(items[0].getAttribute("data-phase-state")).toBe("done");
    expect(items[1].getAttribute("data-phase-state")).toBe("done");
    expect(items[2].getAttribute("data-phase-state")).toBe("done");
    // Bucket 3 = "Transferring your data…" → active
    expect(items[3].getAttribute("data-phase-state")).toBe("active");
  });

  it("does NOT show retry counter when transferAttempts is 0", () => {
    render(
      <TierChangeProgressBanner
        result={result({
          state: "processing",
          transitionKind: "shared_to_dedicated",
          phase: "transferring",
          targetTier: "team",
          transferAttempts: 0,
        })}
        currentTierName="Pro"
      />,
    );
    expect(screen.queryByTestId("tier-change-retry-counter")).not.toBeInTheDocument();
  });

  it("shows retry counter 'Attempt N of 5' when transferAttempts > 0", () => {
    render(
      <TierChangeProgressBanner
        result={result({
          state: "processing",
          transitionKind: "shared_to_dedicated",
          phase: "transferring",
          targetTier: "team",
          transferAttempts: 2,
        })}
        currentTierName="Pro"
      />,
    );
    const counter = screen.getByTestId("tier-change-retry-counter");
    expect(counter).toHaveTextContent("Attempt 2 of 5");
  });
});

describe("TierChangeProgressBanner — success states", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fast path renders the fast-path success headline with tier name", () => {
    render(
      <TierChangeProgressBanner
        result={result({
          state: "completed",
          transitionKind: "shared_to_shared",
          targetTier: "indie",
        })}
        currentTierName="Starter"
      />,
    );
    // fastPathSuccessHeadline("Solo") === "Done! You're on Solo. New limits are active."
    expect(screen.getByText(/you're on Solo/i)).toBeInTheDocument();
    expect(screen.getByText(/limits are active/i)).toBeInTheDocument();
  });

  it("slow path renders the slow-path success headline with API-key reassurance", () => {
    render(
      <TierChangeProgressBanner
        result={result({
          state: "completed",
          transitionKind: "shared_to_dedicated",
          targetTier: "team",
        })}
        currentTierName="Pro"
      />,
    );
    expect(screen.getByText(/on Team/)).toBeInTheDocument();
    expect(screen.getByText(/API key and MCP endpoint are unchanged/i)).toBeInTheDocument();
  });

  it("fast path auto-dismisses after 5 seconds", () => {
    const { container } = render(
      <TierChangeProgressBanner
        result={result({
          state: "completed",
          transitionKind: "shared_to_shared",
          targetTier: "indie",
        })}
        currentTierName="Starter"
      />,
    );

    // Before the timeout, banner is visible.
    expect(screen.getByTestId("tier-change-banner")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    // After 5 s, banner is gone.
    expect(container).toBeEmptyDOMElement();
  });

  it("slow path does NOT auto-dismiss after 5 seconds", () => {
    render(
      <TierChangeProgressBanner
        result={result({
          state: "completed",
          transitionKind: "shared_to_dedicated",
          targetTier: "team",
        })}
        currentTierName="Pro"
      />,
    );

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.getByTestId("tier-change-banner")).toBeInTheDocument();
  });
});

describe("TierChangeProgressBanner — failure states", () => {
  it("'failed' renders amber banner with failure headline + body + support line", () => {
    render(
      <TierChangeProgressBanner
        result={result({
          state: "failed",
          transitionKind: "shared_to_dedicated",
          targetTier: "team",
          error: "transfer_exhausted",
        })}
        currentTierName="Indie"
      />,
    );
    expect(screen.getByText(/couldn't complete your upgrade/i)).toBeInTheDocument();
    // failureBody("Indie") — names the tier the customer is still on.
    expect(screen.getByText(/still on Indie/)).toBeInTheDocument();
    expect(screen.getByText(/no charge will land/i)).toBeInTheDocument();
    expect(screen.getByText(/support@parametric-memory\.dev/)).toBeInTheDocument();
  });

  it("'rolled_back' is treated identically to 'failed'", () => {
    render(
      <TierChangeProgressBanner
        result={result({
          state: "rolled_back",
          transitionKind: "shared_to_dedicated",
          targetTier: "team",
        })}
        currentTierName="Indie"
      />,
    );
    expect(screen.getByText(/couldn't complete your upgrade/i)).toBeInTheDocument();
    expect(screen.getByText(/still on Indie/)).toBeInTheDocument();
  });
});

describe("TierChangeProgressBanner — data attributes for integration", () => {
  it("exposes data-state so CSS / e2e selectors can key off the lifecycle", () => {
    render(
      <TierChangeProgressBanner
        result={result({
          state: "processing",
          transitionKind: "shared_to_dedicated",
          phase: "provisioning",
          targetTier: "team",
        })}
        currentTierName="Pro"
      />,
    );
    const banner = screen.getByTestId("tier-change-banner");
    expect(banner.getAttribute("data-state")).toBe("processing");
    expect(banner.getAttribute("data-transition-kind")).toBe("shared_to_dedicated");
  });

  it("has role='status' aria-live='polite' so screen readers narrate updates", () => {
    render(
      <TierChangeProgressBanner
        result={result({
          state: "processing",
          transitionKind: "shared_to_shared",
          targetTier: "indie",
        })}
        currentTierName="Starter"
      />,
    );
    const banner = screen.getByTestId("tier-change-banner");
    expect(banner.getAttribute("role")).toBe("status");
    expect(banner.getAttribute("aria-live")).toBe("polite");
  });
});
