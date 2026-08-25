/**
 * Tests for useSession — the client-side login detection that replaced
 * server-side `cookies()` reads on every public page (static-render fix,
 * 2026-08-24; see marketing/SEO-FINAL-FIX-REVIEW-2026-08-24.md).
 *
 * The contract under test:
 *   1. Renders logged-out immediately (matches the static HTML crawlers see).
 *   2. 200 from /api/auth/me → loggedIn=true + email, and the result is
 *      CACHED at module scope (second mount performs no fetch).
 *   3. 401 → definitively logged out, also cached.
 *   4. 5xx → logged out for this render but NOT cached (a transient compute
 *      outage must not stick for the whole SPA session).
 *   5. Network error → same as 5xx.
 *   6. Concurrent mounts share ONE in-flight request.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { useSession, __resetSessionCacheForTests } from "../use-session";

function Probe() {
  const { loggedIn, email, resolved } = useSession();
  return (
    <div>
      <span data-testid="logged-in">{String(loggedIn)}</span>
      <span data-testid="email">{email ?? "none"}</span>
      <span data-testid="resolved">{String(resolved)}</span>
    </div>
  );
}

describe("useSession", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    __resetSessionCacheForTests();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const fetchMock = () => globalThis.fetch as ReturnType<typeof vi.fn>;

  it("starts logged-out and unresolved — identical to the static HTML", () => {
    fetchMock().mockReturnValue(new Promise(() => {}));
    render(<Probe />);
    expect(screen.getByTestId("logged-in").textContent).toBe("false");
    expect(screen.getByTestId("resolved").textContent).toBe("false");
  });

  it("resolves to logged-in with email on 200 and caches for later mounts", async () => {
    fetchMock().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ email: "user@example.com" }),
    });

    await act(async () => {
      render(<Probe />);
    });
    await waitFor(() => expect(screen.getByTestId("logged-in").textContent).toBe("true"));
    expect(screen.getByTestId("email").textContent).toBe("user@example.com");
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    expect(fetchMock()).toHaveBeenCalledWith("/api/auth/me", { cache: "no-store" });

    // Second mount: served from the module cache, no second request.
    await act(async () => {
      render(<Probe />);
    });
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("caches a definitive 401 as logged-out", async () => {
    fetchMock().mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) });

    await act(async () => {
      render(<Probe />);
    });
    await waitFor(() => expect(screen.getByTestId("resolved").textContent).toBe("true"));
    expect(screen.getByTestId("logged-in").textContent).toBe("false");

    await act(async () => {
      render(<Probe />);
    });
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("does NOT cache a 5xx — the next mount retries", async () => {
    fetchMock().mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({}) });

    await act(async () => {
      render(<Probe />);
    });
    await waitFor(() => expect(screen.getByTestId("resolved").textContent).toBe("true"));
    expect(screen.getByTestId("logged-in").textContent).toBe("false");

    await act(async () => {
      render(<Probe />);
    });
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("does NOT cache a network error — the next mount retries", async () => {
    fetchMock().mockRejectedValue(new TypeError("network down"));

    await act(async () => {
      render(<Probe />);
    });
    await waitFor(() => expect(screen.getByTestId("resolved").textContent).toBe("true"));
    expect(screen.getByTestId("logged-in").textContent).toBe("false");

    await act(async () => {
      render(<Probe />);
    });
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent mounts into one request", async () => {
    let resolveFetch!: (v: unknown) => void;
    fetchMock().mockReturnValue(new Promise((r) => (resolveFetch = r)));

    render(
      <>
        <Probe />
        <Probe />
        <Probe />
      </>,
    );
    expect(fetchMock()).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch({ ok: true, status: 200, json: () => Promise.resolve({ email: "a@b.c" }) });
    });
    await waitFor(() => {
      for (const el of screen.getAllByTestId("logged-in")) {
        expect(el.textContent).toBe("true");
      }
    });
  });
});
