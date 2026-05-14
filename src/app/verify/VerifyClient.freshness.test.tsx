/**
 * Tests for V1.4 — FreshnessLine + formatRelativeAge.
 *
 * Covers:
 *   1. formatRelativeAge — boundary cases (just-now, 5m, 1h, 23h, 2d, 35d, 6mo, 2y).
 *   2. formatRelativeAge — clock-skew safety (negative ms → "in the future").
 *   3. FreshnessLine renders exporter host, version, ISO timestamp, and relative age.
 *   4. FreshnessLine relative age updates when the parent `now` ticker advances —
 *      validated by re-rendering with a later `now` and asserting the new string.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import VerifyClient, { formatRelativeAge } from "./VerifyClient";

/**
 * IMPORTANT: only fake the timers we need to control — setInterval (the 60s
 * ticker inside VerifyClient) and Date (for Date.now() inside the ticker and
 * inside the useState initialiser). Leave setTimeout REAL so testing-library's
 * waitFor — which polls the DOM via setTimeout — keeps working. The previous
 * blanket `vi.useFakeTimers()` faked setTimeout too, which caused waitFor to
 * hang indefinitely (and the tests to time out at 5 s).
 */
const FAKEABLE_TIMERS = ["setInterval", "clearInterval", "Date"] as const;

vi.mock("./verifier", async () => {
  const actual = await vi.importActual<typeof import("./verifier")>("./verifier");
  return { ...actual, verifySnapshot: vi.fn() };
});
import { verifySnapshot } from "./verifier";

// ── Pure-function tests for formatRelativeAge ────────────────────────────────

describe("formatRelativeAge (pure helper)", () => {
  it("returns 'just now' for <60s", () => {
    expect(formatRelativeAge(0)).toBe("just now");
    expect(formatRelativeAge(30_000)).toBe("just now");
    expect(formatRelativeAge(59_999)).toBe("just now");
  });

  it("returns '<N> minutes ago' for 60s–3599s", () => {
    expect(formatRelativeAge(60_000)).toBe("1 minute ago");
    expect(formatRelativeAge(5 * 60_000)).toBe("5 minutes ago");
    expect(formatRelativeAge(59 * 60_000)).toBe("59 minutes ago");
  });

  it("returns '<N> hours ago' for 1h–23h", () => {
    expect(formatRelativeAge(60 * 60_000)).toBe("1 hour ago");
    expect(formatRelativeAge(2 * 60 * 60_000)).toBe("2 hours ago");
    expect(formatRelativeAge(23 * 60 * 60_000)).toBe("23 hours ago");
  });

  it("returns '<N> days ago' for 1d–29d", () => {
    expect(formatRelativeAge(24 * 60 * 60_000)).toBe("1 day ago");
    expect(formatRelativeAge(7 * 24 * 60 * 60_000)).toBe("7 days ago");
    expect(formatRelativeAge(29 * 24 * 60 * 60_000)).toBe("29 days ago");
  });

  it("returns '<N> months ago' for 30d–11mo", () => {
    expect(formatRelativeAge(30 * 24 * 60 * 60_000)).toBe("1 month ago");
    expect(formatRelativeAge(6 * 30 * 24 * 60 * 60_000)).toBe("6 months ago");
  });

  it("returns '<N> years ago' for ≥1y", () => {
    expect(formatRelativeAge(365 * 24 * 60 * 60_000)).toBe("1 year ago");
    expect(formatRelativeAge(2 * 365 * 24 * 60 * 60_000)).toBe("2 years ago");
  });

  it("returns 'in the future' for negative ms (clock-skew safety)", () => {
    expect(formatRelativeAge(-1)).toBe("in the future");
    expect(formatRelativeAge(-60_000)).toBe("in the future");
  });
});

// ── Component tests — FreshnessLine inside ResultPanel ───────────────────────

const SIGNED_AT = new Date("2026-05-13T05:00:00.000Z").getTime();

function makeFixture(): string {
  return JSON.stringify({
    formatVersion: "1.0.0",
    formatUri: "https://parametric-memory.dev/spec/snapshot/v1",
    exporter: {
      name: "MMPM",
      version: "0.3.0",
      host: "MMPM-research",
      exportedAtMs: SIGNED_AT,
      exportedAtIso: new Date(SIGNED_AT).toISOString(),
    },
    tree: {
      treeVersion: 10,
      masterRoot: "00".repeat(32),
      shardCount: 4,
      shardRoots: ["aa".repeat(32), "bb".repeat(32), "cc".repeat(32), "dd".repeat(32)],
      shardLeafCounts: [834, 880, 839, 844],
      atomCount: 3397,
      edgesRoot: "ff".repeat(32),
      auditLogRoot: "11".repeat(32),
    },
    atoms: [],
    hubAtoms: [],
    edges: [],
    signature: {
      alg: "Ed25519",
      kid: "mmpm-snapshot-signing-v1",
      publicKey: "AAAA",
      publicKeyFingerprint: "8d:20:7c:72",
      keyUri: "https://parametric-memory.dev/.well-known/jwks.json",
      sig: "AAAA",
    },
  });
}

function makePassResult() {
  return {
    overallOk: true,
    formatVersion: { ok: true, expected: "1.0.0", computed: "1.0.0", detail: "" },
    signature: { ok: true, detail: "Ed25519 valid" },
    edgesRoot: { ok: true, expected: "ff".repeat(32), computed: "ff".repeat(32), detail: "" },
    shardRoots: { ok: true, perShard: [] },
    masterRoot: { ok: true, expected: "00", computed: "00", detail: "" },
    auditLogRoot: { ok: true, expected: "11".repeat(32), computed: "11".repeat(32), detail: "" },
    hubAtoms: { ok: true, detail: "" },
    tombstones: { ok: true, detail: "" },
    atomValueBind: { ok: true, detail: "" },
    consistencyProof: { ok: true, absent: true, detail: "" },
    auditEntries: { ok: true, detail: "" },
    summary: "Verified.",
  };
}

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, text: () => Promise.resolve(makeFixture()) }),
  ) as unknown as typeof fetch;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function dropSnapshot(fileText: string): Promise<void> {
  const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!fileInput) throw new Error("file input not found");
  const file = new File([fileText], "snap.json", { type: "application/json" });
  // jsdom's File doesn't always implement Blob.text() — patch it on the instance.
  Object.defineProperty(file, "text", {
    value: () => Promise.resolve(fileText),
    configurable: true,
  });
  Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
  fireEvent.change(fileInput);
}

describe("V1.4 — FreshnessLine rendering", () => {
  it("renders exporter host, version, ISO, and relative age 5 minutes after signing", async () => {
    // Fake only setInterval/clearInterval/Date — leaves setTimeout real so
    // testing-library's waitFor polling works. See FAKEABLE_TIMERS comment above.
    vi.useFakeTimers({ toFake: [...FAKEABLE_TIMERS] });
    vi.setSystemTime(SIGNED_AT + 5 * 60_000);

    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(makeFixture());

    await waitFor(() => {
      expect(screen.getByText(/MMPM-research/)).toBeInTheDocument();
    });
    expect(screen.getByText(/exporter v0\.3\.0/)).toBeInTheDocument();
    expect(screen.getByText(new Date(SIGNED_AT).toISOString())).toBeInTheDocument();
    expect(screen.getByText(/5 minutes ago/)).toBeInTheDocument();
  });

  it("updates the relative-age string when the 60s ticker advances", async () => {
    vi.useFakeTimers({ toFake: [...FAKEABLE_TIMERS] });
    vi.setSystemTime(SIGNED_AT + 60_000); // initial: 1 minute since signing

    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(makeFixture());

    await waitFor(() => {
      expect(screen.getByText(/1 minute ago/)).toBeInTheDocument();
    });

    // Advance the clock by exactly one tick interval (60s). This walks the
    // fake clock forward, firing the setInterval callback when it crosses the
    // scheduled fire-point (T₀+120s). The callback reads `Date.now()` at that
    // moment — which the fake-timer library has advanced to T₀+120s — so
    // setNow updates state to "2 minutes since signing".
    //
    // IMPORTANT: do NOT call vi.setSystemTime here. setSystemTime is a TELEPORT
    // that doesn't fire timers; combining it with advanceTimersByTime causes
    // pending past-due timers to be orphaned and the callback never fires.
    // (Previous version did exactly that and the test deterministically failed.)
    //
    // act() flushes the setState triggered by the callback so testing-library
    // sees the updated DOM on the next query.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    await waitFor(() => {
      expect(screen.getByText(/2 minutes ago/)).toBeInTheDocument();
    });
  });
});
