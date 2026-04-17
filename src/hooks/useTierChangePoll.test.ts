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
    expect(result.current).toEqual(IDLE_TIER_CHANGE);
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
    expect(result.current.state).toBe("processing");
    expect(result.current.phase).toBe("transferring");
    expect(result.current.transitionKind).toBe("shared_to_dedicated");
    expect(result.current.transferAttempts).toBe(1);
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
    expect(result.current.state).toBe("queued");

    await flush(3000);
    expect(result.current.phase).toBe("provisioning");

    await flush(3000);
    expect(result.current.phase).toBe("transferring");

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("stops polling when state becomes completed", async () => {
    mockFetch
      .mockResolvedValueOnce(mockJsonResponse({ state: "processing", phase: "cutting_over" }))
      .mockResolvedValueOnce(mockJsonResponse({ state: "completed", phase: null }));

    const { result } = renderHook(() => useTierChangePoll("my-sub"));

    await flush();
    expect(result.current.state).toBe("processing");

    await flush(3000);
    expect(result.current.state).toBe("completed");

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
    expect(result.current.state).toBe("processing");

    await flush(3000);
    expect(result.current.state).toBe("failed");

    await flush(10_000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBe("transfer_exhausted");
  });

  it("stops polling when state becomes rolled_back", async () => {
    mockFetch
      .mockResolvedValueOnce(mockJsonResponse({ state: "processing", phase: "verifying" }))
      .mockResolvedValueOnce(mockJsonResponse({ state: "rolled_back", phase: null }));

    const { result } = renderHook(() => useTierChangePoll("my-sub"));

    await flush();
    expect(result.current.state).toBe("processing");

    await flush(3000);
    expect(result.current.state).toBe("rolled_back");

    await flush(10_000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("treats 404 as state: none (no row exists)", async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ error: "not_found" }, { status: 404 }));

    const { result } = renderHook(() => useTierChangePoll("my-sub"));

    await flush();
    expect(result.current.state).toBe("none");
    expect(result.current.error).toBeNull();

    // State is "none" — polling stops immediately.
    await flush(10_000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to idle with error flag on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const { result } = renderHook(() => useTierChangePoll("my-sub"));

    await flush();
    expect(result.current.error).toBe("network_error");
    expect(result.current.state).toBe("none");

    // "none" terminates polling.
    await flush(10_000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("stops polling after unmount", async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ state: "processing", phase: "provisioning" }));

    const { result, unmount } = renderHook(() => useTierChangePoll("my-sub"));

    await flush();
    expect(result.current.state).toBe("processing");

    const countBefore = mockFetch.mock.calls.length;
    unmount();
    await flush(10_000);

    // No further fetches after unmount.
    expect(mockFetch.mock.calls.length).toBe(countBefore);
  });
});
