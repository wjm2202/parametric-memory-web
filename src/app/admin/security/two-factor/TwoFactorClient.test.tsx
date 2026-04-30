/**
 * Tests for TwoFactorClient.
 *
 * The wizard is large; the tests focus on the four flows that user behaviour
 * actually depends on:
 *
 *   1. Enrolment happy path — intro → scan → verify → codes → finish.
 *   2. Wrong code on verify — stays on verify, shows inline error, clears
 *      input. Does NOT navigate to codes.
 *   3. Disable happy path — accepts both 6-digit code and xxxx-xxxx backup
 *      code (parametrized).
 *   4. Regenerate happy path + backup-code rejection.
 *
 * The recent-auth gate is mocked at the module level — its own tests cover
 * its branches. Here we always render with the gate "open".
 *
 * fetch is stubbed per-test. We rely on the production component's contract
 * with the compute API: `{ error: { code, message } }` envelopes for
 * non-200 responses, raw JSON for 200.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import TwoFactorClient from "./TwoFactorClient";
import * as useRecentAuthModule from "@/hooks/useRecentAuth";
import { Toaster } from "sonner";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const pushSpy = vi.fn();
const replaceSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushSpy, replace: replaceSpy }),
}));

// SiteNavbar is irrelevant here and pulls in nav state machinery that the
// jsdom env doesn't need to exercise.
vi.mock("@/components/ui/SiteNavbar", () => ({
  default: () => <nav data-testid="mock-site-navbar" />,
}));

// RecentAuthGate is unconditionally "open" in these tests — its own tests
// cover the closed/loading/error branches.
vi.mock("@/components/RecentAuthGate", () => ({
  RecentAuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const ACCOUNT = { id: "acct-1", email: "alice@example.com" };

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

// Mock the hook for each test.
function mockStatus(value: typeof NOT_ENROLLED | typeof ENROLLED) {
  vi.spyOn(useRecentAuthModule, "useRecentAuth").mockReturnValue({
    status: value,
    loading: false,
    error: null,
    refetch: vi.fn().mockResolvedValue(undefined),
  });
}

// Stub fetch for each test.
function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(handler) as unknown as typeof fetch);
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

// Stub URL.createObjectURL — the BackupCodeDownloadButton uses Blob URLs and
// jsdom's URL doesn't implement them.
beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:fake"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  pushSpy.mockClear();
  replaceSpy.mockClear();
});

// ─── 1. Enrolment happy path ─────────────────────────────────────────────────

describe("TwoFactorClient — enrolment happy path", () => {
  it("walks intro → scan → verify → codes → finish", async () => {
    mockStatus(NOT_ENROLLED);
    stubFetch(async (url) => {
      if (url === "/api/auth/factors/totp/setup-init") {
        return jsonResponse(200, {
          secret: "JBSWY3DPEHPK3PXP",
          otpauthUri: "otpauth://totp/MMPM:alice@example.com?secret=JBSWY3DPEHPK3PXP",
          qrSvg: "<svg data-mock='qr'><rect/></svg>",
        });
      }
      if (url === "/api/auth/factors/totp/setup-verify") {
        return jsonResponse(200, {
          backupCodes: [
            "a3f0-bd97",
            "0c2f-9e21",
            "7b50-1a4c",
            "5d12-3e8f",
            "9f0a-7b6c",
            "2e8d-4a5b",
            "6c7d-8e9f",
            "1a2b-3c4d",
            "5e6f-7a8b",
            "9c0d-1e2f",
          ],
        });
      }
      throw new Error(`unexpected url ${url}`);
    });

    render(
      <>
        <TwoFactorClient account={ACCOUNT} />
        <Toaster />
      </>,
    );

    // Step 1: intro
    expect(screen.getByTestId("enrol-step-intro")).toBeTruthy();
    fireEvent.click(screen.getByTestId("enrol-step-intro-continue"));

    // Step 2: scan — QR rendered.
    await waitFor(() => expect(screen.getByTestId("enrol-step-scan")).toBeTruthy());
    // jsdom (like every browser) canonicalises HTML attributes to double-quoted
    // form when reading innerHTML, regardless of how the source string was
    // quoted in the dangerouslySetInnerHTML payload. We assert the canonical
    // form so the test is robust against quote-style changes upstream.
    expect(screen.getByTestId("enrol-qr-svg").innerHTML).toContain('data-mock="qr"');
    expect(screen.getByTestId("enrol-manual-key").textContent).toBe("JBSWY3DPEHPK3PXP");
    fireEvent.click(screen.getByTestId("enrol-step-scan-continue"));

    // Step 3: verify — type the 6-digit code (auto-submits via onComplete).
    expect(screen.getByTestId("enrol-step-verify")).toBeTruthy();
    for (let i = 0; i < 6; i++) {
      fireEvent.change(screen.getByTestId(`six-digit-input-${i}`), {
        target: { value: String(i + 1) },
      });
    }
    // Auto-submit landed at the codes step.
    await waitFor(() => expect(screen.getByTestId("enrol-step-codes")).toBeTruthy());
    expect(screen.getAllByTestId(/^enrol-backup-code-/)).toHaveLength(10);

    // Step 5: acknowledge and finish.
    fireEvent.click(screen.getByTestId("enrol-acknowledge"));
    fireEvent.click(screen.getByTestId("enrol-step-codes-finish"));
    expect(pushSpy).toHaveBeenCalledWith("/admin/security");
  });
});

// ─── 2. Wrong code on verify ─────────────────────────────────────────────────

describe("TwoFactorClient — wrong code on verify", () => {
  it("stays on verify step with inline error, clears input", async () => {
    mockStatus(NOT_ENROLLED);
    stubFetch(async (url) => {
      if (url === "/api/auth/factors/totp/setup-init") {
        return jsonResponse(200, {
          secret: "S",
          otpauthUri: "otpauth://x",
          qrSvg: "<svg/>",
        });
      }
      if (url === "/api/auth/factors/totp/setup-verify") {
        return jsonResponse(401, {
          error: { code: "totp_invalid", message: "Wrong code" },
        });
      }
      throw new Error(`unexpected ${url}`);
    });

    render(<TwoFactorClient account={ACCOUNT} />);

    fireEvent.click(screen.getByTestId("enrol-step-intro-continue"));
    await waitFor(() => expect(screen.getByTestId("enrol-step-scan")).toBeTruthy());
    fireEvent.click(screen.getByTestId("enrol-step-scan-continue"));

    for (let i = 0; i < 6; i++) {
      fireEvent.change(screen.getByTestId(`six-digit-input-${i}`), {
        target: { value: "9" },
      });
    }

    await waitFor(() => expect(screen.getByTestId("enrol-verify-error")).toBeTruthy());
    // Still on verify step, NOT codes step.
    expect(screen.getByTestId("enrol-step-verify")).toBeTruthy();
    expect(screen.queryByTestId("enrol-step-codes")).toBeNull();
    // Input cleared.
    expect((screen.getByTestId("six-digit-input-0") as HTMLInputElement).value).toBe("");
  });
});

// ─── 3. Disable accepts both code formats ─────────────────────────────────────

describe("TwoFactorClient — disable", () => {
  it.each([
    ["6-digit TOTP code", "456789"],
    ["xxxx-xxxx backup code", "a3f0-bd97"],
  ])("disable accepts a %s and routes to /admin/security", async (_label, codeStr) => {
    mockStatus(ENROLLED);
    stubFetch(async (url, init) => {
      if (url === "/api/auth/factors/totp/disable") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { code: string };
        expect(body.code).toBe(codeStr);
        return jsonResponse(200, { ok: true });
      }
      throw new Error(`unexpected ${url}`);
    });

    render(
      <>
        <TwoFactorClient account={ACCOUNT} />
        <Toaster />
      </>,
    );

    fireEvent.click(screen.getByTestId("manage-go-disable"));
    fireEvent.change(screen.getByTestId("manage-disable-input"), {
      target: { value: codeStr },
    });
    fireEvent.click(screen.getByTestId("manage-disable-submit"));

    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith("/admin/security"));
  });

  it("disable with wrong code shows inline error, stays on disable step", async () => {
    mockStatus(ENROLLED);
    stubFetch(async (url) => {
      if (url === "/api/auth/factors/totp/disable") {
        return jsonResponse(401, {
          error: { code: "totp_invalid", message: "Wrong code" },
        });
      }
      throw new Error(`unexpected ${url}`);
    });

    render(<TwoFactorClient account={ACCOUNT} />);

    fireEvent.click(screen.getByTestId("manage-go-disable"));
    fireEvent.change(screen.getByTestId("manage-disable-input"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByTestId("manage-disable-submit"));

    await waitFor(() => expect(screen.getByTestId("manage-disable-error")).toBeTruthy());
    expect(screen.getByTestId("manage-step-disable")).toBeTruthy();
    expect(pushSpy).not.toHaveBeenCalled();
  });
});

// ─── 4. Regenerate ────────────────────────────────────────────────────────────

describe("TwoFactorClient — regenerate", () => {
  it("happy path → shows new codes", async () => {
    mockStatus(ENROLLED);
    stubFetch(async (url) => {
      if (url === "/api/auth/factors/totp/regenerate-backup-codes") {
        return jsonResponse(200, {
          backupCodes: [
            "1111-2222",
            "3333-4444",
            "5555-6666",
            "7777-8888",
            "9999-0000",
            "aaaa-bbbb",
            "cccc-dddd",
            "eeee-ffff",
            "1234-5678",
            "9876-5432",
          ],
        });
      }
      throw new Error(`unexpected ${url}`);
    });

    render(<TwoFactorClient account={ACCOUNT} />);

    fireEvent.click(screen.getByTestId("manage-go-regenerate"));
    for (let i = 0; i < 6; i++) {
      fireEvent.change(screen.getByTestId(`six-digit-input-${i}`), {
        target: { value: String((i + 1) % 10) },
      });
    }
    await waitFor(() => expect(screen.getByTestId("manage-step-codes")).toBeTruthy());
    expect(screen.getAllByTestId(/^manage-backup-code-/)).toHaveLength(10);
  });

  it("backup-code submitted to regenerate gets surface a friendly error from totp_invalid_input", async () => {
    mockStatus(ENROLLED);
    stubFetch(async () =>
      jsonResponse(400, {
        error: { code: "totp_invalid_input", message: "backup code rejected" },
      }),
    );

    render(<TwoFactorClient account={ACCOUNT} />);
    fireEvent.click(screen.getByTestId("manage-go-regenerate"));
    // SixDigitInput is digit-only so the user can't actually paste a backup
    // code through it; this test simulates the API rejecting the call as a
    // safety net (compute will reject backup codes regardless).
    for (let i = 0; i < 6; i++) {
      fireEvent.change(screen.getByTestId(`six-digit-input-${i}`), {
        target: { value: "0" },
      });
    }
    await waitFor(() => expect(screen.getByTestId("manage-regenerate-error")).toBeTruthy());
    expect(screen.getByTestId("manage-step-regenerate")).toBeTruthy();
    expect(screen.queryByTestId("manage-step-codes")).toBeNull();
  });
});

// ─── 5. Loading + error branches ──────────────────────────────────────────────

describe("TwoFactorClient — top-level branches", () => {
  it("loading state renders skeleton", () => {
    vi.spyOn(useRecentAuthModule, "useRecentAuth").mockReturnValue({
      status: null,
      loading: true,
      error: null,
      refetch: vi.fn().mockResolvedValue(undefined),
    });
    render(<TwoFactorClient account={ACCOUNT} />);
    expect(screen.getByTestId("two-factor-loading")).toBeTruthy();
  });

  it("network error renders retry card", () => {
    vi.spyOn(useRecentAuthModule, "useRecentAuth").mockReturnValue({
      status: null,
      loading: false,
      error: "network",
      refetch: vi.fn().mockResolvedValue(undefined),
    });
    render(<TwoFactorClient account={ACCOUNT} />);
    expect(screen.getByTestId("two-factor-error")).toBeTruthy();
  });

  it("session_expired triggers replace to /login", () => {
    vi.spyOn(useRecentAuthModule, "useRecentAuth").mockReturnValue({
      status: null,
      loading: false,
      error: "session_expired",
      refetch: vi.fn().mockResolvedValue(undefined),
    });
    render(<TwoFactorClient account={ACCOUNT} />);
    expect(replaceSpy).toHaveBeenCalledWith("/login?error=session_expired");
  });
});
