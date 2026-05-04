/**
 * Tests for ConfirmUpgradeDialog.
 *
 * Covers:
 *   1. Header restates "Upgrading from {from} to {to}" with canonical tier labels.
 *   2. Proration today + monthly-thereafter display correctly, with the full
 *      prorationPreview() line when nextBillingDate is provided and the
 *      fallback line when it isn't.
 *   3. Dedicated-migration warning panel renders only for
 *      transitionKind === "shared_to_dedicated".
 *   4. Cancel button fires onClose; backdrop click fires onClose.
 *   5. Happy path: Upgrade button POSTs to /api/billing/upgrade with
 *      substrateSlug, targetTier, idempotencyKey; on 2xx the dialog fires
 *      `onUpgradeStarted` (NOT onClose) and emits the "Processing your
 *      upgrade…" toast — no window.location redirect.
 *   6. Submitting state: button label swaps to "Starting upgrade…" and
 *      Cancel is disabled.
 *   7. Error path (non-ok response): toast.error fires, the dialog stays
 *      open, Upgrade re-enables so the user can retry, onUpgradeStarted is
 *      NOT called.
 *   8. Error path (network failure): same as above.
 *   9. Esc key closes the dialog (when not submitting).
 *
 * Architectural note: as of May 2026 the upgrade flow is in-place
 * (`stripe.subscriptions.update`), not Stripe Checkout. The dialog no
 * longer redirects the browser; it hands off to `useTierChangePoll` via
 * the `onUpgradeStarted` callback.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
// React 19: `act` lives on the `react` package; `react-dom/test-utils` is
// deprecated. Matching TierChangeProgressBanner.test.tsx.
import { act } from "react";
import { ConfirmUpgradeDialog, type UpgradeOption } from "./ConfirmUpgradeDialog";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// sonner — every import of `toast` in the SUT resolves to these vi.fn() spies.
const mockToastError = vi.fn();
const mockToastInfo = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
    info: (...args: unknown[]) => mockToastInfo(...args),
  },
}));

// Global fetch — each test arranges its own resolved/rejected mock.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ─── Test fixtures ────────────────────────────────────────────────────────────

const FAST_PATH_OPTION: UpgradeOption = {
  tier: "pro",
  name: "Professional",
  amountCents: 2900,
  hostingModel: "shared",
  transitionKind: "shared_to_shared",
  estimatedProrationCents: 633,
  limits: { maxAtoms: 100_000, maxBootstrapsMonth: 10_000, maxStorageMb: 2048 },
  warnings: [],
};

const SLOW_PATH_OPTION: UpgradeOption = {
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
      message: "placeholder — copy comes from the component's imported constants",
    },
  ],
};

// Use a local-midnight constructor (not an ISO string) so the "on May 17"
// copy is TZ-independent — ISO strings shift the rendered day by up to ±1
// depending on the environment offset. Month is 0-indexed → 4 = May.
const NEXT_BILLING = new Date(2026, 4, 17);

interface RenderOverrides {
  option?: UpgradeOption;
  currentTier?: string;
  nextBillingDate?: Date | null;
  substrateSlug?: string;
  onClose?: () => void;
  onUpgradeStarted?: () => void;
}

function renderDialog(overrides: RenderOverrides = {}) {
  const onClose = overrides.onClose ?? vi.fn();
  const onUpgradeStarted = overrides.onUpgradeStarted ?? vi.fn();
  const utils = render(
    <ConfirmUpgradeDialog
      substrateSlug={overrides.substrateSlug ?? "bold-junction"}
      currentTier={overrides.currentTier ?? "indie"}
      option={overrides.option ?? FAST_PATH_OPTION}
      nextBillingDate={
        overrides.nextBillingDate === undefined ? NEXT_BILLING : overrides.nextBillingDate
      }
      onClose={onClose}
      onUpgradeStarted={onUpgradeStarted}
    />,
  );
  return { ...utils, onClose, onUpgradeStarted };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockToastError.mockClear();
  mockToastInfo.mockClear();
});

// ─── Header restatement ───────────────────────────────────────────────────────

describe("ConfirmUpgradeDialog — header", () => {
  it("restates the transition with canonical tier display names", () => {
    renderDialog({ currentTier: "indie", option: FAST_PATH_OPTION });
    // getTierLabel("indie") === "Solo"
    expect(screen.getByText(/Solo/)).toBeInTheDocument();
    // option.name is "Professional"
    expect(screen.getByText(/Professional/)).toBeInTheDocument();
    // "Upgrading from" intro
    expect(screen.getByText(/Upgrading from/i)).toBeInTheDocument();
  });

  it("renders the 'Confirm upgrade' title", () => {
    renderDialog();
    expect(screen.getByRole("heading", { name: /confirm upgrade/i })).toBeInTheDocument();
  });
});

// ─── Proration block ──────────────────────────────────────────────────────────

describe("ConfirmUpgradeDialog — proration", () => {
  it("shows the charge today and the monthly-thereafter amounts", () => {
    renderDialog({ option: FAST_PATH_OPTION });
    // estimatedProrationCents: 633  → "$6.33"
    expect(screen.getByTestId("proration-charge")).toHaveTextContent("$6.33");
    // amountCents: 2900  → "$29.00/mo"
    expect(screen.getByTestId("proration-monthly")).toHaveTextContent("$29.00/mo");
  });

  it("renders the full prorationPreview line when nextBillingDate is provided", () => {
    renderDialog({ option: FAST_PATH_OPTION, nextBillingDate: NEXT_BILLING });
    const line = screen.getByTestId("proration-full-line").textContent ?? "";
    // Example: "$6.33 charged today, then $29.00/mo on May 17"
    expect(line).toMatch(/\$6\.33 charged today/);
    expect(line).toMatch(/\$29\.00\/mo/);
    expect(line).toMatch(/May 17/);
  });

  it("falls back to the shorter line when nextBillingDate is null", () => {
    renderDialog({ option: FAST_PATH_OPTION, nextBillingDate: null });
    const line = screen.getByTestId("proration-full-line").textContent ?? "";
    expect(line).toMatch(/\$6\.33 charged today/);
    expect(line).toMatch(/\$29\.00\/mo/);
    // Must NOT have trailing "on <date>" — no fake dates in this mode.
    expect(line).not.toMatch(/on May/);
  });
});

// ─── Dedicated-migration warning panel ────────────────────────────────────────

describe("ConfirmUpgradeDialog — dedicated migration warning", () => {
  it("does NOT render the warning panel for a shared_to_shared option", () => {
    renderDialog({ option: FAST_PATH_OPTION });
    expect(screen.queryByTestId("dedicated-migration-warning")).not.toBeInTheDocument();
  });

  it("renders the warning panel with title + body for shared_to_dedicated", () => {
    renderDialog({ option: SLOW_PATH_OPTION, currentTier: "pro" });
    const panel = screen.getByTestId("dedicated-migration-warning");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent(/dedicated hosting/i);
    expect(panel).toHaveTextContent(/read-only for about 5 minutes/i);
    expect(panel).toHaveTextContent(/MCP endpoint and API key won't change/i);
  });
});

// ─── Close behaviour ──────────────────────────────────────────────────────────

describe("ConfirmUpgradeDialog — close behaviour", () => {
  it("Cancel button fires onClose", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByTestId("confirm-upgrade-cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("× close icon button fires onClose", () => {
    // The icon button is a discoverability affordance — Cancel is the
    // semantic close, but users scan for the canonical ×. Both must work.
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByTestId("confirm-upgrade-close-icon"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("× close icon button is disabled while submitting", async () => {
    // Mid-submit the parent must NOT receive onClose — that would unmount
    // the dialog while a network request is still in flight, leaving
    // submitting state stranded.
    let resolveFetch: (v: unknown) => void = () => {};
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const onClose = vi.fn();
    renderDialog({ onClose });

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-upgrade-confirm"));
    });

    expect(screen.getByTestId("confirm-upgrade-close-icon")).toBeDisabled();
    fireEvent.click(screen.getByTestId("confirm-upgrade-close-icon"));
    expect(onClose).not.toHaveBeenCalled();

    // Drain the pending fetch so vitest doesn't flag a hanging promise.
    await act(async () => {
      resolveFetch({ ok: true, json: () => Promise.resolve({ accepted: true }) });
    });
  });

  it("backdrop click fires onClose", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByTestId("confirm-upgrade-backdrop"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Esc key fires onClose", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("non-Escape keys do NOT fire onClose", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.keyDown(window, { key: "a" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ─── Happy path — POST + onUpgradeStarted handoff ─────────────────────────────

describe("ConfirmUpgradeDialog — Upgrade happy path", () => {
  it("POSTs to /api/billing/upgrade with slug + targetTier + idempotencyKey", async () => {
    // Compute's UpgradeCommitResponse — accepted in-place. Body fields
    // are unused client-side; only the 2xx status matters.
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          accepted: true,
          currentTier: "indie",
          targetTier: "pro",
          transitionType: "shared_to_shared",
          stripeSubscriptionId: "sub_test_abc",
          prorationCents: 200,
        }),
    });

    const onClose = vi.fn();
    const onUpgradeStarted = vi.fn();
    renderDialog({
      substrateSlug: "bold-junction",
      option: FAST_PATH_OPTION,
      onClose,
      onUpgradeStarted,
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-upgrade-confirm"));
    });

    // Request shape: BFF expects substrateSlug + targetTier + idempotencyKey.
    // The BFF unwraps slug into the path and renames targetTier→tier on its
    // way to compute; the dialog stays on the documented BFF contract.
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/billing/upgrade");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string);
    expect(body.substrateSlug).toBe("bold-junction");
    expect(body.targetTier).toBe("pro");
    expect(typeof body.idempotencyKey).toBe("string");
    expect(body.idempotencyKey.length).toBeGreaterThan(0);

    // Handoff: onUpgradeStarted fires; onClose does NOT (Cancel/Esc owns
    // that callback — success goes through onUpgradeStarted so the parent
    // can distinguish "user cancelled" from "upgrade accepted").
    expect(onUpgradeStarted).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();

    // User feedback: pending toast fires (poller is on a 3 s tick — too
    // slow to be the only confirmation signal).
    expect(mockToastInfo).toHaveBeenCalledOnce();
    expect(mockToastInfo).toHaveBeenCalledWith(
      expect.stringMatching(/Processing your upgrade/i),
      expect.objectContaining({ description: expect.any(String) }),
    );
    // No error toast.
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("ignores body shape on 2xx — no checkoutUrl read, no redirect", async () => {
    // Defensive: even an empty body is fine. The dialog must not assume any
    // particular field on success — only the status code.
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const onUpgradeStarted = vi.fn();
    renderDialog({ onUpgradeStarted });

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-upgrade-confirm"));
    });

    expect(onUpgradeStarted).toHaveBeenCalledOnce();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("swaps the button label to 'Starting upgrade…' while submitting", async () => {
    // Never resolve — we want to observe the pending state.
    let resolveFetch: (v: unknown) => void = () => {};
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    renderDialog();

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-upgrade-confirm"));
    });

    const confirmBtn = screen.getByTestId("confirm-upgrade-confirm");
    expect(confirmBtn).toHaveTextContent(/starting upgrade/i);
    expect(confirmBtn).toBeDisabled();
    // Cancel disabled during submit too.
    expect(screen.getByTestId("confirm-upgrade-cancel")).toBeDisabled();

    // Tidy up the hanging promise so vitest doesn't complain.
    await act(async () => {
      resolveFetch({
        ok: true,
        json: () => Promise.resolve({ accepted: true }),
      });
    });
  });

  it("backdrop click is suppressed while submitting", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const onClose = vi.fn();
    renderDialog({ onClose });

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-upgrade-confirm"));
    });

    fireEvent.click(screen.getByTestId("confirm-upgrade-backdrop"));
    expect(onClose).not.toHaveBeenCalled();

    // Clean up the pending fetch.
    await act(async () => {
      resolveFetch({
        ok: true,
        json: () => Promise.resolve({ accepted: true }),
      });
    });
  });
});

// ─── Error paths ──────────────────────────────────────────────────────────────

describe("ConfirmUpgradeDialog — Upgrade error paths", () => {
  it("fires toast.error and re-enables the button when the POST returns non-ok", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ error: "upgrade_in_progress" }),
    });

    const onUpgradeStarted = vi.fn();
    renderDialog({ onUpgradeStarted });

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-upgrade-confirm"));
    });

    expect(mockToastError).toHaveBeenCalledOnce();
    // Dialog still in the DOM.
    expect(screen.getByTestId("confirm-upgrade-dialog")).toBeInTheDocument();
    // Button re-enabled so the user can retry or cancel.
    expect(screen.getByTestId("confirm-upgrade-confirm")).not.toBeDisabled();
    expect(screen.getByTestId("confirm-upgrade-cancel")).not.toBeDisabled();
    // Parent must NOT think the upgrade started.
    expect(onUpgradeStarted).not.toHaveBeenCalled();
  });

  it("fires toast.error when fetch rejects (network failure)", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const onUpgradeStarted = vi.fn();
    renderDialog({ onUpgradeStarted });

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-upgrade-confirm"));
    });

    expect(mockToastError).toHaveBeenCalledOnce();
    expect(screen.getByTestId("confirm-upgrade-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-upgrade-confirm")).not.toBeDisabled();
    expect(onUpgradeStarted).not.toHaveBeenCalled();
  });

  it("does NOT double-submit when Upgrade is clicked again while in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    renderDialog();

    const confirmBtn = screen.getByTestId("confirm-upgrade-confirm");

    // First click — fetch should fire exactly once and the button should
    // transition to disabled before the next event loop turn.
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(confirmBtn).toBeDisabled();

    // A second click on the now-disabled button is a no-op — jsdom drops
    // click events on `disabled` buttons, and the `if (submitting) return;`
    // guard at the top of handleUpgrade catches any sneakier path.
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    expect(mockFetch).toHaveBeenCalledOnce();

    // Drain the pending fetch so vitest doesn't flag a hanging promise.
    await act(async () => {
      resolveFetch({
        ok: true,
        json: () => Promise.resolve({ accepted: true }),
      });
    });
  });
});

// ─── Accessibility attributes ─────────────────────────────────────────────────

describe("ConfirmUpgradeDialog — a11y", () => {
  it("exposes role='dialog' + aria-modal + aria-labelledby", () => {
    renderDialog();
    const dialog = screen.getByTestId("confirm-upgrade-dialog");
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    // The referenced element exists and has the dialog title text.
    expect(document.getElementById(labelledBy!)?.textContent).toMatch(/confirm upgrade/i);
  });
});
