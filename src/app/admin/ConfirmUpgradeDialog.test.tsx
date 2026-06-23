/**
 * Tests for ConfirmUpgradeDialog.
 *
 * The dialog now fetches GET /api/billing/upgrade/preview on mount so the user
 * sees real Stripe proration figures before confirming. The Upgrade button is
 * disabled until preview loads (or after an error + retry). This file covers
 * all three preview states (loading / loaded / error) plus the existing upgrade
 * submit flow.
 *
 * Covers:
 *   1.  Header restates "Upgrading from {from} to {to}" with canonical tier labels.
 *   2.  On mount — fetch /api/billing/upgrade/preview with correct params.
 *   3.  Loading state — skeleton visible, Upgrade button disabled.
 *   4.  Loaded state — proration-charge shows real prorationCents from preview.
 *   5.  Loaded state — proration-monthly shows real newPriceCents from preview.
 *   6.  Zero proration — renders "No charge today".
 *   7.  nextInvoiceDate present — proration-from-date includes the date.
 *   8.  nextInvoiceDate null — proration-from-date falls back to "next renewal".
 *   9.  Error state — error panel + Retry shown, Upgrade disabled.
 *  10.  Retry — clicking Retry re-fetches preview; success re-enables Upgrade.
 *  11.  Cancel button fires onClose.
 *  12.  × close icon fires onClose; disabled while submitting.
 *  13.  Backdrop click fires onClose; suppressed while submitting.
 *  14.  Esc fires onClose; non-Escape keys don't.
 *  15.  Upgrade disabled while submitting.
 *  16.  Happy path: POSTs /api/billing/upgrade with correct body, info-toasts,
 *       calls onUpgradeStarted — does NOT call onClose.
 *  17.  Happy path: ignores body shape on 2xx — no redirect.
 *  18.  Happy path: button label swaps to "Starting upgrade…" while submitting.
 *  19.  Error path (non-ok response): toast.error, dialog stays open, buttons re-enabled.
 *  20.  Error path (network failure): same.
 *  21.  Does NOT double-submit on rapid clicks.
 *  22.  dedicated_migration warning renders only for shared_to_dedicated.
 *  23.  D9: isCancelPending note renders when prop is true.
 *  24.  a11y — role=dialog, aria-modal, aria-labelledby.
 *
 * Architectural note: the upgrade flow is in-place (`stripe.subscriptions.update`).
 * The dialog does NOT redirect the browser; it hands off via `onUpgradeStarted`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { act } from "react";
import { ConfirmUpgradeDialog, type UpgradeOption } from "./ConfirmUpgradeDialog";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockToastError = vi.fn();
const mockToastInfo = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
    info: (...args: unknown[]) => mockToastInfo(...args),
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Returned by GET /api/billing/upgrade/preview. Shared upgrade: prorationCents
 * 633 = "$6.33", no provisioning fee, so chargedTodayCents == prorationCents.
 */
const PREVIEW_STUB = {
  currentTier: "indie",
  targetTier: "pro",
  transitionType: "shared_to_shared",
  currentPriceCents: 900,
  newPriceCents: 2900,
  prorationCents: 633,
  provisioningFeeCents: 0,
  chargedTodayCents: 633,
  currency: "usd",
  nextInvoiceDate: "2026-07-01T00:00:00.000Z",
  nextInvoiceTotalCents: 2900,
};

/**
 * Dedicated upgrade preview: a non-refundable provisioning fee is charged today
 * (967 = "$9.67"), so chargedTodayCents = prorationCents + fee. Used by the
 * fee-consent and dedicated charged-today tests.
 */
const DEDICATED_PREVIEW_STUB = {
  ...PREVIEW_STUB,
  targetTier: "team",
  transitionType: "shared_to_dedicated",
  provisioningFeeCents: 967,
  chargedTodayCents: 633 + 967, // 1600
};

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

const NEXT_BILLING = new Date(2026, 4, 17);

interface RenderOverrides {
  option?: UpgradeOption;
  currentTier?: string;
  nextBillingDate?: Date | null;
  substrateSlug?: string;
  onClose?: () => void;
  onUpgradeStarted?: () => void;
  isCancelPending?: boolean;
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
      isCancelPending={overrides.isCancelPending ?? false}
      onClose={onClose}
      onUpgradeStarted={onUpgradeStarted}
    />,
  );
  return { ...utils, onClose, onUpgradeStarted };
}

/**
 * Helper: mock fetch with URL-based dispatch.
 * - Preview GET resolves with `previewData` (default: PREVIEW_STUB).
 * - Upgrade POST resolves with `upgradeResponse` (default: accepted=true).
 * - Passing `null` for either makes it never resolve (for testing pending states).
 */
function mockFetchDispatch(
  opts: {
    preview?: object | null;
    previewStatus?: number;
    upgrade?: object | null;
    upgradeOk?: boolean;
  } = {},
) {
  const {
    preview = PREVIEW_STUB,
    previewStatus = 200,
    upgrade = { accepted: true },
    upgradeOk = true,
  } = opts;

  mockFetch.mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/billing/upgrade/preview")) {
      if (preview === null) return new Promise(() => {}); // never resolves
      return Promise.resolve({
        ok: previewStatus >= 200 && previewStatus < 300,
        status: previewStatus,
        json: () => Promise.resolve(preview),
      });
    }
    // Upgrade POST
    if (upgrade === null) return new Promise(() => {}); // never resolves
    return Promise.resolve({
      ok: upgradeOk,
      status: upgradeOk ? 200 : 409,
      json: () => Promise.resolve(upgrade),
    });
  });
}

/** Wait for the preview to finish loading (skeleton gone, charge visible). */
async function waitForPreviewLoaded() {
  await waitFor(() => screen.getByTestId("proration-charge"));
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockToastError.mockClear();
  mockToastInfo.mockClear();
  // Default: preview resolves immediately. Tests that need specific preview
  // behavior (error, loading-stuck, retry) call mockFetchDispatch directly.
  mockFetchDispatch();
});

// ─── Header ───────────────────────────────────────────────────────────────────

describe("ConfirmUpgradeDialog — header", () => {
  it("restates the transition with canonical tier display names", async () => {
    await act(async () => {
      renderDialog({ currentTier: "indie", option: FAST_PATH_OPTION });
    });
    expect(screen.getByText(/Solo/)).toBeInTheDocument(); // getTierLabel("indie")
    expect(screen.getByText(/Professional/)).toBeInTheDocument();
    expect(screen.getByText(/Upgrading from/i)).toBeInTheDocument();
  });

  it("renders the 'Confirm upgrade' title", async () => {
    await act(async () => {
      renderDialog();
    });
    expect(screen.getByRole("heading", { name: /confirm upgrade/i })).toBeInTheDocument();
  });
});

// ─── Preview fetch ─────────────────────────────────────────────────────────────

describe("ConfirmUpgradeDialog — preview fetch", () => {
  it("fetches /api/billing/upgrade/preview with substrateSlug and tier on mount", async () => {
    await act(async () => {
      renderDialog({ substrateSlug: "bold-junction", option: FAST_PATH_OPTION });
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    const previewCall = mockFetch.mock.calls.find(([url]: [string]) =>
      url.includes("/api/billing/upgrade/preview"),
    );
    expect(previewCall).toBeTruthy();
    const url: string = previewCall![0] as string;
    expect(url).toContain("substrateSlug=bold-junction");
    expect(url).toContain("tier=pro");
  });

  it("loading state — skeleton visible, Upgrade button disabled", () => {
    mockFetchDispatch({ preview: null }); // never resolves
    renderDialog();

    expect(screen.getByTestId("proration-loading")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-upgrade-confirm")).toBeDisabled();
  });
});

// ─── Proration block ──────────────────────────────────────────────────────────

describe("ConfirmUpgradeDialog — proration", () => {
  it("shows real prorationCents and newPriceCents from the preview response", async () => {
    mockFetchDispatch({
      preview: {
        ...PREVIEW_STUB,
        prorationCents: 633,
        chargedTodayCents: 633,
        newPriceCents: 2900,
      },
    });
    await act(async () => {
      renderDialog();
    });
    await waitForPreviewLoaded();

    expect(screen.getByTestId("proration-charge")).toHaveTextContent("$6.33");
    expect(screen.getByTestId("proration-monthly")).toHaveTextContent("$29.00/mo");
  });

  it("zero proration — renders 'No charge today'", async () => {
    mockFetchDispatch({ preview: { ...PREVIEW_STUB, prorationCents: 0, chargedTodayCents: 0 } });
    await act(async () => {
      renderDialog();
    });
    await waitForPreviewLoaded();

    expect(screen.getByTestId("proration-charge")).toHaveTextContent("No charge today");
  });

  it("nextInvoiceDate present — proration-from-date includes the formatted date", async () => {
    mockFetchDispatch({
      preview: { ...PREVIEW_STUB, nextInvoiceDate: "2026-07-01T00:00:00.000Z" },
    });
    await act(async () => {
      renderDialog();
    });
    await waitForPreviewLoaded();

    expect(screen.getByTestId("proration-from-date").textContent).toContain("July 1");
  });

  it("nextInvoiceDate null — proration-from-date falls back to 'next renewal'", async () => {
    mockFetchDispatch({ preview: { ...PREVIEW_STUB, nextInvoiceDate: null } });
    await act(async () => {
      renderDialog();
    });
    await waitForPreviewLoaded();

    expect(screen.getByTestId("proration-from-date").textContent).toContain("next renewal");
  });
});

// ─── Preview error state ──────────────────────────────────────────────────────

describe("ConfirmUpgradeDialog — preview error", () => {
  it("shows error panel + Retry, Upgrade disabled on preview failure", async () => {
    mockFetchDispatch({ preview: { error: "preview_failed" }, previewStatus: 500 });
    await act(async () => {
      renderDialog();
    });
    await waitFor(() => screen.getByTestId("proration-error"));

    expect(screen.getByTestId("proration-error")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-upgrade-confirm")).toBeDisabled();
  });

  it("clicking Retry re-fetches and transitions to loaded state", async () => {
    // First call fails, second succeeds
    let callCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/billing/upgrade/preview")) {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ error: "err" }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({ ...PREVIEW_STUB, prorationCents: 400, chargedTodayCents: 400 }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ accepted: true }),
      });
    });

    await act(async () => {
      renderDialog();
    });
    await waitFor(() => screen.getByTestId("proration-error"));

    await act(async () => {
      fireEvent.click(screen.getByText("Retry"));
    });
    await waitFor(() => screen.getByTestId("proration-charge"));

    expect(screen.getByTestId("proration-charge").textContent).toBe("$4.00");
    expect(screen.getByTestId("confirm-upgrade-confirm")).not.toBeDisabled();
  });
});

// ─── Dedicated-migration warning panel ────────────────────────────────────────

describe("ConfirmUpgradeDialog — dedicated migration warning", () => {
  it("does NOT render the warning panel for a shared_to_shared option", async () => {
    await act(async () => {
      renderDialog({ option: FAST_PATH_OPTION });
    });
    expect(screen.queryByTestId("dedicated-migration-warning")).not.toBeInTheDocument();
  });

  it("renders the warning panel with title + body for shared_to_dedicated", async () => {
    await act(async () => {
      renderDialog({ option: SLOW_PATH_OPTION, currentTier: "pro" });
    });
    const panel = screen.getByTestId("dedicated-migration-warning");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent(/dedicated hosting/i);
    expect(panel).toHaveTextContent(/read-only for about 5 minutes/i);
    expect(panel).toHaveTextContent(
      /API key stays the same, but your MCP endpoint URL will change/i,
    );
  });
});

// ─── Close behaviour ──────────────────────────────────────────────────────────

describe("ConfirmUpgradeDialog — close behaviour", () => {
  it("Cancel button fires onClose", async () => {
    const onClose = vi.fn();
    await act(async () => {
      renderDialog({ onClose });
    });
    fireEvent.click(screen.getByTestId("confirm-upgrade-cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("× close icon button fires onClose", async () => {
    const onClose = vi.fn();
    await act(async () => {
      renderDialog({ onClose });
    });
    fireEvent.click(screen.getByTestId("confirm-upgrade-close-icon"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("× close icon button is disabled while submitting", async () => {
    // Preview resolves immediately; upgrade never resolves (pending state).
    mockFetchDispatch({ upgrade: null });

    const onClose = vi.fn();
    await act(async () => {
      renderDialog({ onClose });
    });

    // Wait for preview to load so the Upgrade button becomes enabled.
    await waitForPreviewLoaded();

    // Click Upgrade — puts the dialog in submitting state.
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-upgrade-confirm"));
    });

    expect(screen.getByTestId("confirm-upgrade-close-icon")).toBeDisabled();
    fireEvent.click(screen.getByTestId("confirm-upgrade-close-icon"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("backdrop click fires onClose", async () => {
    const onClose = vi.fn();
    await act(async () => {
      renderDialog({ onClose });
    });
    fireEvent.click(screen.getByTestId("confirm-upgrade-backdrop"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Esc key fires onClose", async () => {
    const onClose = vi.fn();
    await act(async () => {
      renderDialog({ onClose });
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("non-Escape keys do NOT fire onClose", async () => {
    const onClose = vi.fn();
    await act(async () => {
      renderDialog({ onClose });
    });
    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.keyDown(window, { key: "a" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ─── Happy path — POST + onUpgradeStarted handoff ─────────────────────────────

describe("ConfirmUpgradeDialog — Upgrade happy path", () => {
  it("POSTs to /api/billing/upgrade with slug + targetTier + idempotencyKey", async () => {
    await act(async () => {
      renderDialog({ substrateSlug: "bold-junction", option: FAST_PATH_OPTION });
    });
    await waitForPreviewLoaded();

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-upgrade-confirm"));
    });

    // The upgrade POST is the second mockFetch call (after the preview GET).
    const upgradeCalls = mockFetch.mock.calls.filter(
      ([url]: [string]) => url === "/api/billing/upgrade",
    );
    expect(upgradeCalls).toHaveLength(1);
    const [url, init] = upgradeCalls[0] as [string, RequestInit];
    expect(url).toBe("/api/billing/upgrade");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.substrateSlug).toBe("bold-junction");
    expect(body.targetTier).toBe("pro");
    expect(typeof body.idempotencyKey).toBe("string");
    expect((body.idempotencyKey as string).length).toBeGreaterThan(0);
  });

  it("fires info toast and calls onUpgradeStarted — does NOT call onClose", async () => {
    const onClose = vi.fn();
    const onUpgradeStarted = vi.fn();
    await act(async () => {
      renderDialog({ onClose, onUpgradeStarted });
    });
    await waitForPreviewLoaded();

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-upgrade-confirm"));
    });

    expect(mockToastInfo).toHaveBeenCalledOnce();
    expect(mockToastInfo).toHaveBeenCalledWith(
      expect.stringMatching(/Processing your upgrade/i),
      expect.objectContaining({ description: expect.any(String) }),
    );
    expect(onUpgradeStarted).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("ignores body shape on 2xx — no redirect, onUpgradeStarted fires", async () => {
    mockFetchDispatch({ upgrade: {} }); // empty body is fine
    const onUpgradeStarted = vi.fn();
    await act(async () => {
      renderDialog({ onUpgradeStarted });
    });
    await waitForPreviewLoaded();

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-upgrade-confirm"));
    });

    expect(onUpgradeStarted).toHaveBeenCalledOnce();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("swaps the button label to 'Starting upgrade…' while submitting", async () => {
    mockFetchDispatch({ upgrade: null }); // upgrade never resolves

    await act(async () => {
      renderDialog();
    });
    await waitForPreviewLoaded();

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-upgrade-confirm"));
    });

    const confirmBtn = screen.getByTestId("confirm-upgrade-confirm");
    expect(confirmBtn).toHaveTextContent(/starting upgrade/i);
    expect(confirmBtn).toBeDisabled();
    expect(screen.getByTestId("confirm-upgrade-cancel")).toBeDisabled();
  });

  it("backdrop click is suppressed while submitting", async () => {
    mockFetchDispatch({ upgrade: null });

    const onClose = vi.fn();
    await act(async () => {
      renderDialog({ onClose });
    });
    await waitForPreviewLoaded();

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-upgrade-confirm"));
    });

    fireEvent.click(screen.getByTestId("confirm-upgrade-backdrop"));
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ─── Error paths ──────────────────────────────────────────────────────────────

describe("ConfirmUpgradeDialog — Upgrade error paths", () => {
  it("fires toast.error and re-enables button when the POST returns non-ok", async () => {
    mockFetchDispatch({ upgradeOk: false, upgrade: { error: "upgrade_in_progress" } });
    const onUpgradeStarted = vi.fn();
    await act(async () => {
      renderDialog({ onUpgradeStarted });
    });
    await waitForPreviewLoaded();

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-upgrade-confirm"));
    });

    expect(mockToastError).toHaveBeenCalledOnce();
    expect(screen.getByTestId("confirm-upgrade-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-upgrade-confirm")).not.toBeDisabled();
    expect(screen.getByTestId("confirm-upgrade-cancel")).not.toBeDisabled();
    expect(onUpgradeStarted).not.toHaveBeenCalled();
  });

  it("shows an inline 'payment failed' notice on a declined card (402) and stays open", async () => {
    mockFetchDispatch({ upgradeOk: false, upgrade: { error: "payment_failed" } });
    const onUpgradeStarted = vi.fn();
    await act(async () => {
      renderDialog({ onUpgradeStarted });
    });
    await waitForPreviewLoaded();

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-upgrade-confirm"));
    });

    // Inline, testable failure notice with a card-specific message.
    const notice = screen.getByTestId("confirm-upgrade-error");
    expect(notice).toBeInTheDocument();
    expect(notice.textContent ?? "").toMatch(/declined|payment failed/i);
    // Dialog stays open + button re-enabled so the customer can fix their card.
    expect(screen.getByTestId("confirm-upgrade-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-upgrade-confirm")).not.toBeDisabled();
    expect(onUpgradeStarted).not.toHaveBeenCalled();
  });

  it("shows a 'plan change in progress' notice when a change is already running (409)", async () => {
    mockFetchDispatch({ upgradeOk: false, upgrade: { error: "upgrade_in_progress" } });
    const onUpgradeStarted = vi.fn();
    await act(async () => {
      renderDialog({ onUpgradeStarted });
    });
    await waitForPreviewLoaded();

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-upgrade-confirm"));
    });

    const notice = screen.getByTestId("confirm-upgrade-error");
    expect(notice.textContent ?? "").toMatch(/in progress/i);
    expect(screen.getByTestId("confirm-upgrade-confirm")).not.toBeDisabled();
    expect(onUpgradeStarted).not.toHaveBeenCalled();
  });

  it("fires toast.error when upgrade fetch rejects (network failure)", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/billing/upgrade/preview")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(PREVIEW_STUB),
        });
      }
      return Promise.reject(new Error("ECONNREFUSED"));
    });

    const onUpgradeStarted = vi.fn();
    await act(async () => {
      renderDialog({ onUpgradeStarted });
    });
    await waitForPreviewLoaded();

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-upgrade-confirm"));
    });

    expect(mockToastError).toHaveBeenCalledOnce();
    expect(screen.getByTestId("confirm-upgrade-confirm")).not.toBeDisabled();
    expect(onUpgradeStarted).not.toHaveBeenCalled();
  });

  it("does NOT double-submit on rapid clicks", async () => {
    mockFetchDispatch({ upgrade: null }); // upgrade never resolves

    await act(async () => {
      renderDialog();
    });
    await waitForPreviewLoaded();

    const confirmBtn = screen.getByTestId("confirm-upgrade-confirm");

    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    // Count only upgrade calls (not preview)
    const upgradeCalls = () =>
      mockFetch.mock.calls.filter(([url]: [string]) => url === "/api/billing/upgrade");

    expect(upgradeCalls()).toHaveLength(1);
    expect(confirmBtn).toBeDisabled();

    await act(async () => {
      fireEvent.click(confirmBtn);
    }); // no-op — disabled
    expect(upgradeCalls()).toHaveLength(1);
  });
});

// ─── Accessibility attributes ─────────────────────────────────────────────────

describe("ConfirmUpgradeDialog — a11y", () => {
  it("exposes role='dialog' + aria-modal + aria-labelledby", async () => {
    await act(async () => {
      renderDialog();
    });
    const dialog = screen.getByTestId("confirm-upgrade-dialog");
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toMatch(/confirm upgrade/i);
  });
});

// ─── D9: cancel-pending auto-reactivate notice ────────────────────────────────

describe("ConfirmUpgradeDialog — D9 cancel-pending auto-reactivate note", () => {
  it("does NOT render the reactivate note when isCancelPending is false (default)", async () => {
    await act(async () => {
      renderDialog();
    });
    expect(screen.queryByTestId("confirm-upgrade-reactivate-note")).toBeNull();
  });

  it("renders the reactivate note when isCancelPending is true", async () => {
    await act(async () => {
      renderDialog({ isCancelPending: true });
    });
    const note = screen.getByTestId("confirm-upgrade-reactivate-note");
    expect(note).toBeInTheDocument();
    expect(note.textContent).toMatch(/reactivate your subscription/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R10 / D7 — provisioning-fee consent (dedicated upgrades only)
// ─────────────────────────────────────────────────────────────────────────────

describe("ConfirmUpgradeDialog — provisioning-fee consent (R10/D7)", () => {
  it("shows the non-refundable fee + a consent checkbox for a dedicated upgrade", async () => {
    // Fee now comes from the preview (server-authoritative), not derived from
    // newPriceCents. DEDICATED_PREVIEW_STUB.provisioningFeeCents = 967 → "$9.67".
    mockFetchDispatch({ preview: DEDICATED_PREVIEW_STUB });
    await act(async () => {
      renderDialog({ option: SLOW_PATH_OPTION });
    });
    await waitForPreviewLoaded();

    const consent = screen.getByTestId("provisioning-fee-consent");
    expect(consent).toBeInTheDocument();
    expect(screen.getByTestId("provisioning-fee-body")).toHaveTextContent("$9.67");
    expect(screen.getByTestId("provisioning-fee-body")).toHaveTextContent(/non-refundable/i);
  });

  it("dedicated upgrade with $0 proration still shows the fee as charged today (not 'No charge today')", async () => {
    // The regression: chargedTodayCents ignored the fee, so a dedicated upgrade
    // whose proration nets to $0 read "No charge today" while a $9.67 fee was in
    // fact charged. chargedTodayCents = 0 + 967 must render as "$9.67".
    mockFetchDispatch({
      preview: { ...DEDICATED_PREVIEW_STUB, prorationCents: 0, chargedTodayCents: 967 },
    });
    await act(async () => {
      renderDialog({ option: SLOW_PATH_OPTION });
    });
    await waitForPreviewLoaded();

    expect(screen.getByTestId("proration-charge")).toHaveTextContent("$9.67");
    expect(screen.getByTestId("proration-charge")).not.toHaveTextContent("No charge today");
    expect(screen.getByTestId("proration-charge-subtext")).toHaveTextContent(/non-refundable/i);
  });

  it("blocks Upgrade until the fee is acknowledged, then enables it", async () => {
    mockFetchDispatch({ preview: DEDICATED_PREVIEW_STUB });
    await act(async () => {
      renderDialog({ option: SLOW_PATH_OPTION });
    });
    await waitForPreviewLoaded();

    // Preview is loaded but consent not yet given → confirm disabled.
    expect(screen.getByTestId("confirm-upgrade-confirm")).toBeDisabled();

    fireEvent.click(screen.getByTestId("provisioning-fee-consent-checkbox"));

    expect(screen.getByTestId("confirm-upgrade-confirm")).not.toBeDisabled();
  });

  it("does NOT gate a shared→shared upgrade (no consent block, confirm enabled once loaded)", async () => {
    await act(async () => {
      renderDialog({ option: FAST_PATH_OPTION });
    });
    await waitForPreviewLoaded();

    expect(screen.queryByTestId("provisioning-fee-consent")).not.toBeInTheDocument();
    expect(screen.getByTestId("confirm-upgrade-confirm")).not.toBeDisabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Responsive layout — tall content must not push the Upgrade button off-screen
//
// Regression: on short / zoomed viewports the un-bounded, vertically-centred
// panel grew past the viewport and the action buttons fell off the bottom with
// no way to scroll to them. The fix bounds the panel height, scrolls the body,
// and pins the buttons in a non-scrolling footer. jsdom has no layout engine,
// so these assert the structural contract that guarantees the buttons stay
// reachable, using the tallest (dedicated + consent) variant.
// ─────────────────────────────────────────────────────────────────────────────

describe("ConfirmUpgradeDialog — responsive layout", () => {
  it("bounds the panel height and clips overflow so it can never exceed the viewport", async () => {
    await act(async () => {
      renderDialog();
    });
    const panel = screen
      .getByTestId("confirm-upgrade-dialog")
      .querySelector(":scope > div.relative");
    expect(panel).toBeTruthy();
    const cls = (panel as HTMLElement).className;
    expect(cls).toContain("max-h-[calc(100dvh-var(--site-nav-h)-3rem)]");
    expect(cls).toContain("overflow-hidden");
    expect(cls).toContain("flex-col");
  });

  it("puts the long content in a scrollable body region", async () => {
    await act(async () => {
      renderDialog({ option: SLOW_PATH_OPTION });
    });
    await waitForPreviewLoaded();

    const scroll = screen.getByTestId("confirm-upgrade-scroll");
    expect(scroll.className).toContain("overflow-y-auto");
    expect(scroll.className).toContain("flex-1");
    // The pricing block (always present) lives inside the scroll region.
    expect(scroll.querySelector('[data-testid="proration-charge"]')).toBeTruthy();
  });

  it("pins the action buttons in a non-scrolling footer, outside the scroll region", async () => {
    await act(async () => {
      renderDialog({ option: SLOW_PATH_OPTION });
    });
    await waitForPreviewLoaded();

    const footer = screen.getByTestId("confirm-upgrade-footer");
    const scroll = screen.getByTestId("confirm-upgrade-scroll");
    const confirm = screen.getByTestId("confirm-upgrade-confirm");
    const cancel = screen.getByTestId("confirm-upgrade-cancel");

    // Buttons live in the footer, NOT in the scrollable body.
    expect(footer.contains(confirm)).toBe(true);
    expect(footer.contains(cancel)).toBe(true);
    expect(scroll.contains(confirm)).toBe(false);

    // Footer itself must not scroll and must not shrink — it stays pinned.
    expect(footer.className).toContain("shrink-0");
    expect(footer.className).not.toContain("overflow-y-auto");
  });

  it("pins the fee-consent checkbox in the footer, ABOVE the Upgrade button (always visible)", async () => {
    await act(async () => {
      renderDialog({ option: SLOW_PATH_OPTION });
    });
    await waitForPreviewLoaded();

    const footer = screen.getByTestId("confirm-upgrade-footer");
    const scroll = screen.getByTestId("confirm-upgrade-scroll");
    const consent = screen.getByTestId("provisioning-fee-consent");
    const checkbox = screen.getByTestId("provisioning-fee-consent-checkbox");
    const confirm = screen.getByTestId("confirm-upgrade-confirm");

    // Consent now lives in the pinned footer, not the scrollable body — so the
    // customer can never reach a disabled Upgrade button without seeing the gate.
    expect(footer.contains(consent)).toBe(true);
    expect(scroll.contains(consent)).toBe(false);

    // The checkbox must come BEFORE the Upgrade button in DOM order (above it).
    const position = checkbox.compareDocumentPosition(confirm);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
