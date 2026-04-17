/**
 * Tests for ChangePlanButton.
 *
 * Covers:
 *   1. Idle (state: "none") — label reads "Change plan", button enabled.
 *   2. In-flight (state: "processing" / "payment_pending" / "queued" /
 *      terminal states) — label swaps to "Upgrade in progress…", button
 *      disabled, data-inflight="true".
 *   3. Clicking the button while idle opens the sheet.
 *   4. Clicking the button while in-flight does NOT open the sheet (disabled).
 *   5. Sheet's onClose closes it (state round-trip).
 *   6. ChangePlanSheet receives substrateSlug / currentTier / currentLimits
 *      / nextBillingDate props unchanged.
 *
 * ChangePlanSheet is mocked to a spy-capturing stub — we only care that the
 * button wires it up correctly; ChangePlanSheet has its own test file.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { ComponentProps } from "react";
import { ChangePlanButton } from "./ChangePlanButton";
import type { CurrentTierLimits } from "./ChangePlanSheet";
import { IDLE_TIER_CHANGE, type TierChangePollResult } from "@/hooks/useTierChangePoll";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Stub the sheet with a minimal controlled component so we can:
//   - assert open/close transitions by checking whether the stub is rendered
//   - assert the props pass through verbatim
//   - trigger onClose from within the stub to exercise the "sheet closes
//     button" state round-trip
const mockSheetRender = vi.fn();
vi.mock("./ChangePlanSheet", async () => {
  return {
    ChangePlanSheet: (props: {
      open: boolean;
      onClose: () => void;
      substrateSlug: string;
      currentTier: string;
      currentLimits: CurrentTierLimits | null;
      nextBillingDate: Date | null;
    }) => {
      mockSheetRender(props);
      if (!props.open) return null;
      return (
        <div data-testid="mock-change-plan-sheet">
          <span data-testid="mock-sheet-slug">{props.substrateSlug}</span>
          <span data-testid="mock-sheet-current-tier">{props.currentTier}</span>
          <button data-testid="mock-sheet-close" onClick={() => props.onClose()}>
            close sheet
          </button>
        </div>
      );
    },
  };
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

const INDIE_LIMITS: CurrentTierLimits = {
  maxAtoms: 10_000,
  maxBootstrapsMonth: 1_000,
  maxStorageMb: 500,
};

const NEXT_BILLING = new Date(2026, 4, 17);

/**
 * Build a poll result with a given state, defaulting every other field to the
 * IDLE shape so tests stay terse.
 */
function pollResultWithState(state: TierChangePollResult["state"]): TierChangePollResult {
  return { ...IDLE_TIER_CHANGE, state };
}

function renderButton(overrides: Partial<ComponentProps<typeof ChangePlanButton>> = {}) {
  const props: ComponentProps<typeof ChangePlanButton> = {
    substrateSlug: "bold-junction",
    currentTier: "indie",
    currentLimits: INDIE_LIMITS,
    nextBillingDate: NEXT_BILLING,
    pollResult: IDLE_TIER_CHANGE,
    ...overrides,
  };
  return render(<ChangePlanButton {...props} />);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ─── Idle state ──────────────────────────────────────────────────────────────

describe("ChangePlanButton — idle state", () => {
  it("renders the default 'Change plan' label and is enabled", () => {
    renderButton();

    const btn = screen.getByTestId("change-plan-button");
    expect(btn).toHaveTextContent("Change plan");
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAttribute("data-inflight", "false");
  });

  it("does not mount the sheet as open until the button is clicked", () => {
    renderButton();

    // The mock is always rendered (props.open === false → returns null), but
    // our testid only appears when open is true.
    expect(screen.queryByTestId("mock-change-plan-sheet")).toBeNull();
  });
});

// ─── In-flight state ─────────────────────────────────────────────────────────

describe("ChangePlanButton — in-flight state", () => {
  // Cover all non-"none" states the hook can report. Disabled-disposed
  // parametrised so a future enum addition trips this test.
  const IN_FLIGHT_STATES: TierChangePollResult["state"][] = [
    "payment_pending",
    "queued",
    "processing",
    "completed",
    "failed",
    "rolled_back",
  ];

  it.each(IN_FLIGHT_STATES)(
    "swaps to 'Upgrade in progress…' and disables when state=%s",
    (state) => {
      renderButton({ pollResult: pollResultWithState(state) });

      const btn = screen.getByTestId("change-plan-button");
      expect(btn).toHaveTextContent(/upgrade in progress/i);
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute("data-inflight", "true");
      expect(btn).toHaveAttribute("aria-disabled", "true");
    },
  );

  it("clicking the button while in-flight does NOT open the sheet", () => {
    renderButton({ pollResult: pollResultWithState("processing") });

    fireEvent.click(screen.getByTestId("change-plan-button"));
    expect(screen.queryByTestId("mock-change-plan-sheet")).toBeNull();
  });
});

// ─── Open / close round-trip ─────────────────────────────────────────────────

describe("ChangePlanButton — opens/closes the sheet", () => {
  it("clicking the button opens the sheet", () => {
    renderButton();

    expect(screen.queryByTestId("mock-change-plan-sheet")).toBeNull();
    fireEvent.click(screen.getByTestId("change-plan-button"));
    expect(screen.getByTestId("mock-change-plan-sheet")).toBeInTheDocument();
  });

  it("sheet.onClose closes the sheet again", () => {
    renderButton();

    fireEvent.click(screen.getByTestId("change-plan-button"));
    expect(screen.getByTestId("mock-change-plan-sheet")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("mock-sheet-close"));
    expect(screen.queryByTestId("mock-change-plan-sheet")).toBeNull();
  });

  it("reopening works after a close (state resets cleanly)", () => {
    renderButton();

    fireEvent.click(screen.getByTestId("change-plan-button"));
    fireEvent.click(screen.getByTestId("mock-sheet-close"));
    expect(screen.queryByTestId("mock-change-plan-sheet")).toBeNull();

    fireEvent.click(screen.getByTestId("change-plan-button"));
    expect(screen.getByTestId("mock-change-plan-sheet")).toBeInTheDocument();
  });
});

// ─── Prop pass-through ───────────────────────────────────────────────────────

describe("ChangePlanButton — prop pass-through", () => {
  it("forwards substrateSlug / currentTier / currentLimits / nextBillingDate to the sheet", () => {
    renderButton({
      substrateSlug: "weird-slug-123",
      currentTier: "pro",
      currentLimits: { maxAtoms: 100_000, maxBootstrapsMonth: 10_000, maxStorageMb: 2_048 },
      nextBillingDate: new Date(2026, 5, 1),
    });

    fireEvent.click(screen.getByTestId("change-plan-button"));

    // Most recent render call carries open=true + our props.
    const lastCall = mockSheetRender.mock.calls.at(-1)![0];
    expect(lastCall.open).toBe(true);
    expect(lastCall.substrateSlug).toBe("weird-slug-123");
    expect(lastCall.currentTier).toBe("pro");
    expect(lastCall.currentLimits).toEqual({
      maxAtoms: 100_000,
      maxBootstrapsMonth: 10_000,
      maxStorageMb: 2_048,
    });
    expect(lastCall.nextBillingDate).toEqual(new Date(2026, 5, 1));

    // Visible markers inside the stub confirm the runtime values lined up.
    expect(screen.getByTestId("mock-sheet-slug")).toHaveTextContent("weird-slug-123");
    expect(screen.getByTestId("mock-sheet-current-tier")).toHaveTextContent("pro");
  });

  it("passes currentLimits={null} through unchanged when billing hasn't loaded", () => {
    renderButton({ currentLimits: null });

    fireEvent.click(screen.getByTestId("change-plan-button"));
    const lastCall = mockSheetRender.mock.calls.at(-1)![0];
    expect(lastCall.currentLimits).toBeNull();
  });
});

// ─── className override ──────────────────────────────────────────────────────

describe("ChangePlanButton — className override", () => {
  it("uses a default Tailwind look when no className is provided", () => {
    renderButton();
    const btn = screen.getByTestId("change-plan-button");
    // Default includes bg-indigo-600 — the admin Billing-card action accent.
    expect(btn.className).toMatch(/bg-indigo-600/);
  });

  it("honours a custom className, dropping the default", () => {
    renderButton({ className: "custom-test-class" });
    const btn = screen.getByTestId("change-plan-button");
    expect(btn).toHaveClass("custom-test-class");
    // Default is NOT applied when a className prop is given.
    expect(btn.className).not.toMatch(/bg-indigo-600/);
  });
});
