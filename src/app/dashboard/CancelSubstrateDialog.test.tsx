/**
 * Tests for CancelSubstrateDialog — D6 minimum-copy cancel modal.
 *
 * Pins the minimum-copy contract: the dialog must display "Your paid
 * subscription will end on DD MMM YYYY." with two buttons and no warning
 * prose. If a future change tries to add a "your data will be deleted"
 * scarewall, these assertions fail.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/reauth", () => ({
  readReauthFlag: vi.fn().mockResolvedValue(false),
  redirectToReauth: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { CancelSubstrateDialog } from "./CancelSubstrateDialog";
import * as reauthModule from "@/lib/reauth";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(reauthModule.readReauthFlag).mockResolvedValue(false);
});

describe("CancelSubstrateDialog (D6 minimum copy)", () => {
  it("renders ONLY the slug, the date sentence, and two buttons", () => {
    render(
      <CancelSubstrateDialog
        slug="spicy-tortoise"
        endsOn="14 Jun 2026"
        onSuccess={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Cancel spicy-tortoise/)).toBeInTheDocument();
    expect(screen.getByText(/Your paid subscription will end on/)).toBeInTheDocument();
    expect(screen.getByText("14 Jun 2026")).toBeInTheDocument();
    expect(screen.getByTestId("cancel-substrate-dialog-keep")).toBeInTheDocument();
    expect(screen.getByTestId("cancel-substrate-dialog-confirm")).toBeInTheDocument();
  });

  it("D6 regression — does NOT include warning prose about data deletion or export", () => {
    render(
      <CancelSubstrateDialog
        slug="x"
        endsOn="1 Jan 2026"
        onSuccess={() => {}}
        onClose={() => {}}
      />,
    );
    const dialog = screen.getByTestId("cancel-substrate-dialog");
    const text = dialog.textContent ?? "";
    // The locked D6 copy is "Your paid subscription will end on <date>."
    // Anything else here would be a creep towards scare-warn prose.
    expect(text).not.toMatch(/permanently/i);
    expect(text).not.toMatch(/cannot be recovered/i);
    expect(text).not.toMatch(/export your data/i);
    expect(text).not.toMatch(/30 days/i); // no grace tail messaging
  });

  it("fires onClose when backdrop is clicked (not while submitting)", () => {
    const onClose = vi.fn();
    render(
      <CancelSubstrateDialog slug="x" endsOn="1 Jan 2026" onSuccess={() => {}} onClose={onClose} />,
    );
    fireEvent.click(screen.getByTestId("cancel-substrate-dialog-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fires onClose when Keep subscription is clicked", () => {
    const onClose = vi.fn();
    render(
      <CancelSubstrateDialog slug="x" endsOn="1 Jan 2026" onSuccess={() => {}} onClose={onClose} />,
    );
    fireEvent.click(screen.getByTestId("cancel-substrate-dialog-keep"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("POSTs to /api/substrates/:slug/cancel on confirm, calls onSuccess on 200", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ scheduled: true, cancelAt: "2026-06-14T00:00:00Z" }),
      // For readReauthFlag — it reads .clone().json() in the helper but the
      // mock returns false unconditionally above. Adding .clone for safety.
      clone: () => ({ json: () => Promise.resolve({}) }),
    });
    const onSuccess = vi.fn();
    render(
      <CancelSubstrateDialog
        slug="spicy-tortoise"
        endsOn="14 Jun 2026"
        onSuccess={onSuccess}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("cancel-substrate-dialog-confirm"));
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/substrates/spicy-tortoise/cancel",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("renders an error notice and stays open when compute returns 500", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "cancellation_failed" }),
      clone: () => ({ json: () => Promise.resolve({}) }),
    });
    const onSuccess = vi.fn();
    render(
      <CancelSubstrateDialog
        slug="x"
        endsOn="1 Jan 2026"
        onSuccess={onSuccess}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("cancel-substrate-dialog-confirm"));
    await waitFor(() => {
      expect(screen.getByTestId("cancel-substrate-dialog-error")).toBeInTheDocument();
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("redirects via reauth helper when recent-auth window expired", async () => {
    vi.mocked(reauthModule.readReauthFlag).mockResolvedValueOnce(true);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ code: "reauth_required" }),
      clone: () => ({ json: () => Promise.resolve({}) }),
    });
    render(
      <CancelSubstrateDialog
        slug="x"
        endsOn="1 Jan 2026"
        onSuccess={() => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("cancel-substrate-dialog-confirm"));
    await waitFor(() => {
      expect(reauthModule.redirectToReauth).toHaveBeenCalledTimes(1);
    });
  });
});
