/**
 * Tests for V3.4 — human-tone success header above the result-hero summary.
 *
 * Covers:
 *   1. Idle state — no greeting (the sentence belongs above a verified result,
 *      not the upload prompt).
 *   2. Successful verify — greeting renders with the canonical wording
 *      anchors: "independently verified", "browser", "No server trust", "No
 *      API key", "No Parametric Memory code path". The anchors are pinned so
 *      a future copy edit that softens the trust claims surfaces here for
 *      review.
 *   3. Failed verify — greeting MUST NOT render. The rose-coloured summary
 *      carries the message on FAIL; a warmer greeting would feel tone-deaf.
 *   4. Greeting renders ABOVE the technical `result.summary` line — pinned
 *      by DOM order so future refactors that move it below the summary fail
 *      this test (the whole point of V3.4 is greeting-first, engine-output
 *      second).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import VerifyClient from "./VerifyClient";
import type { SnapshotV1 } from "./verifier";

vi.mock("./verifier", async () => {
  const actual = await vi.importActual<typeof import("./verifier")>("./verifier");
  return { ...actual, verifySnapshot: vi.fn() };
});
import { verifySnapshot } from "./verifier";

const ROOT_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ROOT_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function makeSnap(): SnapshotV1 {
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

function makeFailResult() {
  return {
    overallOk: false,
    formatVersion: { ok: true, expected: "1.0.0", computed: "1.0.0", detail: "" },
    signature: { ok: true, detail: "Ed25519 valid" },
    edgesRoot: { ok: true, expected: ROOT_A, computed: ROOT_A, detail: "" },
    shardRoots: { ok: true, perShard: [] },
    masterRoot: { ok: false, expected: ROOT_A, computed: ROOT_B, detail: "masterRoot mismatch" },
    auditLogRoot: { ok: true, expected: ROOT_A, computed: ROOT_A, detail: "" },
    hubAtoms: { ok: true, detail: "" },
    tombstones: { ok: true, detail: "" },
    atomValueBind: { ok: true, detail: "" },
    consistencyProof: { ok: true, absent: true, detail: "" },
    auditEntries: { ok: true, detail: "" },
    summary: "FAILED: masterRoot did not pass.",
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

describe("V3.4 — success-greeting sentence", () => {
  it("idle state: no greeting renders (it belongs above a verified result, not the upload prompt)", () => {
    render(<VerifyClient />);
    expect(screen.queryByTestId("verify-success-greeting")).not.toBeInTheDocument();
  });

  it("on a successful verify, renders the greeting with the canonical trust-claim anchors", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(makeSnap());
    const greeting = await screen.findByTestId("verify-success-greeting");
    // Pin the substantive claims. If a future copy edit softens any of them,
    // the change will surface here for review.
    expect(greeting).toHaveTextContent(/independently verified/i);
    expect(greeting).toHaveTextContent(/browser/i);
    expect(greeting).toHaveTextContent(/No server trust/i);
    expect(greeting).toHaveTextContent(/No API key/i);
    expect(greeting).toHaveTextContent(/No Parametric Memory code path/i);
  });

  it("on a FAIL, the greeting MUST NOT render — the rose summary speaks for itself", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makeFailResult());
    render(<VerifyClient />);
    await dropSnapshot(makeSnap());
    // Wait for the FAIL summary so we know the result hero has rendered, then
    // assert the greeting is absent from that hero. Use the exact summary
    // string (NOT /FAILED/) because "FAILED" appears in BOTH the badge and
    // the summary line — getByText with a multi-match regex would throw and
    // waitFor would hang. The exact summary string is unique.
    await screen.findByText("FAILED: masterRoot did not pass.");
    expect(screen.queryByTestId("verify-success-greeting")).not.toBeInTheDocument();
  });

  it("greeting renders ABOVE the technical result.summary line (greeting-first, engine-output second)", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(makeSnap());
    const greeting = await screen.findByTestId("verify-success-greeting");
    const summary = await screen.findByText("Verified.");
    // DOCUMENT_POSITION_FOLLOWING (4) means `summary` comes AFTER `greeting`
    // in source order — i.e. greeting is above summary in the rendered hero.
    const relation = greeting.compareDocumentPosition(summary);
    expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
