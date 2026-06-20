/**
 * Tests for DestroyModal (D2) — the single Destroy & Unsubscribe modal.
 *
 * Verifies NO-SILENT-BLOCK messaging: the success toast fires only on 2xx, and
 * every non-OK outcome (409 manual review, 500) surfaces honest copy while the
 * modal stays open. Also covers the type-"destroy" gate and the refund preview.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { DestroyModal } from "./DestroyModal";

const h = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: h.toastSuccess, error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/reauth", () => ({
  readReauthFlag: vi.fn().mockResolvedValue(false),
  redirectToReauth: vi.fn(),
}));

// Per-test destroy response; the preview always succeeds.
type FakeRes = { ok: boolean; status: number; body: unknown };
let destroyRes: FakeRes;

function fakeFetch(url: string): Promise<Response> {
  if (url.includes("/refund-preview")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ refundCents: 350, withheldFeeCents: 0 }),
    } as unknown as Response);
  }
  // /destroy
  return Promise.resolve({
    ok: destroyRes.ok,
    status: destroyRes.status,
    json: () => Promise.resolve(destroyRes.body),
  } as unknown as Response);
}

beforeEach(() => {
  h.toastSuccess.mockReset();
  destroyRes = {
    ok: true,
    status: 200,
    body: { timing: "now", destroyed: true, refund: { refunded: true } },
  };
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function selectNowAndType(value = "destroy") {
  fireEvent.click(screen.getByTestId("destroy-timing-now"));
  await waitFor(() => expect(screen.getByTestId("destroy-refund-amount")).toBeTruthy());
  fireEvent.change(screen.getByTestId("destroy-confirm-input"), { target: { value } });
}

describe("DestroyModal", () => {
  it("renders both timing options", () => {
    render(<DestroyModal slug="brave-moon" onClose={vi.fn()} onDestroyed={vi.fn()} />);
    expect(screen.getByTestId("destroy-timing-period_end")).toBeTruthy();
    expect(screen.getByTestId("destroy-timing-now")).toBeTruthy();
  });

  it("now: loads the refund preview and gates confirm on typing 'destroy'", async () => {
    render(<DestroyModal slug="brave-moon" onClose={vi.fn()} onDestroyed={vi.fn()} />);
    fireEvent.click(screen.getByTestId("destroy-timing-now"));
    await waitFor(() =>
      expect(screen.getByTestId("destroy-refund-amount").textContent).toContain("$3.50"),
    );

    const confirm = screen.getByTestId("destroy-modal-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true); // not typed yet
    fireEvent.change(screen.getByTestId("destroy-confirm-input"), { target: { value: "nope" } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("destroy-confirm-input"), { target: { value: "destroy" } });
    expect(confirm.disabled).toBe(false);
  });

  it("now success → success toast + onDestroyed", async () => {
    const onDestroyed = vi.fn();
    const onClose = vi.fn();
    render(<DestroyModal slug="brave-moon" onClose={onClose} onDestroyed={onDestroyed} />);
    await selectNowAndType();
    await act(async () => {
      fireEvent.click(screen.getByTestId("destroy-modal-confirm"));
    });
    await waitFor(() => expect(onDestroyed).toHaveBeenCalledOnce());
    expect(h.toastSuccess).toHaveBeenCalledWith("Substrate destroyed", expect.any(Object));
    expect(onClose).toHaveBeenCalled();
  });

  it("now 409 manual review → honest copy, NO success, modal stays, onDestroyed NOT called", async () => {
    destroyRes = { ok: false, status: 409, body: { error: "refund_requires_manual_review" } };
    const onDestroyed = vi.fn();
    render(<DestroyModal slug="brave-moon" onClose={vi.fn()} onDestroyed={onDestroyed} />);
    await selectNowAndType();
    await act(async () => {
      fireEvent.click(screen.getByTestId("destroy-modal-confirm"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("destroy-modal-error").textContent).toMatch(/manual review/i),
    );
    expect(screen.getByTestId("destroy-modal-error").textContent).toMatch(
      /not been charged or refunded/i,
    );
    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(onDestroyed).not.toHaveBeenCalled();
  });

  it("now 500 → 'nothing was changed', no success toast", async () => {
    destroyRes = { ok: false, status: 500, body: { error: "destroy_failed" } };
    render(<DestroyModal slug="brave-moon" onClose={vi.fn()} onDestroyed={vi.fn()} />);
    await selectNowAndType();
    await act(async () => {
      fireEvent.click(screen.getByTestId("destroy-modal-confirm"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("destroy-modal-error").textContent).toMatch(/nothing was changed/i),
    );
    expect(h.toastSuccess).not.toHaveBeenCalled();
  });

  it("period_end success → scheduled toast + onDestroyed", async () => {
    destroyRes = {
      ok: true,
      status: 200,
      body: { timing: "period_end", destroyed: false, scheduled: true },
    };
    const onDestroyed = vi.fn();
    render(
      <DestroyModal
        slug="brave-moon"
        endsOn="30 Jun 2026"
        onClose={vi.fn()}
        onDestroyed={onDestroyed}
      />,
    );
    // period_end is the default selection → confirm immediately.
    await act(async () => {
      fireEvent.click(screen.getByTestId("destroy-modal-confirm"));
    });
    await waitFor(() => expect(onDestroyed).toHaveBeenCalledOnce());
    expect(h.toastSuccess).toHaveBeenCalledWith("Cancellation scheduled", expect.any(Object));
  });
});
