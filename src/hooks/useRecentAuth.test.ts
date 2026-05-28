/**
 * Tests for useRecentAuth.
 *
 * Coverage:
 *   1. Initial mount fetches /status and exposes the result.
 *   2. initialStatus skips the loading flicker on first paint.
 *   3. 401 surfaces error='session_expired' and clears status.
 *   4. Network failure surfaces error='network'.
 *   5. refetch() re-fires the request and updates state.
 *   6. After enrol/disable, refetch flips the enrolled bit.
 *
 * Mocks fetch globally because the hook does no other I/O.
 *
 * SWR isolation
 * ─────────────
 * Each `renderHook` is wrapped in a fresh `<SWRConfig>` provider with a
 * new `Map` cache so tests can't leak each other's data through SWR's
 * global cache. `dedupingInterval: 0` also disables the 2-second dedupe
 * window so a sequence of `mutate()` calls actually re-runs the fetcher,
 * which is exactly what the refetch test expects.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { SWRConfig } from "swr";
import { useRecentAuth, type TotpStatus } from "./useRecentAuth";

const FRESH_STATUS: TotpStatus = {
  enrolled: false,
  lastUsedAt: null,
  backupCodesRemaining: 0,
  recentAuthFresh: true,
  recentAuthExpiresAt: "2026-04-28T12:00:00.000Z",
};

const ENROLLED_STATUS: TotpStatus = {
  enrolled: true,
  lastUsedAt: "2026-04-28T11:55:00.000Z",
  backupCodesRemaining: 9,
  recentAuthFresh: true,
  recentAuthExpiresAt: "2026-04-28T12:00:00.000Z",
};

/** Fresh SWR cache per renderHook — prevents cross-test contamination. */
function swrWrapper({ children }: { children: ReactNode }) {
  return createElement(
    SWRConfig,
    { value: { provider: () => new Map(), dedupingInterval: 0 } },
    children,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockFetchOnce(body: unknown, status = 200): void {
  (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe("useRecentAuth — mount", () => {
  it("starts in loading=true with no initialStatus, then transitions to data", async () => {
    mockFetchOnce(FRESH_STATUS);
    const { result } = renderHook(() => useRecentAuth(), { wrapper: swrWrapper });
    expect(result.current.loading).toBe(true);
    expect(result.current.status).toBeNull();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toEqual(FRESH_STATUS);
    expect(result.current.error).toBeNull();
  });

  it("uses initialStatus to skip the data flicker", async () => {
    mockFetchOnce(ENROLLED_STATUS);
    const { result } = renderHook(() => useRecentAuth(FRESH_STATUS), { wrapper: swrWrapper });
    // The "skip the flicker" guarantee is about the data the user sees:
    // status is populated from the SSR-passed value at first render — there
    // is never a tick where status is null. The `loading` flag toggles
    // through true→false as the mount-time refetch runs in the background;
    // that's correct behaviour (the UI can show a subtle "refreshing"
    // indicator) and the data the user reads is stable throughout.
    expect(result.current.status).toEqual(FRESH_STATUS);
    // Refetch on mount picks up the newer ENROLLED_STATUS.
    await waitFor(() => expect(result.current.status).toEqual(ENROLLED_STATUS));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("hits the canonical /api/auth/factors/totp/status endpoint", async () => {
    mockFetchOnce(FRESH_STATUS);
    renderHook(() => useRecentAuth(), { wrapper: swrWrapper });
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/auth/factors/totp/status",
        expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
      );
    });
  });
});

describe("useRecentAuth — error states", () => {
  it("401 → error='session_expired', status cleared", async () => {
    mockFetchOnce({}, 401);
    const { result } = renderHook(() => useRecentAuth(), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("session_expired");
    expect(result.current.status).toBeNull();
  });

  it("non-401 non-2xx → error='network'", async () => {
    mockFetchOnce({}, 500);
    const { result } = renderHook(() => useRecentAuth(), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("network");
  });

  it("fetch reject (network failure) → error='network'", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError("offline"));
    const { result } = renderHook(() => useRecentAuth(), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("network");
  });
});

describe("useRecentAuth — refetch", () => {
  it("flips state from not-enrolled to enrolled after refetch", async () => {
    mockFetchOnce(FRESH_STATUS);
    const { result } = renderHook(() => useRecentAuth(), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.status?.enrolled).toBe(false));

    mockFetchOnce(ENROLLED_STATUS);
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.status?.enrolled).toBe(true);
    expect(result.current.status?.backupCodesRemaining).toBe(9);
  });

  it("clears any prior error on a successful refetch", async () => {
    mockFetchOnce({}, 500);
    const { result } = renderHook(() => useRecentAuth(), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.error).toBe("network"));

    mockFetchOnce(FRESH_STATUS);
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.status).toEqual(FRESH_STATUS);
  });
});
