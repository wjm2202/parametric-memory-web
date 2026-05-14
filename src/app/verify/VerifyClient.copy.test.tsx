/**
 * Tests for V2.2 — HashWithCopy + integration into CheckCard / ShardRootsTable
 * / SnapshotMeta.
 *
 * Covers:
 *   1. HashWithCopy pure behaviour — truncation threshold, expand/collapse,
 *      clipboard write, "copied" feedback transient, falls back cleanly when
 *      clipboard API rejects.
 *   2. Integration — every hash on a verified result is reachable via a
 *      `verify-hash-toggle` (when truncatable) and `verify-hash-copy` (always).
 *      No hash is hidden behind plain truncation any more.
 *   3. Accessibility — every button has a descriptive aria-label scoped to
 *      WHICH hash it operates on.
 *   4. Cross-contamination — clicking expand on one hash does NOT expand
 *      others. Independent state per instance.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import VerifyClient, { HashWithCopy } from "./VerifyClient";

vi.mock("./verifier", async () => {
  const actual = await vi.importActual<typeof import("./verifier")>("./verifier");
  return { ...actual, verifySnapshot: vi.fn() };
});
import { verifySnapshot } from "./verifier";

// ── Clipboard mock ───────────────────────────────────────────────────────────
// jsdom does not implement navigator.clipboard. We stub it per-test and assert
// the calls. Failure cases (writeText rejects) are also covered so the UI
// graceful-degrade path is exercised.

const writeTextMock = vi.fn(() => Promise.resolve());

beforeEach(() => {
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: { writeText: writeTextMock },
    writable: true,
    configurable: true,
  });
  writeTextMock.mockReset();
  writeTextMock.mockImplementation(() => Promise.resolve());
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── HashWithCopy pure unit tests ─────────────────────────────────────────────
//
// Render in isolation, no VerifyClient involvement. Lets us exercise edge
// cases (very short hash, empty, exactly-at-threshold) without the full
// verify state machine.

describe("V2.2 — HashWithCopy (pure)", () => {
  it("truncates a hash longer than truncateAt and exposes a verify-hash-toggle", () => {
    const longHex = "a".repeat(64);
    render(<HashWithCopy hex={longHex} ariaLabel="test hash" />);
    const toggle = screen.getByTestId("verify-hash-toggle");
    expect(toggle.tagName.toLowerCase()).toBe("button");
    // Truncated text contains the ellipsis (U+2026) — guards against accidental
    // "..." three-dot variant which a regex elsewhere on the page might match.
    expect(toggle.textContent).toMatch(/^a+…$/);
    expect(toggle.textContent!.length).toBeLessThan(longHex.length);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("does NOT render a toggle button when hash is short enough", () => {
    render(<HashWithCopy hex="short" ariaLabel="tiny hash" />);
    expect(screen.queryByTestId("verify-hash-toggle")).not.toBeInTheDocument();
    // Copy button still rendered — copying short hashes is useful too.
    expect(screen.getByTestId("verify-hash-copy")).toBeInTheDocument();
  });

  it("expands to the full hex on click, collapses on second click", () => {
    const fullHex = "deadbeef".repeat(8); // 64 chars
    render(<HashWithCopy hex={fullHex} ariaLabel="round-trip" truncateAt={16} />);
    const toggle = screen.getByTestId("verify-hash-toggle");

    expect(toggle.textContent).toMatch(/…$/);
    fireEvent.click(toggle);
    expect(toggle.textContent).toBe(fullHex);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle);
    expect(toggle.textContent).toMatch(/…$/);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("copies the FULL hex (not the truncated preview) when copy button clicked", async () => {
    const fullHex = "0123456789abcdef".repeat(4);
    render(<HashWithCopy hex={fullHex} ariaLabel="copy target" />);
    const copy = screen.getByTestId("verify-hash-copy");

    fireEvent.click(copy);
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(fullHex);
    });
  });

  it("flips the copy button title to 'Copied' immediately after a successful copy", async () => {
    render(<HashWithCopy hex="aaaa" ariaLabel="title flip" />);
    const copy = screen.getByTestId("verify-hash-copy");
    expect(copy).toHaveAttribute("title", "Copy to clipboard");

    fireEvent.click(copy);
    await waitFor(() => {
      expect(copy).toHaveAttribute("title", "Copied");
    });
  });

  it("swallows clipboard API failures without throwing — hash stays visible", async () => {
    writeTextMock.mockRejectedValueOnce(new Error("DOMException: Document is not focused"));
    render(<HashWithCopy hex="abcd" ariaLabel="fallback" />);
    const copy = screen.getByTestId("verify-hash-copy");

    // Click should not throw. The component handles the rejection silently.
    fireEvent.click(copy);
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalled();
    });
    // Title should NOT flip to "Copied" because the write failed.
    expect(copy).toHaveAttribute("title", "Copy to clipboard");
  });

  it("aria-labels describe which hash is being operated on", () => {
    render(<HashWithCopy hex={"f".repeat(64)} ariaLabel="masterRoot" />);
    expect(screen.getByTestId("verify-hash-toggle")).toHaveAttribute(
      "aria-label",
      "Expand masterRoot",
    );
    expect(screen.getByTestId("verify-hash-copy")).toHaveAttribute(
      "aria-label",
      "Copy masterRoot to clipboard",
    );
  });

  it("falls back to 'hash' if no ariaLabel given (defensive)", () => {
    render(<HashWithCopy hex={"f".repeat(64)} />);
    expect(screen.getByTestId("verify-hash-toggle")).toHaveAttribute("aria-label", "Expand hash");
    expect(screen.getByTestId("verify-hash-copy")).toHaveAttribute(
      "aria-label",
      "Copy hash to clipboard",
    );
  });
});

// ── Integration tests — HashWithCopy in CheckCard / Shard table / SnapshotMeta
//
// Drive the full verify flow with a stub verifier result, then assert that
// every hash that previously had `...` truncation now has a working expand
// + copy affordance.

const FIXTURE_FINGERPRINT =
  "8d:20:7c:72:72:1f:8c:1a:a2:40:f7:9b:50:91:4a:d3:0b:44:ac:5e:8c:d2:4d:b0:35:4f:52:3e:c7:8d:09:5f";
const FIXTURE_MASTER_ROOT = "c3437c30d5b7fe19998d18c60e39ea2c936f2a0694a525831ebed0bcd75edfd7";
const FIXTURE_EDGES_ROOT = "f9cdc2221ab98022d40d3492abe5f932f9cdc2221ab98022d40d3492abe5f932";
const FIXTURE_SHARD_ROOT_0 = "65c610eeb3a282a065c610eeb3a282a065c610eeb3a282a065c610eeb3a282a0";

function makeFixture(): string {
  return JSON.stringify({
    formatVersion: "1.0.0",
    formatUri: "https://parametric-memory.dev/spec/snapshot/v1",
    exporter: {
      name: "MMPM",
      version: "0.3.0",
      host: "MMPM-research",
      exportedAtMs: 1747100226787,
      exportedAtIso: "2026-05-13T05:37:06.787Z",
    },
    tree: {
      treeVersion: 10,
      masterRoot: FIXTURE_MASTER_ROOT,
      shardCount: 1,
      shardRoots: [FIXTURE_SHARD_ROOT_0],
      shardLeafCounts: [8],
      atomCount: 8,
      edgesRoot: FIXTURE_EDGES_ROOT,
      auditLogRoot: "11".repeat(32),
    },
    atoms: [],
    hubAtoms: [],
    edges: [],
    signature: {
      alg: "Ed25519",
      kid: "mmpm-snapshot-signing-v1",
      publicKey: "AAAA",
      publicKeyFingerprint: FIXTURE_FINGERPRINT,
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
    edgesRoot: { ok: true, expected: FIXTURE_EDGES_ROOT, computed: FIXTURE_EDGES_ROOT, detail: "" },
    shardRoots: {
      ok: true,
      perShard: [
        { shardId: 0, ok: true, expected: FIXTURE_SHARD_ROOT_0, computed: FIXTURE_SHARD_ROOT_0 },
      ],
    },
    masterRoot: {
      ok: true,
      expected: FIXTURE_MASTER_ROOT,
      computed: FIXTURE_MASTER_ROOT,
      detail: "",
    },
    auditLogRoot: {
      ok: true,
      expected: "11".repeat(32),
      computed: "11".repeat(32),
      detail: "",
    },
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

async function dropSnapshot(fileText: string): Promise<void> {
  const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!fileInput) throw new Error("file input not found");
  const file = new File([fileText], "snap.json", { type: "application/json" });
  Object.defineProperty(file, "text", {
    value: () => Promise.resolve(fileText),
    configurable: true,
  });
  Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
  fireEvent.change(fileInput);
}

describe("V2.2 — HashWithCopy integrated into the verified result panel", () => {
  it("every CheckCard with an `expected` hash exposes an expand + copy affordance", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(makeFixture());
    await waitFor(() => {
      expect(screen.getByText("Verified.")).toBeInTheDocument();
    });
    // Several CheckCards have `expected` hashes. Each should now render a
    // toggle button (truncatable hashes are ≥33 chars in the fixture).
    const toggles = screen.getAllByTestId("verify-hash-toggle");
    expect(toggles.length).toBeGreaterThanOrEqual(3); // edgesRoot, masterRoot, auditLogRoot
    const copies = screen.getAllByTestId("verify-hash-copy");
    expect(copies.length).toBeGreaterThanOrEqual(toggles.length);
  });

  it("clicking a CheckCard hash toggle expands ONLY that hash, not others", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(makeFixture());
    await waitFor(() => {
      expect(screen.getByText("Verified.")).toBeInTheDocument();
    });
    const toggles = screen.getAllByTestId("verify-hash-toggle");
    // All start collapsed.
    for (const t of toggles) {
      expect(t).toHaveAttribute("aria-expanded", "false");
    }
    // Expand the first.
    fireEvent.click(toggles[0]);
    expect(toggles[0]).toHaveAttribute("aria-expanded", "true");
    // Others remain collapsed — independent state per instance.
    for (let i = 1; i < toggles.length; i++) {
      expect(toggles[i]).toHaveAttribute("aria-expanded", "false");
    }
  });

  it("copying the masterRoot writes the FULL hex (not the 32-char preview) to clipboard", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(makeFixture());
    await waitFor(() => {
      expect(screen.getByText("Verified.")).toBeInTheDocument();
    });
    // The masterRoot CheckCard's copy button — scope via the card heading.
    // Note: "masterRoot" text appears in BOTH the CheckCard (a <div>) and the
    // SnapshotMeta row (a <dt>) — V2.4 made the meta row render the same key.
    // Selector "div" disambiguates: we want the CheckCard's label, not the
    // dt under SnapshotMeta. Without the selector this is a multi-match throw.
    const masterCard = screen
      .getByText("masterRoot", { selector: "div" })
      .closest("div.rounded-xl");
    expect(masterCard).toBeInTheDocument();
    // V2.3 makes PASS cards render BOTH `expected` and `computed` rows, each
    // with its own copy button. On PASS the two hashes are identical, so any
    // copy click writes the full masterRoot hex — `getAllByTestId` + [0]
    // picks the first deterministically rather than tripping a multi-match.
    const copies = within(masterCard as HTMLElement).getAllByTestId("verify-hash-copy");
    expect(copies.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(copies[0]);
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(FIXTURE_MASTER_ROOT);
    });
  });

  it("ShardRootsTable rows expose expand + copy for each shard root", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(makeFixture());
    await waitFor(() => {
      expect(screen.getByText("Verified.")).toBeInTheDocument();
    });
    // "Shard roots" lives in the heading div. The heading's `.closest("div")`
    // is itself — which doesn't enclose the <table> rows. Walk up to the
    // outer container that wraps heading + table (it carries `overflow-hidden`
    // + `rounded-xl`). Without this we'd be searching only the heading.
    const shardSection = screen.getByText(/Shard roots/).closest("div.overflow-hidden");
    expect(shardSection).toBeInTheDocument();
    // One shard in the fixture → at least one toggle + copy inside the table.
    const tableToggles = within(shardSection as HTMLElement).getAllByTestId("verify-hash-toggle");
    expect(tableToggles.length).toBeGreaterThanOrEqual(1);
  });

  it("SnapshotMeta masterRoot + fingerprint rows are copyable", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(makeFixture());
    await waitFor(() => {
      expect(screen.getByText("Verified.")).toBeInTheDocument();
    });
    // The "Snapshot metadata" heading sits inside a div that is itself the
    // panel root only because the panel uses `rounded-xl`. `.closest("div")`
    // returns the heading's own enclosing div (just the heading), not the
    // panel root — scope explicitly to the rounded-xl ancestor so the dl
    // rows are inside the search.
    const metaPanel = screen.getByText("Snapshot metadata").closest("div.rounded-xl");
    expect(metaPanel).toBeInTheDocument();
    const meta = within(metaPanel as HTMLElement);
    // masterRoot dt → dd contains a HashWithCopy. selector "dt" pins this to
    // the SnapshotMeta row (the same key also appears as a CheckCard label
    // outside this panel — selector keeps us inside the dl).
    const masterDt = meta.getByText("masterRoot", { selector: "dt" });
    expect(masterDt).toBeInTheDocument();
    // At least 2 copy buttons in this panel (masterRoot + fingerprint).
    const copies = meta.getAllByTestId("verify-hash-copy");
    expect(copies.length).toBeGreaterThanOrEqual(2);
  });
});
