/**
 * Tests for TwoFactorChallengeClient.
 *
 * Coverage:
 *   1. Default render — TOTP mode, six-digit input present, no error.
 *   2. Toggle to backup-code mode swaps the input + adds a submit button.
 *   3. Successful TOTP submit (auto-submit on 6th digit) → window.location.assign(next).
 *   4. Successful backup-code submit → same redirect.
 *   5. Wrong code (401 totp_invalid) → inline error with attemptsRemaining.
 *   6. Lockout (429 totp_locked) → big lockout card replaces the form.
 *   7. Pending expired (401 pending_token_invalid_or_expired) → router.replace to /login.
 *   8. Network failure → inline "could not reach the server" error.
 *
 * Mocks:
 *   - next/navigation: useRouter (replace spy).
 *   - global fetch.
 *   - window.location.assign (otherwise jsdom navigates the test runner).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import TwoFactorChallengeClient from "./TwoFactorChallengeClient";

const replaceSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceSpy }),
}));

const locationAssignSpy = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  // Stub window.location.assign — jsdom's location is read-only by default,
  // and a real navigation in a test would tear down the test runner.
  Object.defineProperty(window, "location", {
    writable: true,
    value: { ...window.location, assign: locationAssignSpy },
  });
  // Ensure document.cookie is clean for the redirect-cookie reader.
  document.cookie = "mmpm_redirect=;path=/;max-age=0";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  replaceSpy.mockClear();
  locationAssignSpy.mockClear();
});

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function stubFetchOnce(response: Response) {
  (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(response);
}

// ─── 1. Default render ────────────────────────────────────────────────────────

describe("TwoFactorChallengeClient — default render", () => {
  it("renders the TOTP prompt with six-digit input", () => {
    render(<TwoFactorChallengeClient />);
    expect(screen.getByTestId("two-factor-challenge")).toBeTruthy();
    // Six SixDigitInput fields.
    for (let i = 0; i < 6; i++) {
      expect(screen.getByTestId(`six-digit-input-${i}`)).toBeTruthy();
    }
    // Toggle button to switch to backup-code mode.
    expect(screen.getByTestId("two-factor-challenge-toggle-mode").textContent).toMatch(
      /backup code/i,
    );
  });
});

// ─── 2. Toggle to backup-code mode ───────────────────────────────────────────

describe("TwoFactorChallengeClient — backup-code mode", () => {
  it("toggle swaps the SixDigitInput for the backup-code text input", () => {
    render(<TwoFactorChallengeClient />);
    fireEvent.click(screen.getByTestId("two-factor-challenge-toggle-mode"));
    expect(screen.getByTestId("two-factor-challenge-backup-input")).toBeTruthy();
    expect(screen.getByTestId("two-factor-challenge-submit")).toBeTruthy();
    // Six-digit input is gone.
    expect(screen.queryByTestId("six-digit-input-0")).toBeNull();
  });
});

// ─── 3. Successful TOTP submit ───────────────────────────────────────────────

describe("TwoFactorChallengeClient — happy paths", () => {
  it("typing 6 digits auto-submits and redirects on success", async () => {
    stubFetchOnce(jsonResponse(200, { ok: true, accountId: "acct-1" }));
    render(<TwoFactorChallengeClient />);

    for (let i = 0; i < 6; i++) {
      fireEvent.change(screen.getByTestId(`six-digit-input-${i}`), {
        target: { value: String(i + 1) },
      });
    }

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/auth/factors/totp/login-verify",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ code: "123456" }),
        }),
      );
    });
    await waitFor(() => expect(locationAssignSpy).toHaveBeenCalledWith("/admin"));
  });

  it("backup-code submit posts and redirects on success", async () => {
    stubFetchOnce(jsonResponse(200, { ok: true, accountId: "acct-1" }));
    render(<TwoFactorChallengeClient />);

    fireEvent.click(screen.getByTestId("two-factor-challenge-toggle-mode"));
    fireEvent.change(screen.getByTestId("two-factor-challenge-backup-input"), {
      target: { value: "a3f0-bd97" },
    });
    fireEvent.click(screen.getByTestId("two-factor-challenge-submit"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/auth/factors/totp/login-verify",
        expect.objectContaining({ body: JSON.stringify({ code: "a3f0-bd97" }) }),
      );
    });
    await waitFor(() => expect(locationAssignSpy).toHaveBeenCalledWith("/admin"));
  });

  it("honours mmpm_redirect cookie when present and safe", async () => {
    document.cookie = "mmpm_redirect=" + encodeURIComponent("/admin/security") + ";path=/";
    stubFetchOnce(jsonResponse(200, { ok: true, accountId: "acct-1" }));
    render(<TwoFactorChallengeClient />);
    for (let i = 0; i < 6; i++) {
      fireEvent.change(screen.getByTestId(`six-digit-input-${i}`), {
        target: { value: String(i + 1) },
      });
    }
    await waitFor(() => expect(locationAssignSpy).toHaveBeenCalledWith("/admin/security"));
  });

  it("rejects open-redirect via // in mmpm_redirect cookie", async () => {
    document.cookie = "mmpm_redirect=" + encodeURIComponent("//evil.com/x") + ";path=/";
    stubFetchOnce(jsonResponse(200, { ok: true, accountId: "acct-1" }));
    render(<TwoFactorChallengeClient />);
    for (let i = 0; i < 6; i++) {
      fireEvent.change(screen.getByTestId(`six-digit-input-${i}`), {
        target: { value: String(i + 1) },
      });
    }
    await waitFor(() => expect(locationAssignSpy).toHaveBeenCalledWith("/admin"));
  });

  // ─── SPRINT-11.M2 regression guards ───────────────────────────────────
  //
  // Pre-M2 the inline check was `startsWith("/") && !startsWith("//")` — it
  // accepted backslash and control-character payloads which some browsers
  // normalise (`\` → `/`) or use to smuggle CRLF into the Location header.
  // Post-M2 the cookie is validated by `validateReturnTo`, the same helper
  // the OAuth path uses. These two cases prove the cutover happened — they
  // would have FAILED before M2 (the user would have been redirected to
  // the malicious destination) and PASS now (fall back to /admin).

  it("SPRINT-11.M2: rejects backslash trick (`/\\evil.com`) — falls back to /admin", async () => {
    // Browsers (Chrome / Safari) normalise `\` to `/` in Location headers,
    // so `/\evil.com` would silently redirect to `//evil.com/...`. The
    // inline pre-M2 check did NOT reject backslash; validateReturnTo does.
    document.cookie = "mmpm_redirect=" + encodeURIComponent("/\\evil.com/x") + ";path=/";
    stubFetchOnce(jsonResponse(200, { ok: true, accountId: "acct-1" }));
    render(<TwoFactorChallengeClient />);
    for (let i = 0; i < 6; i++) {
      fireEvent.change(screen.getByTestId(`six-digit-input-${i}`), {
        target: { value: String(i + 1) },
      });
    }
    await waitFor(() => expect(locationAssignSpy).toHaveBeenCalledWith("/admin"));
  });

  it("SPRINT-11.M2: rejects out-of-allowlist path — falls back to /admin", async () => {
    // `/login` looks superficially safe (starts with `/`, no `//`), so the
    // inline pre-M2 check accepted it. validateReturnTo is path-allowlist
    // only — `/login` is not under `/`, `/dashboard`, or `/admin`, so it's
    // rejected. This is a behaviour TIGHTENING that matches the OAuth
    // flow's screen — both auth paths now share one allowlist.
    document.cookie = "mmpm_redirect=" + encodeURIComponent("/login") + ";path=/";
    stubFetchOnce(jsonResponse(200, { ok: true, accountId: "acct-1" }));
    render(<TwoFactorChallengeClient />);
    for (let i = 0; i < 6; i++) {
      fireEvent.change(screen.getByTestId(`six-digit-input-${i}`), {
        target: { value: String(i + 1) },
      });
    }
    await waitFor(() => expect(locationAssignSpy).toHaveBeenCalledWith("/admin"));
  });
});

// ─── 4. Failure paths ────────────────────────────────────────────────────────

describe("TwoFactorChallengeClient — failure paths", () => {
  it("wrong code → inline error with attemptsRemaining", async () => {
    stubFetchOnce(
      jsonResponse(401, {
        error: { code: "totp_invalid", message: "Wrong", attemptsRemaining: 4 },
      }),
    );
    render(<TwoFactorChallengeClient />);
    for (let i = 0; i < 6; i++) {
      fireEvent.change(screen.getByTestId(`six-digit-input-${i}`), {
        target: { value: "9" },
      });
    }
    await waitFor(() => {
      const err = screen.getByTestId("two-factor-challenge-error");
      expect(err.textContent).toMatch(/4 attempts remaining/i);
    });
    // Did NOT redirect.
    expect(locationAssignSpy).not.toHaveBeenCalled();
    // Input cleared so user can retry.
    expect((screen.getByTestId("six-digit-input-0") as HTMLInputElement).value).toBe("");
  });

  it("lockout (429 totp_locked) → big lockout card replaces the form", async () => {
    stubFetchOnce(
      jsonResponse(429, {
        error: {
          code: "totp_locked",
          message: "Locked",
          lockedUntil: "2026-04-28T13:00:00.000Z",
        },
      }),
    );
    render(<TwoFactorChallengeClient />);
    for (let i = 0; i < 6; i++) {
      fireEvent.change(screen.getByTestId(`six-digit-input-${i}`), {
        target: { value: String(i + 1) },
      });
    }
    await waitFor(() => expect(screen.getByTestId("two-factor-challenge-locked")).toBeTruthy());
    // The original form is gone.
    expect(screen.queryByTestId("two-factor-challenge")).toBeNull();
    // CTA back to login.
    const cta = screen.getByTestId("two-factor-challenge-back-to-login") as HTMLAnchorElement;
    expect(cta.getAttribute("href")).toBe("/login");
  });

  it("pending expired (401 pending_token_invalid_or_expired) → router.replace to /login", async () => {
    stubFetchOnce(
      jsonResponse(401, {
        error: { code: "pending_token_invalid_or_expired", message: "Expired" },
      }),
    );
    render(<TwoFactorChallengeClient />);
    for (let i = 0; i < 6; i++) {
      fireEvent.change(screen.getByTestId(`six-digit-input-${i}`), {
        target: { value: String(i + 1) },
      });
    }
    await waitFor(() => {
      expect(replaceSpy).toHaveBeenCalledWith("/login?error=pending_expired");
    });
  });

  it("network failure → inline error", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError("offline"));
    render(<TwoFactorChallengeClient />);
    for (let i = 0; i < 6; i++) {
      fireEvent.change(screen.getByTestId(`six-digit-input-${i}`), {
        target: { value: String(i + 1) },
      });
    }
    await waitFor(() => {
      const err = screen.getByTestId("two-factor-challenge-error");
      expect(err.textContent).toMatch(/could not reach/i);
    });
    expect(locationAssignSpy).not.toHaveBeenCalled();
  });
});
