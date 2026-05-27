/**
 * Tests for V1.1 — ScopePanel.
 *
 * Covers:
 *   1. Panel does NOT render before a verify has happened.
 *   2. Panel DOES render after a successful verify (overallOk: true) with the
 *      correct heading text "Scope of this verification".
 *   3. Panel DOES render after a failed verify (overallOk: false) with the
 *      heading text "Scope of this verification attempt".
 *   4. The "What this proves" column contains the four required claim substrings,
 *      scoped to that column only (other places on the page also mention
 *      Ed25519 / atom / Merkle — we deliberately don't match those).
 *   5. The "What this does NOT prove" column contains the three required
 *      caveat substrings, scoped to that column only.
 *   6. Panel does NOT render during the transient `verifying` state.
 *
 * All component queries that could match in multiple places on the rendered
 * page are scoped via `within(...)` to a panel-local subtree, so adding
 * unrelated content elsewhere on the page cannot break these tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import VerifyClient from "./VerifyClient";

vi.mock("./verifier", async () => {
  const actual = await vi.importActual<typeof import("./verifier")>("./verifier");
  return { ...actual, verifySnapshot: vi.fn() };
});
import { verifySnapshot } from "./verifier";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SNAP_FIXTURE_TEXT = JSON.stringify({
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
    masterRoot: "88007222f87d4267fd984dc705dd70dd8bd5a689bab22cdb654efd5379e8e2ed",
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
    publicKeyFingerprint: "8d:20:7c:72:72:1f:8c:1a:a2:40:f7:9b:50:91:4a:d3",
    keyUri: "https://parametric-memory.dev/.well-known/jwks.json",
    sig: "AAAA",
  },
});

function makePassResult() {
  return {
    overallOk: true,
    formatVersion: { ok: true, expected: "1.0.0", computed: "1.0.0", detail: "" },
    signature: { ok: true, detail: "Ed25519 valid" },
    edgesRoot: { ok: true, expected: "ff".repeat(32), computed: "ff".repeat(32), detail: "" },
    shardRoots: { ok: true, perShard: [] },
    masterRoot: { ok: true, expected: "88007222", computed: "88007222", detail: "" },
    auditLogRoot: { ok: true, expected: "11".repeat(32), computed: "11".repeat(32), detail: "" },
    hubAtoms: { ok: true, detail: "" },
    tombstones: { ok: true, detail: "" },
    atomValueBind: { ok: true, detail: "" },
    consistencyProof: { ok: true, absent: true, detail: "" },
    auditEntries: { ok: true, detail: "" },
    summary: "Verified: 0 atoms, 0 edges — all checks passed.",
  };
}

function makeFailResult() {
  return {
    ...makePassResult(),
    overallOk: false,
    masterRoot: {
      ok: false,
      expected: "88007222",
      computed: "deadbeef",
      detail: "masterRoot mismatch",
    },
    summary: "FAILED: masterRoot did not pass.",
  };
}

// ── Mocks + helpers ──────────────────────────────────────────────────────────

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      text: () => Promise.resolve(SNAP_FIXTURE_TEXT),
    }),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function dropSnapshot(fileText: string): Promise<void> {
  const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!fileInput) throw new Error("file input not found in rendered VerifyClient");
  const file = new File([fileText], "snap.json", { type: "application/json" });
  // jsdom's File doesn't always implement Blob.text() — patch it on the instance.
  Object.defineProperty(file, "text", {
    value: () => Promise.resolve(fileText),
    configurable: true,
  });
  Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
  fireEvent.change(fileInput);
}

/**
 * Locate the "What this proves" column of the ScopePanel and return a
 * within(...) scope rooted at that column. Used to scope substring assertions
 * so they cannot match identical wording elsewhere on the page (CheckCards,
 * SnapshotMeta dd values, etc).
 */
function provesColumn() {
  const heading = screen.getByText("What this proves");
  const column = heading.parentElement;
  if (!column) throw new Error("'What this proves' heading has no parent");
  return within(column);
}

function doesNotProveColumn() {
  const heading = screen.getByText("What this does NOT prove");
  const column = heading.parentElement;
  if (!column) throw new Error("'What this does NOT prove' heading has no parent");
  return within(column);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("V1.1 — ScopePanel", () => {
  it("does NOT render before a verify has happened (idle state)", () => {
    render(<VerifyClient />);
    expect(screen.queryByText("What this proves")).not.toBeInTheDocument();
    expect(screen.queryByText("What this does NOT prove")).not.toBeInTheDocument();
  });

  it("renders 'Scope of this verification' heading on a successful verify", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(SNAP_FIXTURE_TEXT);
    await waitFor(() => {
      // Exact match — guards against false positives if the fail-state heading
      // accidentally renders.
      expect(
        screen.getByText((content) => content.trim() === "Scope of this verification"),
      ).toBeInTheDocument();
    });
  });

  it("renders 'Scope of this verification attempt' heading on a FAILED verify", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makeFailResult());
    render(<VerifyClient />);
    await dropSnapshot(SNAP_FIXTURE_TEXT);
    await waitFor(() => {
      expect(
        screen.getByText((content) => content.trim() === "Scope of this verification attempt"),
      ).toBeInTheDocument();
    });
    // Both columns still render on FAIL — auditors want the statement either way.
    expect(screen.getByText("What this proves")).toBeInTheDocument();
    expect(screen.getByText("What this does NOT prove")).toBeInTheDocument();
  });

  it("'What this proves' column contains the four required claim substrings", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(SNAP_FIXTURE_TEXT);
    await waitFor(() => {
      expect(screen.getByText("What this proves")).toBeInTheDocument();
    });
    const proves = provesColumn();
    // selector: "li" restricts the matcher to <li> elements so ancestor
    // containers (ul, column root) whose textContent also matches don't trip
    // "Found multiple elements". Each li below is the leaf element carrying
    // one claim.
    expect(proves.getByText(/bit-exact/i, { selector: "li" })).toBeInTheDocument();
    expect(
      proves.getByText(/Ed25519 signature was produced/i, { selector: "li" }),
    ).toBeInTheDocument();
    expect(
      proves.getByText(/audit-log entries are authentic/i, { selector: "li" }),
    ).toBeInTheDocument();
    expect(proves.getByText(/Merkle commitments/i, { selector: "li" })).toBeInTheDocument();
  });

  it("'What this does NOT prove' column contains the three required caveat substrings", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(SNAP_FIXTURE_TEXT);
    await waitFor(() => {
      expect(screen.getByText("What this does NOT prove")).toBeInTheDocument();
    });
    const notProves = doesNotProveColumn();
    // selector: "li" — same rationale as above.
    expect(notProves.getByText(/substrate is/i, { selector: "li" })).toBeInTheDocument(); // "substrate is complete"
    expect(notProves.getByText(/are accurate to source/i, { selector: "li" })).toBeInTheDocument(); // "atom contents are accurate to source"
    expect(
      notProves.getByText(/identity-verification step/i, { selector: "li" }),
    ).toBeInTheDocument();
  });

  it("does NOT render during the 'verifying' transient state", async () => {
    // Hold the verifier in a never-resolving promise so the component stays
    // in `verifying` state.
    let resolveVerify!: (v: ReturnType<typeof makePassResult>) => void;
    vi.mocked(verifySnapshot).mockImplementationOnce(
      () => new Promise((res) => (resolveVerify = res)),
    );
    render(<VerifyClient />);
    await dropSnapshot(SNAP_FIXTURE_TEXT);
    // Look for the transient "Verifying" panel which uses a label class that
    // unambiguously identifies it (avoids matching the page's stable copy
    // about verification running in the browser).
    await waitFor(() => {
      expect(
        screen.getByText((_, node) => (node?.textContent ?? "").startsWith("Verifying snap.json")),
      ).toBeInTheDocument();
    });
    // Mid-verify: scope panel must not be rendered yet.
    expect(screen.queryByText("What this proves")).not.toBeInTheDocument();
    expect(screen.queryByText("What this does NOT prove")).not.toBeInTheDocument();
    // Clean up so the test doesn't hang on the pending promise.
    resolveVerify(makePassResult());
  });
});
