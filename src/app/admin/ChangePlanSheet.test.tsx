/**
 * Tests for ChangePlanSheet.
 *
 * Covers:
 *   1. Closed (open=false) renders nothing — NO fetch fired.
 *   2. Loading — subtitle + spinner, fetch to correct URL (slug URL-encoded).
 *   3. Error paths — non-ok response, network reject, missing options array.
 *   4. Empty — subtitle reads "highest available plan", no option rows.
 *   5. Populated — one row per option, name + price + hosting badge + deltas.
 *   6. `currentLimits === null` — row skips the delta list entirely.
 *   7. Dedicated-migration warning renders only on shared_to_dedicated rows.
 *   8. Clicking Select mounts <ConfirmUpgradeDialog> (mocked) with the correct
 *      option; clicking the dialog's close callback unmounts it.
 *   9. Backdrop click fires onClose.
 *  10. Close (×) button fires onClose.
 *  11. Esc fires onClose — but NOT when ConfirmUpgradeDialog is currently open
 *      (that dialog owns its own Esc).
 *  12. Stale-response guard: if the sheet closes while a fetch is in flight,
 *      the resolved response does not overwrite the idle state.
 *  13. a11y attributes — role=dialog + aria-modal + aria-labelledby.
 *
 * ConfirmUpgradeDialog is mocked to a minimal stub so we can assert its props
 * without depending on its DOM or fetch behaviour.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
// React 19: `act` lives on the `react` package.
import { act } from "react";
import { ChangePlanSheet, type CurrentTierLimits } from "./ChangePlanSheet";
import type { UpgradeOption } from "./ConfirmUpgradeDialog";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Replace ConfirmUpgradeDialog with a deterministic stub that renders a
// visible marker + a close button. Keeps this test focused on the sheet
// itself; ConfirmUpgradeDialog has its own test file.
const mockConfirmDialog = vi.fn();
vi.mock("./ConfirmUpgradeDialog", async () => {
  return {
    ConfirmUpgradeDialog: (props: {
      substrateSlug: string;
      currentTier: string;
      option: UpgradeOption;
      nextBillingDate: Date | null;
      onClose: () => void;
    }) => {
      // Record the props per render so assertions can inspect them.
      mockConfirmDialog(props);
      return (
        <div data-testid="mock-confirm-upgrade-dialog">
          <span data-testid="mock-confirm-option-tier">{props.option.tier}</span>
          <button data-testid="mock-confirm-close" onClick={() => props.onClose()}>
            close dialog
          </button>
        </div>
      );
    },
  };
});

// Global fetch — each test arranges its own mock response.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PRO_OPTION: UpgradeOption = {
  tier: "pro",
  name: "Professional",
  amountCents: 2900,
  hostingModel: "shared",
  transitionKind: "shared_to_shared",
  estimatedProrationCents: 633,
  limits: { maxAtoms: 100_000, maxBootstrapsMonth: 10_000, maxStorageMb: 2_048 },
  warnings: [],
};

const TEAM_OPTION: UpgradeOption = {
  tier: "team",
  name: "Team",
  amountCents: 7900,
  hostingModel: "dedicated",
  transitionKind: "shared_to_dedicated",
  estimatedProrationCents: 2366,
  limits: { maxAtoms: 500_000, maxBootstrapsMonth: -1, maxStorageMb: 10_240 },
  warnings: [
    {
      code: "dedicated_migration",
      severity: "info",
      message: "placeholder — copy comes from the component's imports",
    },
  ],
};

// Indie baseline — the customer is on Indie (10k atoms, 1k bootstraps/mo, 500MB)
// so upgrade deltas to Pro and Team render predictably.
const INDIE_LIMITS: CurrentTierLimits = {
  maxAtoms: 10_000,
  maxBootstrapsMonth: 1_000,
  maxStorageMb: 500,
};

const NEXT_BILLING = new Date(2026, 4, 17); // local-midnight May 17 2026

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Render the sheet with default props — individual tests override what they
 * need. Uses a wrapper so we can flip `open` between false → true to simulate
 * the real open/close cycle.
 */
function renderSheet(
  overrides: {
    open?: boolean;
    onClose?: () => void;
    substrateSlug?: string;
    currentTier?: string;
    currentLimits?: CurrentTierLimits | null;
    nextBillingDate?: Date | null;
  } = {},
) {
  const props = {
    open: overrides.open ?? true,
    onClose: overrides.onClose ?? vi.fn(),
    substrateSlug: overrides.substrateSlug ?? "bold-junction",
    currentTier: overrides.currentTier ?? "indie",
    currentLimits: overrides.currentLimits === undefined ? INDIE_LIMITS : overrides.currentLimits,
    nextBillingDate:
      overrides.nextBillingDate === undefined ? NEXT_BILLING : overrides.nextBillingDate,
  };
  return {
    ...render(<ChangePlanSheet {...props} />),
    onClose: props.onClose,
  };
}

/**
 * Build a fetch-mock response helper. Keeps the test bodies terse.
 */
function resolveWith(status: number, body: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

/**
 * Flush promises so state updates from `fetch(...).then(...)` settle. One
 * `await act(async () => {})` is enough because we resolve microtasks twice.
 */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

// ─── Test lifecycle ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockReset();
});

describe("ChangePlanSheet — closed", () => {
  it("renders nothing when open is false and does NOT fetch", () => {
    renderSheet({ open: false });
    expect(screen.queryByTestId("change-plan-sheet")).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("ChangePlanSheet — loading", () => {
  it("shows the loading subtitle + spinner while the fetch is in flight", () => {
    // A fetch mock that never resolves keeps us in "loading" forever.
    mockFetch.mockReturnValue(new Promise<never>(() => {}));

    renderSheet();

    expect(screen.getByTestId("change-plan-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("change-plan-sheet-loading")).toBeInTheDocument();
    expect(screen.getByTestId("change-plan-sheet-subtitle")).toHaveTextContent(
      /loading available plans/i,
    );
  });

  it("fetches GET /api/billing/upgrade-options with the URL-encoded slug", () => {
    mockFetch.mockReturnValue(new Promise<never>(() => {}));

    renderSheet({ substrateSlug: "weird slug/with?chars" });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(
      `/api/billing/upgrade-options?substrateSlug=${encodeURIComponent("weird slug/with?chars")}`,
    );
    expect(init).toMatchObject({ cache: "no-store" });
  });
});

describe("ChangePlanSheet — error states", () => {
  it("shows the error body when the response is non-ok", async () => {
    resolveWith(500, { error: "boom" });

    renderSheet();
    await flush();

    expect(screen.getByTestId("change-plan-sheet-error")).toBeInTheDocument();
    expect(screen.getByTestId("change-plan-sheet-subtitle")).toHaveTextContent(/couldn't load/i);
  });

  it("shows the error body when fetch itself rejects", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    renderSheet();
    await flush();

    expect(screen.getByTestId("change-plan-sheet-error")).toBeInTheDocument();
  });

  it("shows the error body when the response shape is missing an options array", async () => {
    resolveWith(200, { currentTier: "indie" /* no options */ });

    renderSheet();
    await flush();

    expect(screen.getByTestId("change-plan-sheet-error")).toBeInTheDocument();
  });
});

describe("ChangePlanSheet — empty", () => {
  it("shows the empty-state body when options[] is empty", async () => {
    resolveWith(200, { currentTier: "team", options: [] });

    renderSheet({ currentTier: "team" });
    await flush();

    expect(screen.getByTestId("change-plan-sheet-empty")).toBeInTheDocument();
    expect(screen.getByTestId("change-plan-sheet-subtitle")).toHaveTextContent(
      /highest available plan/i,
    );
    // No option rows rendered.
    expect(screen.queryByTestId("change-plan-sheet-options")).toBeNull();
  });
});

describe("ChangePlanSheet — populated rows", () => {
  it("renders one row per option with name + price", async () => {
    resolveWith(200, { currentTier: "indie", options: [PRO_OPTION, TEAM_OPTION] });

    renderSheet();
    await flush();

    expect(screen.getByTestId("change-plan-sheet-options")).toBeInTheDocument();
    expect(screen.getByTestId("change-plan-option-pro")).toBeInTheDocument();
    expect(screen.getByTestId("change-plan-option-team")).toBeInTheDocument();

    // Visible tier names (matches tier.name from fixtures).
    expect(screen.getByText("Professional")).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();

    // Prices in dollars.
    expect(screen.getByTestId("change-plan-option-pro-price")).toHaveTextContent("$29.00/mo");
    expect(screen.getByTestId("change-plan-option-team-price")).toHaveTextContent("$79.00/mo");
  });

  it("renders the hosting badge per row (Shared vs Dedicated)", async () => {
    resolveWith(200, { currentTier: "indie", options: [PRO_OPTION, TEAM_OPTION] });

    renderSheet();
    await flush();

    expect(screen.getByTestId("change-plan-option-pro-hosting")).toHaveTextContent("Shared");
    expect(screen.getByTestId("change-plan-option-team-hosting")).toHaveTextContent("Dedicated");
  });

  it("renders the dedicated-migration warning only for shared_to_dedicated rows", async () => {
    resolveWith(200, { currentTier: "indie", options: [PRO_OPTION, TEAM_OPTION] });

    renderSheet();
    await flush();

    // Pro → shared_to_shared — no warning.
    expect(screen.queryByTestId("change-plan-option-pro-warning")).toBeNull();

    // Team → shared_to_dedicated — warning rendered.
    const teamWarning = screen.getByTestId("change-plan-option-team-warning");
    expect(teamWarning).toHaveTextContent(/dedicated hosting/i);
    expect(teamWarning).toHaveTextContent(/read-only for about 5 minutes/i);
  });

  it("renders deltas computed against currentLimits (Indie → Pro → Team)", async () => {
    resolveWith(200, { currentTier: "indie", options: [PRO_OPTION, TEAM_OPTION] });

    renderSheet(); // INDIE_LIMITS by default
    await flush();

    // Indie (10k / 1k / 500MB) → Pro (100k / 10k / 2GB = 2048MB).
    const proDeltas = screen.getByTestId("change-plan-option-pro-deltas");
    expect(proDeltas).toHaveTextContent("+90k atoms");
    expect(proDeltas).toHaveTextContent("+9k bootstraps/mo");
    expect(proDeltas).toHaveTextContent("+1.5 GB storage");

    // Indie → Team (500k / unlimited / 10GB = 10240MB).
    const teamDeltas = screen.getByTestId("change-plan-option-team-deltas");
    expect(teamDeltas).toHaveTextContent("+490k atoms");
    expect(teamDeltas).toHaveTextContent(/unlimited bootstraps\/mo/i);
    // 10240 - 500 = 9740 MB → 9740/1024 = 9.5117... → "+9.5 GB storage"
    expect(teamDeltas).toHaveTextContent("+9.5 GB storage");
  });

  it("skips the delta list entirely when currentLimits is null", async () => {
    resolveWith(200, { currentTier: "indie", options: [PRO_OPTION] });

    renderSheet({ currentLimits: null });
    await flush();

    expect(screen.getByTestId("change-plan-option-pro")).toBeInTheDocument();
    expect(screen.queryByTestId("change-plan-option-pro-deltas")).toBeNull();
  });
});

describe("ChangePlanSheet — Select opens ConfirmUpgradeDialog", () => {
  it("mounts ConfirmUpgradeDialog with the correct option when Select is clicked", async () => {
    resolveWith(200, { currentTier: "indie", options: [PRO_OPTION, TEAM_OPTION] });

    renderSheet();
    await flush();

    // Dialog not yet mounted.
    expect(screen.queryByTestId("mock-confirm-upgrade-dialog")).toBeNull();

    // Click Team's Select button.
    fireEvent.click(screen.getByTestId("change-plan-option-team-select"));

    // Dialog now mounted with team option.
    expect(screen.getByTestId("mock-confirm-upgrade-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("mock-confirm-option-tier")).toHaveTextContent("team");

    // Props forwarded correctly.
    const lastProps = mockConfirmDialog.mock.calls.at(-1)![0];
    expect(lastProps.substrateSlug).toBe("bold-junction");
    expect(lastProps.currentTier).toBe("indie");
    expect(lastProps.option.tier).toBe("team");
    expect(lastProps.nextBillingDate).toBe(NEXT_BILLING);
  });

  it("unmounts the dialog when its onClose callback fires", async () => {
    resolveWith(200, { currentTier: "indie", options: [PRO_OPTION] });

    renderSheet();
    await flush();

    fireEvent.click(screen.getByTestId("change-plan-option-pro-select"));
    expect(screen.getByTestId("mock-confirm-upgrade-dialog")).toBeInTheDocument();

    // Trigger the stubbed dialog's close button → calls its onClose prop →
    // sheet sets selectedOption back to null.
    fireEvent.click(screen.getByTestId("mock-confirm-close"));
    expect(screen.queryByTestId("mock-confirm-upgrade-dialog")).toBeNull();
  });
});

describe("ChangePlanSheet — close interactions", () => {
  it("backdrop click fires onClose", async () => {
    resolveWith(200, { currentTier: "indie", options: [PRO_OPTION] });
    const onClose = vi.fn();

    renderSheet({ onClose });
    await flush();

    fireEvent.click(screen.getByTestId("change-plan-sheet-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("close (×) button fires onClose", async () => {
    resolveWith(200, { currentTier: "indie", options: [PRO_OPTION] });
    const onClose = vi.fn();

    renderSheet({ onClose });
    await flush();

    fireEvent.click(screen.getByTestId("change-plan-sheet-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Esc key fires onClose", async () => {
    resolveWith(200, { currentTier: "indie", options: [PRO_OPTION] });
    const onClose = vi.fn();

    renderSheet({ onClose });
    await flush();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Esc does NOT fire onClose while ConfirmUpgradeDialog is open", async () => {
    resolveWith(200, { currentTier: "indie", options: [PRO_OPTION] });
    const onClose = vi.fn();

    renderSheet({ onClose });
    await flush();

    // Open the confirmation dialog.
    fireEvent.click(screen.getByTestId("change-plan-option-pro-select"));
    expect(screen.getByTestId("mock-confirm-upgrade-dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("backdrop click does NOT fire onClose while ConfirmUpgradeDialog is open", async () => {
    resolveWith(200, { currentTier: "indie", options: [PRO_OPTION] });
    const onClose = vi.fn();

    renderSheet({ onClose });
    await flush();

    fireEvent.click(screen.getByTestId("change-plan-option-pro-select"));
    fireEvent.click(screen.getByTestId("change-plan-sheet-backdrop"));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("ChangePlanSheet — stale-response guard", () => {
  it("drops a late fetch result if the sheet has already closed", async () => {
    // Make the fetch resolution deferred so we can control when it lands.
    let resolveFetch!: (value: unknown) => void;
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = (value) => resolve(value);
        }),
    );

    // Open → start fetch → close before it resolves.
    const onClose = vi.fn();
    const { rerender } = render(
      <ChangePlanSheet
        open={true}
        onClose={onClose}
        substrateSlug="bold-junction"
        currentTier="indie"
        currentLimits={INDIE_LIMITS}
        nextBillingDate={NEXT_BILLING}
      />,
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Close the sheet.
    rerender(
      <ChangePlanSheet
        open={false}
        onClose={onClose}
        substrateSlug="bold-junction"
        currentTier="indie"
        currentLimits={INDIE_LIMITS}
        nextBillingDate={NEXT_BILLING}
      />,
    );
    expect(screen.queryByTestId("change-plan-sheet")).toBeNull();

    // The in-flight fetch finally resolves with good data. This must NOT put
    // the (closed) sheet back into a "ready" state.
    await act(async () => {
      resolveFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ currentTier: "indie", options: [PRO_OPTION] }),
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByTestId("change-plan-sheet")).toBeNull();
    expect(screen.queryByTestId("change-plan-sheet-options")).toBeNull();
  });

  it("re-fetches when the sheet is re-opened", async () => {
    // First open: resolve with an empty options list.
    resolveWith(200, { currentTier: "team", options: [] });

    const onClose = vi.fn();
    const { rerender } = render(
      <ChangePlanSheet
        open={true}
        onClose={onClose}
        substrateSlug="bold-junction"
        currentTier="team"
        currentLimits={null}
        nextBillingDate={null}
      />,
    );
    await flush();
    expect(screen.getByTestId("change-plan-sheet-empty")).toBeInTheDocument();

    // Close it.
    rerender(
      <ChangePlanSheet
        open={false}
        onClose={onClose}
        substrateSlug="bold-junction"
        currentTier="team"
        currentLimits={null}
        nextBillingDate={null}
      />,
    );

    // Re-open with a populated response this time.
    resolveWith(200, { currentTier: "indie", options: [PRO_OPTION] });

    rerender(
      <ChangePlanSheet
        open={true}
        onClose={onClose}
        substrateSlug="bold-junction"
        currentTier="indie"
        currentLimits={INDIE_LIMITS}
        nextBillingDate={NEXT_BILLING}
      />,
    );
    await flush();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("change-plan-option-pro")).toBeInTheDocument();
  });
});

describe("ChangePlanSheet — a11y", () => {
  it("carries role=dialog, aria-modal, and aria-labelledby linked to the title", () => {
    mockFetch.mockReturnValue(new Promise<never>(() => {}));
    renderSheet();

    const sheet = screen.getByTestId("change-plan-sheet");
    expect(sheet).toHaveAttribute("role", "dialog");
    expect(sheet).toHaveAttribute("aria-modal", "true");
    expect(sheet).toHaveAttribute("aria-labelledby", "change-plan-sheet-title");
    expect(screen.getByText("Change plan")).toHaveAttribute("id", "change-plan-sheet-title");
  });
});

// Safety net — some suites leak DOM between files.
afterEach(() => {
  cleanup();
});
