/**
 * Tests for useTierChangePoll.
 *
 * Covers:
 *   1. Idle when slug is null (never calls fetch).
 *   2. Initial fetch on mount; result reflects response body.
 *   3. Continues polling while state is in-flight (processing).
 *   4. Stops polling when state becomes "completed".
 *   5. Stops polling when state becomes "failed".
 *   6. Stops polling when state becomes "rolled_back".
 *   7. 404 from endpoint → { state: "none" }.
 *   8. Network error → { state: "none", error: "network_error" }.
 *   9. Cleanup on unmount stops further polling.
 *  10. startPolling() re-arms a stopped loop (2026-06-10 fix) and tolerates
 *      the POST→webhook gap: "none" and stale terminal states don't stop a
 *      kicked loop until a live state is seen or the grace window expires.
 *
 * We use fake timers throughout. Because testing-library's `waitFor` relies on
 * real setTimeout to retry, we do NOT use it here — instead we advance the
 * fake clock explicitly with `act(async () => vi.advanceTimersByTimeAsync(ms))`.
 * Advancing to 0 flushes the initial-mount fetch's microtasks; advancing to
 * 3000 fires the next poll tick and its microtasks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { useTierChangePoll, IDLE_TIER_CHANGE } from "./useTierChangePoll";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockJsonResponse(body: unknown, init: { status?: number } = {}) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/**
 * Drain microtasks + optionally advance fake-timer clock.
 * Wrapped in `act` so React flushes state updates before the next assertion.
 */
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTierChangePoll", () => {
  it("stays idle and never calls fetch when slug is null", async () => {
    const { result } = renderHook(() => useTierChangePoll(null));

    await flush(10_000);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.result).toEqual(IDLE_TIER_CHANGE);
  });

  it("fetches once on mount and reflects the response body", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        state: "processing",
        phase: "transferring",
        targetTier: "team",
        transitionKind: "shared_to_dedicated",
        startedAt: "2026-04-17T10:00:00Z",
        estimatedCompletionAt: "2026-04-17T10:05:00Z",
        transferAttempts: 1,
        migrationProgress: { atomCountBefore: 42817, atomCountAfter: null, newDropletIp: null },
        error: null,
      }),
    );

    const { result } = renderHook(() => useTierChangePoll("bold-junction"));

    // Flush the initial-mount fetch.
    await flush();

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/billing/tier-change/bold-junction",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(result.current.result.state).toBe("processing");
    expect(result.current.result.phase).toBe("transferring");
    expect(result.current.result.transitionKind).toBe("shared_to_dedicated");
    expect(result.current.result.transferAttempts).toBe(1);
  });

  it("continues polling every 3s while state is in-flight", async () => {
    mockFetch
      .mockResolvedValueOnce(
        mockJsonResponse({ state: "queued", phase: null, transferAttempts: 0 }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({ state: "processing", phase: "provisioning", transferAttempts: 0 }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({ state: "processing", phase: "transferring", transferAttempts: 0 }),
      );

    const { result } = renderHook(() => useTierChangePoll("my-sub"));

    await flush();
    expect(result.current.result.state).toBe("queued");

    await flush(3000);
    expect(result.current.result.phase).toBe("provisioning");

    await flush(3000);
    expect(result.current.result.phase).toBe("transferring");

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("stops polling when state becomes completed", async () => {
    mockFetch
      .mockResolvedValueOnce(mockJsonResponse({ state: "processing", phase: "cutting_over" }))
      .mockResolvedValueOnce(mockJsonResponse({ state: "completed", phase: null }));

    const { result } = renderHook(() => useTierChangePoll("my-sub"));

    await flush();
    expect(result.current.result.state).toBe("processing");

    await flush(3000);
    expect(result.current.result.state).toBe("completed");

    // Advance well past another interval — no further fetches should fire.
    await flush(10_000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("stops polling when state becomes failed", async () => {
    mockFetch
      .mockResolvedValueOnce(mockJsonResponse({ state: "processing", phase: "transferring" }))
      .mockResolvedValueOnce(
        mockJsonResponse({ state: "failed", phase: null, error: "transfer_exhausted" }),
      );

    const { result } = renderHook(() => useTierChangePoll("my-sub"));

    await flush();
    expect(result.current.result.state).toBe("processing");

    await flush(3000);
    expect(result.current.result.state).toBe("failed");

    await flush(10_000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.current.result.error).toBe("transfer_exhausted");
  });

  it("stops polling when state becomes rolled_back", async () => {
    mockFetch
      .mockResolvedValueOnce(mockJsonResponse({ state: "processing", phase: "verifying" }))
      .mockResolvedValueOnce(mockJsonResponse({ state: "rolled_back", phase: null }));

    const { result } = renderHook(() => useTierChangePoll("my-sub"));

    await flush();
    expect(result.current.result.state).toBe("processing");

    await flush(3000);
    expect(result.current.result.state).toBe("rolled_back");

    await flush(10_000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("treats 404 as state: none (no row exists)", async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ error: "not_found" }, { status: 404 }));

    const { result } = renderHook(() => useTierChangePoll("my-sub"));

    await flush();
    expect(result.current.result.state).toBe("none");
    expect(result.current.result.error).toBeNull();

    // State is "none" — polling stops immediately.
    await flush(10_000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to idle with error flag on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const { result } = renderHook(() => useTierChangePoll("my-sub"));

    await flush();
    expect(result.current.result.error).toBe("network_error");
    expect(result.current.result.state).toBe("none");

    // "none" terminates polling.
    await flush(10_000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("stops polling after unmount", async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ state: "processing", phase: "provisioning" }));

    const { result, unmount } = renderHook(() => useTierChangePoll("my-sub"));

    await flush();
    expect(result.current.result.state).toBe("processing");

    const countBefore = mockFetch.mock.calls.length;
    unmount();
    await flush(10_000);

    // No further fetches after unmount.
    expect(mockFetch.mock.calls.length).toBe(countBefore);
  });

  // ── startPolling() — the 2026-06-10 re-arm fix ─────────────────────────────

  describe("startPolling", () => {
    it("re-arms a loop that stopped on idle and rides the webhook gap to a live state", async () => {
      // Page load: idle, loop stops after one fetch.
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ error: "not_found" }, { status: 404 }));

      const { result } = renderHook(() => useTierChangePoll("my-sub"));
      await flush();
      expect(result.current.result.state).toBe("none");
      await flush(10_000);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // User confirms an upgrade → POST 202 → onUpgradeStarted → startPolling.
      // The webhook hasn't inserted the row yet: two more "none" responses,
      // THEN the row appears.
      mockFetch
        .mockResolvedValueOnce(mockJsonResponse({ error: "not_found" }, { status: 404 }))
        .mockResolvedValueOnce(mockJsonResponse({ error: "not_found" }, { status: 404 }))
        .mockResolvedValueOnce(mockJsonResponse({ state: "queued", phase: null }))
        .mockResolvedValueOnce(mockJsonResponse({ state: "processing", phase: "provisioning" }));

      act(() => {
        result.current.startPolling();
      });

      await flush(); // immediate re-armed fetch → none
      expect(mockFetch).toHaveBeenCalledTimes(2);
      await flush(3000); // → none (still waiting on webhook)
      expect(mockFetch).toHaveBeenCalledTimes(3);
      await flush(3000); // → queued (webhook landed)
      expect(result.current.result.state).toBe("queued");
      await flush(3000); // → processing
      expect(result.current.result.phase).toBe("provisioning");
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it("polls through a STALE terminal state from a previous change during the grace window", async () => {
      // Page load: previous upgrade's completed row → loop stops.
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ state: "completed", phase: null }));

      const { result } = renderHook(() => useTierChangePoll("my-sub"));
      await flush();
      expect(result.current.result.state).toBe("completed");
      await flush(10_000);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // New upgrade kicks off. First poll still sees the OLD completed row;
      // the webhook then replaces it with the new queued row.
      mockFetch
        .mockResolvedValueOnce(mockJsonResponse({ state: "completed", phase: null }))
        .mockResolvedValueOnce(mockJsonResponse({ state: "queued", phase: null }));

      act(() => {
        result.current.startPolling();
      });

      await flush(); // stale completed — kicked loop keeps going
      await flush(3000); // new row
      expect(result.current.result.state).toBe("queued");
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("normal stop rules resume once a live state was seen after the kick", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ error: "not_found" }, { status: 404 }));

      const { result } = renderHook(() => useTierChangePoll("my-sub"));
      await flush();

      mockFetch
        .mockResolvedValueOnce(mockJsonResponse({ state: "processing", phase: null }))
        .mockResolvedValueOnce(mockJsonResponse({ state: "completed", phase: null }));

      act(() => {
        result.current.startPolling();
      });

      await flush(); // processing — grace satisfied
      expect(result.current.result.state).toBe("processing");
      await flush(3000); // completed — terminal stops the loop again
      expect(result.current.result.state).toBe("completed");

      const countAfterTerminal = mockFetch.mock.calls.length;
      await flush(30_000);
      expect(mockFetch.mock.calls.length).toBe(countAfterTerminal);
    });

    it("gives up when the grace window expires without a live state (webhook lost)", async () => {
      mockFetch.mockResolvedValue(mockJsonResponse({ error: "not_found" }, { status: 404 }));

      const { result } = renderHook(() => useTierChangePoll("my-sub"));
      await flush();
      const countIdle = mockFetch.mock.calls.length;

      act(() => {
        result.current.startPolling();
      });

      // Grace window is 90 s; at 3 s per tick that's ~30 polls, then stop.
      await flush(200_000);
      const countAfterGrace = mockFetch.mock.calls.length;
      expect(countAfterGrace).toBeGreaterThan(countIdle + 1); // it did retry
      expect(countAfterGrace).toBeLessThan(countIdle + 40); // bounded by grace

      // Well past the window: no further fetches.
      await flush(60_000);
      expect(mockFetch.mock.calls.length).toBe(countAfterGrace);
    });
  });
});
