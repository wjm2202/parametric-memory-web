/**
 * Tests for V2.3 — show `computed` alongside `expected` on PASS cards.
 *
 * Before V2.3, CheckCard rendered the `computed` row ONLY when it differed
 * from `expected` (i.e., on FAIL). PASS cards showed only `expected`, asking
 * the reader to trust that the verifier did the work. V2.3 changes this so
 * that on PASS, both rows render side by side, with a small green ✓ next to
 * the `computed` row to affirm the match.
 *
 * Covers:
 *   1. PASS card with both expected + computed → BOTH rows render. The
 *      `computed` row has the verify-hash-match-tick.
 *   2. FAIL card preserves the existing rendering: computed in red, no tick.
 *   3. Cards where only one of expected/computed is present render that one
 *      (no orphaned tick).
 *   4. Absent cards (e.g., consistency proof in a single-version snapshot)
 *      render no hash rows at all.
 *
 * Existing V2.2 (HashWithCopy) integration tests already cover the
 * expand/copy interactions on the now-always-rendered `computed` row.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import VerifyClient from "./VerifyClient";

vi.mock("./verifier", async () => {
  const actual = await vi.importActual<typeof import("./verifier")>("./verifier");
  return { ...actual, verifySnapshot: vi.fn() };
});
import { verifySnapshot } from "./verifier";

// ── Fixtures (single-shard, minimum-viable snapshot for end-to-end test) ─────

const ROOT_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ROOT_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

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
      masterRoot: ROOT_A,
      shardCount: 1,
      shardRoots: [ROOT_A],
      shardLeafCounts: [8],
      atomCount: 8,
      edgesRoot: ROOT_A,
      auditLogRoot: ROOT_A,
    },
    atoms: [],
    hubAtoms: [],
    edges: [],
    signature: {
      alg: "Ed25519",
      kid: "mmpm-snapshot-signing-v1",
      publicKey: "AAAA",
      publicKeyFingerprint: "8d:20:7c:72:72:1f",
      keyUri: "https://parametric-memory.dev/.well-known/jwks.json",
      sig: "AAAA",
    },
  });
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

// Find the CheckCard whose label matches — returns the card root element.
// Each CheckCard renders a <div className="text-sm font-medium text-white">{label}</div>
// at its top; walk up to the rounded-xl card root.
//
// V2.4 caveat: several of these labels (masterRoot, formatVersion, etc.)
// ALSO appear in SnapshotMeta as <dt> rows. The selector restricts the match
// to the CheckCard's <div> label so we don't get a multi-match throw.
function findCard(label: string): HTMLElement {
  const labelEl = screen.getByText(label, { selector: "div" });
  const card = labelEl.closest("div.rounded-xl");
  if (!card) throw new Error(`Card root for "${label}" not found`);
  return card as HTMLElement;
}

describe("V2.3 — CheckCard renders `computed` on PASS with a match indicator", () => {
  it("PASS card with expected + computed shows BOTH rows", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce({
      overallOk: true,
      formatVersion: { ok: true, expected: "1.0.0", computed: "1.0.0", detail: "" },
      signature: { ok: true, detail: "Ed25519 valid" },
      edgesRoot: { ok: true, expected: ROOT_A, computed: ROOT_A, detail: "edges root pass" },
      shardRoots: { ok: true, perShard: [] },
      masterRoot: { ok: true, expected: ROOT_A, computed: ROOT_A, detail: "master root pass" },
      auditLogRoot: { ok: true, expected: ROOT_A, computed: ROOT_A, detail: "audit pass" },
      hubAtoms: { ok: true, detail: "" },
      tombstones: { ok: true, detail: "" },
      atomValueBind: { ok: true, detail: "" },
      consistencyProof: { ok: true, absent: true, detail: "no consistency proof" },
      auditEntries: { ok: true, detail: "" },
      summary: "Verified.",
    });
    render(<VerifyClient />);
    await dropSnapshot(makeFixture());
    await waitFor(() => {
      expect(screen.getByText("Verified.")).toBeInTheDocument();
    });

    const card = findCard("masterRoot");
    expect(within(card).getByText(/expected/i)).toBeInTheDocument();
    // Before V2.3 the `computed` row would be MISSING on PASS. V2.3 makes it
    // always render. The "computed" label appears on PASS cards now.
    expect(within(card).getByText(/computed/i)).toBeInTheDocument();
    // And the ✓ match tick appears next to the computed value.
    expect(within(card).getByTestId("verify-hash-match-tick")).toBeInTheDocument();
  });

  it("FAIL card preserves the existing red `computed` row WITHOUT the match tick", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce({
      overallOk: false,
      formatVersion: { ok: true, expected: "1.0.0", computed: "1.0.0", detail: "" },
      signature: { ok: true, detail: "Ed25519 valid" },
      edgesRoot: { ok: true, expected: ROOT_A, computed: ROOT_A, detail: "" },
      shardRoots: { ok: true, perShard: [] },
      // masterRoot fails — expected != computed.
      masterRoot: {
        ok: false,
        expected: ROOT_A,
        computed: ROOT_B,
        detail: "masterRoot mismatch",
      },
      auditLogRoot: { ok: true, expected: ROOT_A, computed: ROOT_A, detail: "" },
      hubAtoms: { ok: true, detail: "" },
      tombstones: { ok: true, detail: "" },
      atomValueBind: { ok: true, detail: "" },
      consistencyProof: { ok: true, absent: true, detail: "" },
      auditEntries: { ok: true, detail: "" },
      summary: "FAILED: masterRoot did not pass.",
    });
    render(<VerifyClient />);
    await dropSnapshot(makeFixture());
    // /FAILED/ matches BOTH the badge ("FAILED") and the summary line
    // ("FAILED: …") — getByText would throw on multi-match and waitFor would
    // retry until timeout. Anchor on the exact summary string, which is
    // unique on the page, to wait for the hero to render.
    await screen.findByText("FAILED: masterRoot did not pass.");

    const card = findCard("masterRoot");
    expect(within(card).getByText(/expected/i)).toBeInTheDocument();
    expect(within(card).getByText(/computed/i)).toBeInTheDocument();
    // The match tick must NOT render on a FAIL card.
    expect(within(card).queryByTestId("verify-hash-match-tick")).not.toBeInTheDocument();
  });

  it("PASS card with `expected` but no `computed` renders only the expected row (no orphaned tick)", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce({
      overallOk: true,
      // formatVersion in real code has both expected + computed. But some
      // checks (hubAtoms, atomValueBind, etc.) only emit a detail string with
      // no expected/computed hashes — those don't render hash rows at all,
      // which is tested below. This case covers a card that emits only
      // `expected` (defensive — current code doesn't do this, but the render
      // path must handle it without rendering an orphaned tick).
      formatVersion: { ok: true, expected: "1.0.0", detail: "" },
      signature: { ok: true, detail: "Ed25519 valid" },
      edgesRoot: { ok: true, expected: ROOT_A, computed: ROOT_A, detail: "" },
      shardRoots: { ok: true, perShard: [] },
      masterRoot: { ok: true, expected: ROOT_A, computed: ROOT_A, detail: "" },
      auditLogRoot: { ok: true, expected: ROOT_A, computed: ROOT_A, detail: "" },
      hubAtoms: { ok: true, detail: "" },
      tombstones: { ok: true, detail: "" },
      atomValueBind: { ok: true, detail: "" },
      consistencyProof: { ok: true, absent: true, detail: "" },
      auditEntries: { ok: true, detail: "" },
      summary: "Verified.",
    });
    render(<VerifyClient />);
    await dropSnapshot(makeFixture());
    await waitFor(() => {
      expect(screen.getByText("Verified.")).toBeInTheDocument();
    });

    const card = findCard("formatVersion");
    expect(within(card).getByText(/expected/i)).toBeInTheDocument();
    // No computed → no tick (the tick only renders when both are present and match).
    expect(within(card).queryByText(/computed/i)).not.toBeInTheDocument();
    expect(within(card).queryByTestId("verify-hash-match-tick")).not.toBeInTheDocument();
  });

  it("absent card (e.g., consistency proof in single-version snapshot) renders no hash rows", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce({
      overallOk: true,
      formatVersion: { ok: true, expected: "1.0.0", computed: "1.0.0", detail: "" },
      signature: { ok: true, detail: "Ed25519 valid" },
      edgesRoot: { ok: true, expected: ROOT_A, computed: ROOT_A, detail: "" },
      shardRoots: { ok: true, perShard: [] },
      masterRoot: { ok: true, expected: ROOT_A, computed: ROOT_A, detail: "" },
      auditLogRoot: { ok: true, expected: ROOT_A, computed: ROOT_A, detail: "" },
      hubAtoms: { ok: true, detail: "" },
      tombstones: { ok: true, detail: "" },
      atomValueBind: { ok: true, detail: "" },
      // absent: true means "not present in snapshot" — neither expected nor computed.
      consistencyProof: { ok: true, absent: true, detail: "no consistency proof" },
      auditEntries: { ok: true, detail: "" },
      summary: "Verified.",
    });
    render(<VerifyClient />);
    await dropSnapshot(makeFixture());
    await waitFor(() => {
      expect(screen.getByText("Verified.")).toBeInTheDocument();
    });

    const card = findCard("consistency proof");
    // The "not in snapshot" badge renders (existing behaviour).
    expect(within(card).getByText(/not in snapshot/i)).toBeInTheDocument();
    // But no hash rows render — both `expected` and `computed` are absent.
    expect(within(card).queryByText(/^expected/i)).not.toBeInTheDocument();
    expect(within(card).queryByText(/^computed/i)).not.toBeInTheDocument();
    expect(within(card).queryByTestId("verify-hash-match-tick")).not.toBeInTheDocument();
  });
});
