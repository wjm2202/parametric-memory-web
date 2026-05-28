/**
 * Tests for AuditClient — Sprint 7.
 *
 * Mocks fetch + RecentAuthGate; the gate is unconditionally "open" so
 * each test starts inside the feed. Coverage:
 *
 *   1. Initial render fires fetch with limit=50 + no cursor + no kind.
 *   2. List renders one item per event with the formatted label.
 *   3. Empty result → empty-state copy.
 *   4. Filter change → re-fetch with the new ?kind=… and clear list.
 *   5. nextCursor present → "Load older events" button calls cursor URL.
 *   6. Network error → inline error + retry button → retry calls fetch again.
 *   7. 401 → friendly "Your sign-in expired" copy (RecentAuthGate handles
 *      the actual recovery; the inline message is belt-and-braces).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { type ReactNode } from "react";
import { SWRConfig } from "swr";
import AuditClient from "./AuditClient";

// RC-05 (react-compiler-readiness, 2026-05-27): a fresh SWR cache provider
// per render isolates each test. Without this, SWR's module-global cache
// would let test N observe test N-1's cached audit pages and skip the
// fetch — defeating fetchMock.toHaveBeenCalledTimes assertions.
function SwrTestWrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {children}
    </SWRConfig>
  );
}

function renderAudit(account: AccountInfo) {
  return render(<AuditClient account={account} />, { wrapper: SwrTestWrapper });
}

interface AccountInfo {
  id: string;
  email: string;
}

// RecentAuthGate is unconditionally "open" — its own tests cover the
// gate logic; this file asserts what happens once the gate has passed.
vi.mock("@/components/RecentAuthGate", () => ({
  RecentAuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Stub parse-user-agent to avoid pulling in ua-parser-js's parsing path
// (which is its own test surface). Returns a recognisable canned string
// so the tests can assert presence without coupling to the real lib.
vi.mock("@/lib/parse-user-agent", () => ({
  parseUserAgent: (ua: string | null) => (ua ? `parsed:${ua.slice(0, 12)}…` : "Unknown device"),
}));

const ACCOUNT = { id: "acc_1", email: "alice@example.com" };

interface MockFetchResponse {
  ok?: boolean;
  status?: number;
  json: () => Promise<unknown>;
}

function jsonResponse(status: number, body: unknown): MockFetchResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fetchMock() {
  return fetch as unknown as ReturnType<typeof vi.fn>;
}

const SAMPLE_EVENTS = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    occurredAt: "2026-04-29T10:00:00.000Z",
    eventKind: "magic_link_verified",
    actorIp: "198.51.100.42",
    actorUa: "Mozilla/5.0 Chrome/134",
    details: {},
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    occurredAt: "2026-04-29T09:30:00.000Z",
    eventKind: "session_revoked",
    actorIp: "198.51.100.42",
    actorUa: "Mozilla/5.0 Chrome/134",
    details: {},
  },
];

describe("AuditClient — initial fetch", () => {
  it("calls /api/auth/audit with default params on mount", async () => {
    fetchMock().mockResolvedValueOnce(
      jsonResponse(200, { events: SAMPLE_EVENTS, nextCursor: null }),
    );
    renderAudit(ACCOUNT);

    await waitFor(() => {
      expect(fetchMock()).toHaveBeenCalledTimes(1);
    });
    const url = fetchMock().mock.calls[0]![0] as string;
    expect(url).toContain("/api/auth/audit?");
    expect(url).toContain("limit=50");
    expect(url).not.toContain("cursor=");
    expect(url).not.toContain("kind=");
  });

  it("renders the formatted label per event", async () => {
    fetchMock().mockResolvedValueOnce(
      jsonResponse(200, { events: SAMPLE_EVENTS, nextCursor: null }),
    );
    renderAudit(ACCOUNT);

    await waitFor(() => {
      const items = screen.getAllByTestId("auth-audit-item");
      expect(items).toHaveLength(2);
    });

    const items = screen.getAllByTestId("auth-audit-item");
    expect(within(items[0]!).getByText("Signed in via email link")).toBeTruthy();
    expect(within(items[1]!).getByText("Signed out")).toBeTruthy();
  });
});

describe("AuditClient — empty state", () => {
  it("renders empty-state copy when the feed is empty", async () => {
    fetchMock().mockResolvedValueOnce(jsonResponse(200, { events: [], nextCursor: null }));
    renderAudit(ACCOUNT);
    await waitFor(() => {
      expect(screen.getByTestId("auth-audit-empty")).toBeTruthy();
    });
  });
});

describe("AuditClient — kind filter", () => {
  it("changing the filter triggers a re-fetch with ?kind=…", async () => {
    fetchMock()
      .mockResolvedValueOnce(jsonResponse(200, { events: SAMPLE_EVENTS, nextCursor: null }))
      .mockResolvedValueOnce(jsonResponse(200, { events: [SAMPLE_EVENTS[0]], nextCursor: null }));

    renderAudit(ACCOUNT);
    await waitFor(() => {
      expect(screen.getAllByTestId("auth-audit-item")).toHaveLength(2);
    });

    // The "Sign-in via email" filter option's value is the comma-separated
    // string of kinds. Asserting the filter dropdown narrows the list AND
    // fires a re-fetch.
    const filter = screen.getByTestId("auth-audit-kind-filter") as HTMLSelectElement;
    fireEvent.change(filter, {
      target: { value: "magic_link_verified,magic_link_requested,magic_link_failed" },
    });

    await waitFor(() => {
      expect(fetchMock()).toHaveBeenCalledTimes(2);
    });
    const url = fetchMock().mock.calls[1]![0] as string;
    expect(url).toContain("kind=magic_link_verified");

    await waitFor(() => {
      expect(screen.getAllByTestId("auth-audit-item")).toHaveLength(1);
    });
  });
});

describe("AuditClient — pagination", () => {
  it("'Load older events' button is present when nextCursor is set", async () => {
    fetchMock().mockResolvedValueOnce(
      jsonResponse(200, { events: SAMPLE_EVENTS, nextCursor: "OPAQUE_CURSOR" }),
    );
    renderAudit(ACCOUNT);
    await waitFor(() => {
      expect(screen.getByTestId("auth-audit-load-more")).toBeTruthy();
    });
  });

  it("'Load older events' fetches with ?cursor=… and appends to the list", async () => {
    const olderEvent = {
      id: "33333333-3333-3333-3333-333333333333",
      occurredAt: "2026-04-28T08:00:00.000Z",
      eventKind: "session_created",
      actorIp: null,
      actorUa: null,
      details: {},
    };
    fetchMock()
      .mockResolvedValueOnce(
        jsonResponse(200, { events: SAMPLE_EVENTS, nextCursor: "PAGE_2_CURSOR" }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { events: [olderEvent], nextCursor: null }));

    renderAudit(ACCOUNT);
    await waitFor(() => {
      expect(screen.getByTestId("auth-audit-load-more")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("auth-audit-load-more"));

    await waitFor(() => {
      expect(fetchMock()).toHaveBeenCalledTimes(2);
    });
    const url = fetchMock().mock.calls[1]![0] as string;
    expect(url).toContain("cursor=PAGE_2_CURSOR");

    await waitFor(() => {
      expect(screen.getAllByTestId("auth-audit-item")).toHaveLength(3);
    });

    // Cursor is now null — no more "Load older events" button.
    expect(screen.queryByTestId("auth-audit-load-more")).toBeNull();
  });

  it("does NOT render the load-more button when nextCursor is null", async () => {
    fetchMock().mockResolvedValueOnce(
      jsonResponse(200, { events: SAMPLE_EVENTS, nextCursor: null }),
    );
    renderAudit(ACCOUNT);
    await waitFor(() => {
      expect(screen.getAllByTestId("auth-audit-item")).toHaveLength(2);
    });
    expect(screen.queryByTestId("auth-audit-load-more")).toBeNull();
  });
});

describe("AuditClient — error paths", () => {
  it("network failure → inline error + retry button → retry refetches", async () => {
    fetchMock()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(jsonResponse(200, { events: SAMPLE_EVENTS, nextCursor: null }));

    renderAudit(ACCOUNT);

    await waitFor(() => {
      const err = screen.getByTestId("auth-audit-error");
      expect(err.textContent).toMatch(/Could not reach/);
    });

    fireEvent.click(screen.getByTestId("auth-audit-retry"));

    await waitFor(() => {
      expect(fetchMock()).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getAllByTestId("auth-audit-item")).toHaveLength(2);
    });
  });

  it("401 from the server renders the 'sign-in expired' copy", async () => {
    fetchMock().mockResolvedValueOnce(
      jsonResponse(401, { code: "reauth_required", error: "stale" }),
    );
    renderAudit(ACCOUNT);
    await waitFor(() => {
      const err = screen.getByTestId("auth-audit-error");
      expect(err.textContent).toMatch(/sign-in expired/i);
    });
  });
});
