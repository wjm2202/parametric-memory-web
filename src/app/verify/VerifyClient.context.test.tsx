/**
 * Tests for V2.4 — atom-context sentence under SnapshotMeta.
 *
 * Covers:
 *   1. Sentence renders only after a successful verify (state.kind === done).
 *   2. Sentence content includes the canonical "facts, procedures, state,
 *      events, and hub atoms" anchor — pinned so a future copy edit doesn't
 *      silently drop the substantive list.
 *   3. The redaction wording adapts to the actual snapshot:
 *      - When no atom has a `value` field: "Atom plaintext is redacted".
 *      - When any atom has a `value` field: "NOT redacted" warning.
 *   4. No hardcoded numeric atom counts appear in the sentence copy itself
 *      — the existing atomCount metadata row carries the number; the
 *      sentence stays count-agnostic so changing the demo doesn't change
 *      the copy.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import VerifyClient from "./VerifyClient";
import type { SnapshotV1 } from "./verifier";

vi.mock("./verifier", async () => {
  const actual = await vi.importActual<typeof import("./verifier")>("./verifier");
  return { ...actual, verifySnapshot: vi.fn() };
});
import { verifySnapshot } from "./verifier";

const ROOT_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function makeSnap(opts?: { unredacted?: boolean }): SnapshotV1 {
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
    atoms: opts?.unredacted
      ? [
          {
            key: "v1.fact.example",
            type: "fact",
            shardId: 0,
            leafIndex: 0,
            leafHash: ROOT_A,
            tombstoned: false,
            valuePresent: true,
            value: "this is plaintext content that should not ship publicly",
          },
        ]
      : [
          {
            key: "v1.fact.example",
            type: "fact",
            shardId: 0,
            leafIndex: 0,
            leafHash: ROOT_A,
            tombstoned: false,
            valuePresent: false,
          },
        ],
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
  };
}

function makePassResult() {
  return {
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
    consistencyProof: { ok: true, absent: true, detail: "" },
    auditEntries: { ok: true, detail: "" },
    summary: "Verified.",
  };
}

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, text: () => Promise.resolve(JSON.stringify(makeSnap())) }),
  ) as unknown as typeof fetch;
});

async function dropSnapshot(snap: SnapshotV1): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input not found");
  const text = JSON.stringify(snap);
  const file = new File([text], "snap.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: () => Promise.resolve(text), configurable: true });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

describe("V2.4 — atom-context sentence", () => {
  it("renders ONLY after a successful verify (idle state has none)", async () => {
    render(<VerifyClient />);
    expect(screen.queryByTestId("verify-atom-context")).not.toBeInTheDocument();
  });

  it("renders after verify with the canonical atom-types anchor", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(makeSnap());
    const ctx = await screen.findByTestId("verify-atom-context");
    // Pin the substantive list. If a future copy edit drops "procedures" or
    // "hub atoms" the change will surface here for review.
    expect(ctx).toHaveTextContent(/facts/);
    expect(ctx).toHaveTextContent(/procedures/);
    expect(ctx).toHaveTextContent(/state/);
    expect(ctx).toHaveTextContent(/events/);
    expect(ctx).toHaveTextContent(/hub atoms/);
  });

  it("on a redacted snapshot, says 'Atom plaintext is redacted'", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(makeSnap()); // redacted (no `value` field on atoms)
    const ctx = await screen.findByTestId("verify-atom-context");
    expect(ctx).toHaveTextContent(/Atom plaintext is redacted/);
    // And does NOT say "NOT redacted" — the negative wording is the warning
    // path only.
    expect(ctx).not.toHaveTextContent(/NOT redacted/);
  });

  it("on an unredacted snapshot, surfaces the 'NOT redacted' warning", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(makeSnap({ unredacted: true }));
    const ctx = await screen.findByTestId("verify-atom-context");
    expect(ctx).toHaveTextContent(/NOT redacted/);
    expect(ctx).toHaveTextContent(/Customer-facing shares should always be redacted/);
  });

  it("contains no hardcoded numeric atom counts in the sentence copy", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(makeSnap());
    const ctx = await screen.findByTestId("verify-atom-context");
    // The copy must remain count-agnostic — atomCount lives in the metadata
    // row above, not in this prose. Match digit runs of length ≥1; expect
    // none. If a future edit slips in "3,397 atoms" or similar, this fails.
    expect(ctx.textContent ?? "").not.toMatch(/\d/);
  });
});
