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
 *      substrateSlug, targetTier, and an idempotencyKey, then navigates the
 *      browser to the returned checkoutUrl.
 *   6. Submitting state: button label swaps to "Redirecting to checkout…"
 *      and Cancel is disabled.
 *   7. Error path (non-ok response): toast.error is fired, the dialog stays
 *      open, Upgrade button re-enables so the user can retry.
 *   8. Error path (network failure): same as above.
 *   9. Esc key closes the dialog (when not submitting).
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
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

// Global fetch — each test arranges its own resolved/rejected mock.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// jsdom's `window.location` is read-only. Replace it with a plain writable
// object so we can inspect what the SUT assigned to `.href`.
//
// We do this fresh before each test to keep assertions independent.
function installMockLocation() {
  const mockLocation = { href: "" } as unknown as Location;
  Object.defineProperty(window, "location", {
    value: mockLocation,
    writable: true,
    configurable: true,
  });
  return mockLocation;
}

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

function renderDialog(
  overrides: {
    option?: UpgradeOption;
    currentTier?: string;
    nextBillingDate?: Date | null;
    substrateSlug?: string;
    onClose?: () => void;
  } = {},
) {
  const onClose = overrides.onClose ?? vi.fn();
  const utils = render(
    <ConfirmUpgradeDialog
      substrateSlug={overrides.substrateSlug ?? "bold-junction"}
      currentTier={overrides.currentTier ?? "indie"}
      option={overrides.option ?? FAST_PATH_OPTION}
      nextBillingDate={
        overrides.nextBillingDate === undefined ? NEXT_BILLING : overrides.nextBillingDate
      }
      onClose={onClose}
    />,
  );
  return { ...utils, onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockToastError.mockClear();
  installMockLocation();
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

// ─── Happy path — POST + redirect ─────────────────────────────────────────────

describe("ConfirmUpgradeDialog — Upgrade happy path", () => {
  it("POSTs to /api/billing/upgrade with slug + targetTier + idempotencyKey", async () => {
    const location = installMockLocation();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ checkoutUrl: "https://checkout.stripe.com/c/xyz" }),
    });

    renderDialog({ substrateSlug: "bold-junction", option: FAST_PATH_OPTION });

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-upgrade-confirm"));
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/billing/upgrade");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string);
    expect(body.substrateSlug).toBe("bold-junction");
    expect(body.targetTier).toBe("pro");
    // idempotencyKey should be non-empty and stable across retries in the
    // same dialog mount — at minimum it's present.
    expect(typeof body.idempotencyKey).toBe("string");
    expect(body.idempotencyKey.length).toBeGreaterThan(0);

    // Redirect fired.
    expect(location.href).toBe("https://checkout.stripe.com/c/xyz");
    // No error toast.
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("swaps the button label to 'Redirecting to checkout…' while submitting", async () => {
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
    expect(confirmBtn).toHaveTextContent(/redirecting to checkout/i);
    expect(confirmBtn).toBeDisabled();
    // Cancel disabled during submit too.
    expect(screen.getByTestId("confirm-upgrade-cancel")).toBeDisabled();

    // Tidy up the hanging promise so vitest doesn't complain.
    await act(async () => {
      resolveFetch({
        ok: true,
        json: () => Promise.resolve({ checkoutUrl: "https://checkout.stripe.com/c/xyz" }),
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
        json: () => Promise.resolve({ checkoutUrl: "https://x" }),
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
      json: () => Promise.resolve({ error: "tier_change_in_flight" }),
    });

    renderDialog();

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-upgrade-confirm"));
    });

    expect(mockToastError).toHaveBeenCalledOnce();
    // Dialog still in the DOM.
    expect(screen.getByTestId("confirm-upgrade-dialog")).toBeInTheDocument();
    // Button re-enabled so the user can retry or cancel.
    expect(screen.getByTestId("confirm-upgrade-confirm")).not.toBeDisabled();
    expect(screen.getByTestId("confirm-upgrade-cancel")).not.toBeDisabled();
  });

  it("fires toast.error when fetch rejects (network failure)", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    renderDialog();

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-upgrade-confirm"));
    });

    expect(mockToastError).toHaveBeenCalledOnce();
    expect(screen.getByTestId("confirm-upgrade-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-upgrade-confirm")).not.toBeDisabled();
  });

  it("fires toast.error when the response body is missing checkoutUrl", async () => {
    // 200 OK but malformed body — defensive path. Backend should never do this
    // but we don't want to crash the client on a shape surprise.
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ notCheckout: "wat" }),
    });

    renderDialog();

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-upgrade-confirm"));
    });

    expect(mockToastError).toHaveBeenCalledOnce();
    expect(screen.getByTestId("confirm-upgrade-confirm")).not.toBeDisabled();
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
        json: () => Promise.resolve({ checkoutUrl: "https://x" }),
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
