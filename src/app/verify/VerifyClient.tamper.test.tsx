/**
 * Tests for V2.1 — TamperControls + the three tamper mutation helpers.
 *
 * Two distinct test layers:
 *
 *   1. PURE — the tamper functions (tamperFlipMasterBit, tamperMutateAtom,
 *      tamperDropAuditEntry) operate on a SnapshotV1 and return a mutated
 *      clone. These are side-effect-free and can be tested without React.
 *
 *   2. INTEGRATION — the TamperControls panel inside VerifyClient renders
 *      on a successful verify, the three buttons re-run the verifier on
 *      the mutated clone, and the ResultPanel re-renders against the new
 *      result. "Restore original" reverts. New file drop resets tamper
 *      state automatically.
 *
 * Critical invariants under test:
 *   - Tampers NEVER mutate the original snapshot in place (state.rawSnap is
 *     preserved by structuredClone).
 *   - Re-tampering with a different mode starts from the ORIGINAL, not from
 *     the currently-tampered state (no compound mutations).
 *   - Subsequent file drops clear tamper state (no leakage across snapshots).
 *   - Disabled buttons are inert: clicking does nothing when the relevant
 *     data is absent.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import VerifyClient, {
  tamperFlipMasterBit,
  tamperMutateAtom,
  tamperDropAuditEntry,
  type TamperMode,
} from "./VerifyClient";
import type { SnapshotV1 } from "./verifier";

vi.mock("./verifier", async () => {
  const actual = await vi.importActual<typeof import("./verifier")>("./verifier");
  return { ...actual, verifySnapshot: vi.fn() };
});
import { verifySnapshot } from "./verifier";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ROOT_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ROOT_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const LEAF_HASH_A = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

function makeFullSnap(): SnapshotV1 {
  return {
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
      shardLeafCounts: [1],
      atomCount: 1,
      edgesRoot: ROOT_A,
      auditLogRoot: ROOT_A,
    },
    atoms: [
      {
        key: "v1.fact.example",
        type: "fact",
        shardId: 0,
        leafIndex: 0,
        leafHash: LEAF_HASH_A,
        tombstoned: false,
        valuePresent: false,
      },
    ],
    hubAtoms: [],
    edges: [],
    auditLogExcerpt: {
      windowStartMs: 1000,
      windowEndMs: 9999,
      totalRecorded: 1,
      entries: [{ eventId: "e1", recordedAtMs: 1500, kind: "access" } as Record<string, unknown>],
    },
    signature: {
      alg: "Ed25519",
      kid: "mmpm-snapshot-signing-v1",
      publicKey: "AAAA",
      publicKeyFingerprint: "8d:20:7c:72:72:1f",
      keyUri: "https://parametric-memory.dev/.well-known/jwks.json",
      sig: "AAAA",
    },
  };
}

// ── Layer 1: pure tamper-helper tests ───────────────────────────────────────

describe("V2.1 — tamper helpers (pure)", () => {
  describe("tamperFlipMasterBit", () => {
    it("returns a clone whose tree.masterRoot has the high bit of the first nibble flipped", () => {
      const snap = makeFullSnap();
      const out = tamperFlipMasterBit(snap);
      expect(out).not.toBeNull();
      expect(out!.tree.masterRoot).not.toBe(snap.tree.masterRoot);
      // Same length — only one bit changed.
      expect(out!.tree.masterRoot.length).toBe(snap.tree.masterRoot.length);
      // 'a' (0xa = 1010) XOR 0x8 = 0x2 (0010). So first char flips from 'a' to '2'.
      expect(out!.tree.masterRoot[0]).toBe("2");
      // Rest of the hex is untouched.
      expect(out!.tree.masterRoot.slice(1)).toBe(snap.tree.masterRoot.slice(1));
    });

    it("does not mutate the input snapshot in place", () => {
      const snap = makeFullSnap();
      const originalRoot = snap.tree.masterRoot;
      tamperFlipMasterBit(snap);
      expect(snap.tree.masterRoot).toBe(originalRoot);
    });

    it("returns null on a snapshot with an empty masterRoot (defensive)", () => {
      const snap = makeFullSnap();
      snap.tree.masterRoot = "";
      expect(tamperFlipMasterBit(snap)).toBeNull();
    });
  });

  describe("tamperMutateAtom", () => {
    it("flips a bit in atoms[0].leafHash and leaves all other fields untouched", () => {
      const snap = makeFullSnap();
      const out = tamperMutateAtom(snap);
      expect(out).not.toBeNull();
      expect(out!.atoms[0].leafHash).not.toBe(snap.atoms[0].leafHash);
      expect(out!.atoms[0].leafHash[0]).toBe("9"); // '1' (0x1 = 0001) XOR 0x8 = 0x9 (1001)
      expect(out!.atoms[0].leafHash.slice(1)).toBe(snap.atoms[0].leafHash.slice(1));
      // Other atom fields are preserved.
      expect(out!.atoms[0].key).toBe(snap.atoms[0].key);
      expect(out!.atoms[0].shardId).toBe(snap.atoms[0].shardId);
      expect(out!.atoms[0].leafIndex).toBe(snap.atoms[0].leafIndex);
    });

    it("returns null when atoms is empty", () => {
      const snap = makeFullSnap();
      snap.atoms = [];
      expect(tamperMutateAtom(snap)).toBeNull();
    });

    it("does not mutate the input snapshot in place", () => {
      const snap = makeFullSnap();
      const originalLeafHash = snap.atoms[0].leafHash;
      tamperMutateAtom(snap);
      expect(snap.atoms[0].leafHash).toBe(originalLeafHash);
    });
  });

  describe("tamperDropAuditEntry", () => {
    it("removes the first entry from auditLogExcerpt.entries", () => {
      const snap = makeFullSnap();
      // Add a second entry so dropping leaves at least one (more realistic).
      snap.auditLogExcerpt!.entries.push({
        eventId: "e2",
        recordedAtMs: 2000,
        kind: "access",
      } as Record<string, unknown>);

      const out = tamperDropAuditEntry(snap);
      expect(out).not.toBeNull();
      expect(out!.auditLogExcerpt!.entries.length).toBe(1);
      expect(out!.auditLogExcerpt!.entries[0].eventId).toBe("e2");
    });

    it("returns null when there is no auditLogExcerpt", () => {
      const snap = makeFullSnap();
      delete snap.auditLogExcerpt;
      expect(tamperDropAuditEntry(snap)).toBeNull();
    });

    it("returns null when auditLogExcerpt.entries is empty", () => {
      const snap = makeFullSnap();
      snap.auditLogExcerpt!.entries = [];
      expect(tamperDropAuditEntry(snap)).toBeNull();
    });

    it("does not mutate the input snapshot in place", () => {
      const snap = makeFullSnap();
      const originalLen = snap.auditLogExcerpt!.entries.length;
      tamperDropAuditEntry(snap);
      expect(snap.auditLogExcerpt!.entries.length).toBe(originalLen);
    });
  });
});

// ── Layer 2: integration — TamperControls inside VerifyClient ───────────────

function fixtureText(): string {
  return JSON.stringify(makeFullSnap());
}

function makePassResult(snap?: SnapshotV1) {
  const s = snap ?? makeFullSnap();
  return {
    overallOk: true,
    formatVersion: { ok: true, expected: "1.0.0", computed: "1.0.0", detail: "" },
    signature: { ok: true, detail: "Ed25519 valid" },
    edgesRoot: { ok: true, expected: s.tree.edgesRoot, computed: s.tree.edgesRoot, detail: "" },
    shardRoots: {
      ok: true,
      perShard: [
        { shardId: 0, ok: true, expected: s.tree.shardRoots[0], computed: s.tree.shardRoots[0] },
      ],
    },
    masterRoot: { ok: true, expected: s.tree.masterRoot, computed: s.tree.masterRoot, detail: "" },
    auditLogRoot: {
      ok: true,
      expected: s.tree.auditLogRoot ?? "",
      computed: s.tree.auditLogRoot ?? "",
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

function makeFailResult(label: string, expected: string, computed: string) {
  const pass = makePassResult();
  return {
    ...pass,
    overallOk: false,
    [label]: { ok: false, expected, computed, detail: `${label} mismatch` },
    summary: `FAILED: ${label} did not pass.`,
  };
}

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, text: () => Promise.resolve(fixtureText()) }),
  ) as unknown as typeof fetch;
  // The verifySnapshot mock is the SAME instance across the whole file (the
  // vi.mock factory creates it once at module load). Without clearing it
  // between tests, `mock.calls.length` and queued `mockResolvedValueOnce`
  // values accumulate — so `toHaveBeenCalledTimes(3)` in the re-tamper test
  // would sum every prior test's invocations. Reset call history (and any
  // un-consumed queued values) per test.
  vi.mocked(verifySnapshot).mockReset();
});

async function dropSnapshot(text: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input not found");
  const file = new File([text], "snap.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: () => Promise.resolve(text), configurable: true });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

describe("V2.1 — TamperControls inside VerifyClient (integration)", () => {
  it("renders the tamper-controls panel ONLY after a successful verify", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    expect(screen.queryByTestId("verify-tamper-controls")).not.toBeInTheDocument();
    await dropSnapshot(fixtureText());
    await waitFor(() => {
      expect(screen.getByTestId("verify-tamper-controls")).toBeInTheDocument();
    });
  });

  // ── 2026-05-14 audit-flow refinement ──────────────────────────────────────
  // TamperControls used to sit at the bottom of the result panel, below
  // SnapshotMeta. Auditor feedback: the reader needs to see "you can flip a
  // bit" while they're still in the trust block, so the dawning "wait, can I
  // actually test this?" pulls them back up after they've scrolled the green
  // proofs. New position: BELOW the public-keys panel, ABOVE the per-check
  // CheckCard grid. This test pins the position so a future render-order
  // refactor can't silently move it back.
  it("tamper-controls panel sits BETWEEN PublicKeysPanel and the first CheckCard (audit-flow position)", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(fixtureText());
    const tamper = await screen.findByTestId("verify-tamper-controls");
    // PublicKeysPanel is identified by its heading.
    const publicKeysHeading = screen.getByText("Public keys published independently");
    // The first CheckCard is "formatVersion" (label inside a <div>).
    const formatVersionCheckCard = screen.getByText("formatVersion", { selector: "div" });
    // DOCUMENT_POSITION_FOLLOWING (bit 4) means the second argument FOLLOWS
    // the receiver in source order. We assert: publicKeys precedes tamper,
    // and tamper precedes formatVersion. Bitwise check is the standard
    // testing-library / DOM API idiom for this.
    // eslint-disable-next-line no-bitwise
    expect(publicKeysHeading.compareDocumentPosition(tamper) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // eslint-disable-next-line no-bitwise
    expect(tamper.compareDocumentPosition(formatVersionCheckCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders all three tamper buttons when the snapshot has atoms + audit entries", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(fixtureText());
    await waitFor(() => {
      expect(screen.getByTestId("verify-tamper-flip-master")).toBeEnabled();
      expect(screen.getByTestId("verify-tamper-mutate-atom")).toBeEnabled();
      expect(screen.getByTestId("verify-tamper-drop-audit")).toBeEnabled();
    });
  });

  it("disables mutate-atom + drop-audit when the snapshot has none of each", async () => {
    const minimalSnap = makeFullSnap();
    minimalSnap.atoms = [];
    delete minimalSnap.auditLogExcerpt;
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult(minimalSnap));
    render(<VerifyClient />);
    await dropSnapshot(JSON.stringify(minimalSnap));
    await waitFor(() => {
      expect(screen.getByTestId("verify-tamper-controls")).toBeInTheDocument();
    });
    expect(screen.getByTestId("verify-tamper-flip-master")).toBeEnabled();
    expect(screen.getByTestId("verify-tamper-mutate-atom")).toBeDisabled();
    expect(screen.getByTestId("verify-tamper-drop-audit")).toBeDisabled();
  });

  it("flipping a bit in masterRoot shows the tamper ribbon and renders the FAIL result", async () => {
    // First verifySnapshot — the initial verify — returns PASS.
    // Second verifySnapshot — invoked by the tamper button — returns a FAIL.
    vi.mocked(verifySnapshot)
      .mockResolvedValueOnce(makePassResult())
      .mockResolvedValueOnce(makeFailResult("masterRoot", ROOT_A, ROOT_B));
    render(<VerifyClient />);
    await dropSnapshot(fixtureText());
    await waitFor(() => {
      expect(screen.getByTestId("verify-tamper-controls")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("verify-tamper-flip-master"));

    // Ribbon appears.
    const ribbon = await screen.findByTestId("verify-tamper-ribbon");
    expect(ribbon).toHaveTextContent(/TAMPER DEMO/i);
    expect(ribbon).toHaveTextContent(/masterRoot \+ Ed25519 signature/);

    // Result panel now shows FAILED summary.
    await waitFor(() => {
      expect(screen.getByText(/FAILED: masterRoot did not pass/)).toBeInTheDocument();
    });
  });

  it("`Restore original` reverts to the un-tampered PASS state", async () => {
    vi.mocked(verifySnapshot)
      .mockResolvedValueOnce(makePassResult())
      .mockResolvedValueOnce(makeFailResult("masterRoot", ROOT_A, ROOT_B));
    render(<VerifyClient />);
    await dropSnapshot(fixtureText());
    await waitFor(() => {
      expect(screen.getByTestId("verify-tamper-controls")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("verify-tamper-flip-master"));
    await screen.findByTestId("verify-tamper-ribbon");

    // Click restore.
    fireEvent.click(screen.getByTestId("verify-tamper-restore"));

    // Ribbon is gone, PASS summary is back.
    await waitFor(() => {
      expect(screen.queryByTestId("verify-tamper-ribbon")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Verified.")).toBeInTheDocument();
  });

  it("re-tampering with a different mode starts from the ORIGINAL, not the tampered state", async () => {
    // Three verifications: initial PASS, then a master-bit FAIL, then a
    // drop-audit FAIL. If V2.1 incorrectly tampered ON TOP of the previous
    // tamper, the second result's expected/computed shape would also reflect
    // the first tamper's mutation. The mock makes assertions tight.
    vi.mocked(verifySnapshot)
      .mockResolvedValueOnce(makePassResult())
      .mockResolvedValueOnce(makeFailResult("masterRoot", ROOT_A, ROOT_B))
      .mockResolvedValueOnce(makeFailResult("auditLogRoot", ROOT_A, ROOT_B));
    render(<VerifyClient />);
    await dropSnapshot(fixtureText());
    await waitFor(() => {
      expect(screen.getByTestId("verify-tamper-controls")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("verify-tamper-flip-master"));
    await waitFor(() => {
      expect(screen.getByText(/FAILED: masterRoot did not pass/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("verify-tamper-drop-audit"));
    await waitFor(() => {
      expect(screen.getByText(/FAILED: auditLogRoot did not pass/)).toBeInTheDocument();
    });

    // Verifier was called 3 times total: initial verify + 2 tampers.
    expect(vi.mocked(verifySnapshot)).toHaveBeenCalledTimes(3);
    // The SECOND tamper call should have been invoked with a snapshot whose
    // masterRoot is the ORIGINAL ROOT_A (not the tampered "2aaa..." value).
    // This is the test that catches "compound mutations" if V2.1 ever
    // accidentally tampers on top of tampered state.
    const secondTamperCall = vi.mocked(verifySnapshot).mock.calls[2][0];
    expect(secondTamperCall.tree.masterRoot).toBe(ROOT_A);
  });

  it("dropping a new file resets tamper state automatically", async () => {
    vi.mocked(verifySnapshot)
      .mockResolvedValueOnce(makePassResult())
      .mockResolvedValueOnce(makeFailResult("masterRoot", ROOT_A, ROOT_B))
      .mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(fixtureText());
    await waitFor(() => {
      expect(screen.getByTestId("verify-tamper-controls")).toBeInTheDocument();
    });

    // Tamper.
    fireEvent.click(screen.getByTestId("verify-tamper-flip-master"));
    await screen.findByTestId("verify-tamper-ribbon");

    // Drop a fresh file.
    await dropSnapshot(fixtureText());

    // Ribbon is gone, fresh PASS rendered.
    await waitFor(() => {
      expect(screen.queryByTestId("verify-tamper-ribbon")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Verified.")).toBeInTheDocument();
  });
});
