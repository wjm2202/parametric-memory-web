/**
 * Tests for V1.2 — PublicKeysPanel (inline, anchored to verified file).
 *
 * Covers:
 *   1. Panel does NOT render before verify.
 *   2. Panel renders the JWKS URL from snap.signature.keyUri (anchored to the
 *      file the user just dropped).
 *   3. The full publicKey fingerprint is rendered (no `…` truncation).
 *   4. The kid is rendered inside the panel.
 *   5. A copy-pasteable `curl … | jq …` one-liner is present in a <pre>.
 *   6. The JWKS URL link uses href={keyUri}, target=_blank, and rel includes
 *      both `noopener` and `noreferrer`.
 *   7. Different snapshots produce different URLs/kids in the panel — panel
 *      content is driven by the verified file, not a hardcoded constant.
 *
 * All queries are scoped via within(panel) where ambiguity is possible — kid,
 * fingerprint, and URL also appear elsewhere on the rendered page (SnapshotMeta,
 * curl <pre>), so the panel-anchored versions must be queried via their own
 * subtree.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import VerifyClient, { fingerprintFromJwkX } from "./VerifyClient";

vi.mock("./verifier", async () => {
  const actual = await vi.importActual<typeof import("./verifier")>("./verifier");
  return { ...actual, verifySnapshot: vi.fn() };
});
import { verifySnapshot } from "./verifier";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const FULL_FINGERPRINT =
  "8d:20:7c:72:72:1f:8c:1a:a2:40:f7:9b:50:91:4a:d3:0b:44:ac:5e:8c:d2:4d:b0:35:4f:52:3e:c7:8d:09:5f";
const DEFAULT_KEY_URI = "https://parametric-memory.dev/.well-known/jwks.json";
const DEFAULT_KID = "mmpm-snapshot-signing-v1";

function makeFixture(overrides?: { keyUri?: string; kid?: string; fingerprint?: string }): string {
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
      kid: overrides?.kid ?? DEFAULT_KID,
      publicKey: "AAAA",
      publicKeyFingerprint: overrides?.fingerprint ?? FULL_FINGERPRINT,
      keyUri: overrides?.keyUri ?? DEFAULT_KEY_URI,
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

// ── Mocks + helpers ──────────────────────────────────────────────────────────

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, text: () => Promise.resolve(makeFixture()) }),
  ) as unknown as typeof fetch;
});
afterEach(() => vi.restoreAllMocks());

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

/**
 * Resolves to the rendered PublicKeysPanel container, scoped via the panel's
 * unique heading text. All in-panel assertions go through within(panel) so
 * the kid/fingerprint/URL that ALSO appear elsewhere on the page (SnapshotMeta
 * dd values, curl <pre>) don't pollute these checks.
 */
async function getPanel(): Promise<HTMLElement> {
  const heading = await screen.findByText("Public keys published independently");
  // Walk up to the outermost panel container (`<div class="rounded-xl border …">`).
  // The heading is nested two levels inside: heading -> flex container -> panel root.
  const panel = heading.closest("div.rounded-xl");
  if (!panel) throw new Error("Could not locate PublicKeysPanel root container");
  return panel as HTMLElement;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("V1.2 — PublicKeysPanel (inline, post-verify)", () => {
  it("does NOT render before verify", () => {
    render(<VerifyClient />);
    expect(screen.queryByText("Public keys published independently")).not.toBeInTheDocument();
  });

  it("renders the JWKS URL from the snapshot's signature.keyUri", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(makeFixture());
    const panel = await getPanel();
    // The URL is rendered both as the anchor's visible text AND as its href.
    // We assert via the link element so we don't confuse it with the same URL
    // appearing inside the curl <pre>.
    const link = within(panel).getByRole("link", { name: DEFAULT_KEY_URI });
    expect(link).toHaveAttribute("href", DEFAULT_KEY_URI);
  });

  it("renders the full publicKey fingerprint (no `…` truncation)", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(makeFixture());
    const panel = await getPanel();
    // selector: "span" — the fingerprint is rendered as a <span> inside the
    // panel's metadata block. Ancestor containers (the panel root, the
    // metadata wrapper div) also contain this string in their textContent, so
    // without a tag restriction getByText would match multiple elements.
    expect(within(panel).getByText(FULL_FINGERPRINT, { selector: "span" })).toBeInTheDocument();
    // No ellipsis variant of the fingerprint exists IN THE PUBLIC KEYS PANEL.
    // (V2.2 wraps SnapshotMeta's fingerprint Row in a HashWithCopy which
    // truncates by default — that ellipsis is correct elsewhere, just not
    // here. The trust signal in this panel is the full hex, visible without
    // a click.)
    expect(within(panel).queryByText(/^8d:20:7c:72:72.*…/)).not.toBeInTheDocument();
  });

  it("renders the kid inside the panel", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(makeFixture());
    const panel = await getPanel();
    // selector: "span" — same rationale as fingerprint. The curl <pre> also
    // contains the kid (quoted), but pre is excluded by selector="span".
    expect(within(panel).getByText(DEFAULT_KID, { selector: "span" })).toBeInTheDocument();
  });

  it("includes a copy-pasteable curl one-liner in a <pre> block", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(makeFixture());
    const panel = await getPanel();
    const pre = within(panel).getByText(/curl -fsS/);
    expect(pre.tagName.toLowerCase()).toBe("pre");
    expect(pre.textContent).toContain(DEFAULT_KEY_URI);
    expect(pre.textContent).toContain(`"${DEFAULT_KID}"`);
    expect(pre.textContent).toContain("jq");
  });

  it("the JWKS link opens in a new tab with rel=noopener noreferrer", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(makeFixture());
    const panel = await getPanel();
    const link = within(panel).getByRole("link", { name: DEFAULT_KEY_URI });
    expect(link).toHaveAttribute("href", DEFAULT_KEY_URI);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  });

  it("renders different URLs / kids when the snapshot points elsewhere", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    render(<VerifyClient />);
    await dropSnapshot(
      makeFixture({
        keyUri: "https://keys.example.com/.well-known/jwks.json",
        kid: "custom-signing-key-v7",
      }),
    );
    const panel = await getPanel();
    // The panel's own copies of URL and kid track the overrides — scoped via
    // within(panel) so we never accidentally pass by matching SnapshotMeta.
    expect(
      within(panel).getByRole("link", {
        name: "https://keys.example.com/.well-known/jwks.json",
      }),
    ).toHaveAttribute("href", "https://keys.example.com/.well-known/jwks.json");
    expect(
      within(panel).getByText("custom-signing-key-v7", { selector: "span" }),
    ).toBeInTheDocument();

    // The curl one-liner inside the panel reflects both overrides:
    const pre = within(panel).getByText(/curl -fsS/);
    expect(pre.textContent).toContain("https://keys.example.com/.well-known/jwks.json");
    expect(pre.textContent).toContain('"custom-signing-key-v7"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// V1.3 — Fetch JWKS now button (inside PublicKeysPanel)
//
// Covers four state transitions of the in-page JWKS verifier:
//   1. match    — JWKS publishes a key with the snapshot's kid whose raw
//                 SHA-256 fingerprint EQUALS the embedded fingerprint.
//   2. mismatch — JWKS publishes a key with the snapshot's kid whose raw
//                 SHA-256 fingerprint does NOT equal the embedded fingerprint
//                 (the security-critical case: rejecting a swapped key).
//   3. kid not found — JWKS reachable but doesn't contain the snapshot's kid.
//   4. fetch error — JWKS unreachable (network / 5xx / CORS).
//
// All four use a real crypto.subtle.digest (Node 20+ exposes WebCrypto on
// globalThis.crypto, which jsdom passes through). Fingerprint comparison is
// the security primitive; mocking the SHA-256 would invalidate the test.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The canonical demo key — x is the base64url of the 32-byte Ed25519 public
 * key whose SHA-256 fingerprint is the FULL_FINGERPRINT constant above.
 * Mirrors the actual key in public/.well-known/jwks.json so the test fixture
 * is byte-equal to what production publishes.
 */
const REAL_X_BASE64URL = "-ABAfQGCc9rlstNujpDBdICYMlUPp4FhvzeLwdJpbvI";

/**
 * A different 32-byte key (all zeros except first byte). Its SHA-256
 * fingerprint will NOT equal FULL_FINGERPRINT — used for the mismatch test.
 */
const DIFFERENT_X_BASE64URL = "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function jwksDoc(opts?: { kid?: string; x?: string; extraKeys?: Array<unknown> }) {
  return {
    keys: [
      ...(opts?.extraKeys ?? []),
      {
        kid: opts?.kid ?? DEFAULT_KID,
        kty: "OKP",
        crv: "Ed25519",
        alg: "Ed25519",
        use: "sig",
        x: opts?.x ?? REAL_X_BASE64URL,
      },
    ],
  };
}

/**
 * Override fetch with a queue of responses. First call returns the snapshot
 * fixture (consumed by demoMeta loader on mount). Subsequent calls return
 * the supplied JWKS document for the Fetch JWKS button click. Errors are
 * supplied as Error instances and rejected.
 */
function queueFetches(...responses: Array<{ json?: unknown; text?: string; reject?: Error }>) {
  let i = 0;
  global.fetch = vi.fn(() => {
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (r.reject) return Promise.reject(r.reject);
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(r.json),
      text: () => Promise.resolve(r.text ?? JSON.stringify(r.json)),
    }) as unknown as Promise<Response>;
  }) as unknown as typeof fetch;
}

describe("V1.3 — Fetch JWKS button (inside PublicKeysPanel)", () => {
  it("idle: button visible, no result rendered", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    queueFetches({ text: makeFixture() }, { json: jwksDoc() });
    render(<VerifyClient />);
    await dropSnapshot(makeFixture());
    const panel = await getPanel();
    expect(within(panel).getByTestId("verify-fetch-jwks")).toHaveTextContent(/fetch jwks now/i);
    expect(within(panel).queryByTestId("verify-jwks-result-match")).not.toBeInTheDocument();
    expect(within(panel).queryByTestId("verify-jwks-result-mismatch")).not.toBeInTheDocument();
    expect(within(panel).queryByTestId("verify-jwks-result-error")).not.toBeInTheDocument();
  });

  it("match: JWKS key fingerprint equals embedded fingerprint → green panel", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    queueFetches({ text: makeFixture() }, { json: jwksDoc() });
    render(<VerifyClient />);
    await dropSnapshot(makeFixture());
    const panel = await getPanel();
    fireEvent.click(within(panel).getByTestId("verify-fetch-jwks"));
    const result = await within(panel).findByTestId("verify-jwks-result-match");
    expect(result).toHaveTextContent(/Published key matches embedded key/i);
    // Both fingerprints rendered, both equal to FULL_FINGERPRINT.
    expect(result.textContent).toContain(FULL_FINGERPRINT);
  });

  it("mismatch: JWKS publishes different key under same kid → red panel", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    queueFetches({ text: makeFixture() }, { json: jwksDoc({ x: DIFFERENT_X_BASE64URL }) });
    render(<VerifyClient />);
    await dropSnapshot(makeFixture());
    const panel = await getPanel();
    fireEvent.click(within(panel).getByTestId("verify-fetch-jwks"));
    const result = await within(panel).findByTestId("verify-jwks-result-mismatch");
    expect(result).toHaveTextContent(/MISMATCH/i);
    // The embedded fingerprint is shown, and so is the published one — they
    // differ, which is the entire point of the check.
    expect(result.textContent).toContain(FULL_FINGERPRINT);
    expect(result).toHaveTextContent(/publishes a different key/i);
  });

  it("kid not found: JWKS reachable but lacks the snapshot's kid → red panel", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    queueFetches(
      { text: makeFixture() },
      {
        json: jwksDoc({
          // No matching kid — just other unrelated keys.
          kid: "some-other-key",
          extraKeys: [{ kid: "yet-another", x: DIFFERENT_X_BASE64URL }],
        }),
      },
    );
    // makeFixture defaults to DEFAULT_KID which is NOT in the jwks above.
    render(<VerifyClient />);
    await dropSnapshot(makeFixture());
    const panel = await getPanel();
    fireEvent.click(within(panel).getByTestId("verify-fetch-jwks"));
    const result = await within(panel).findByTestId("verify-jwks-result-mismatch");
    expect(result).toHaveTextContent(/MISMATCH/i);
    expect(result).toHaveTextContent(/NOT present in the\s+JWKS document/i);
  });

  it("fetch error: surfaces the error and keeps signature trust narrative honest", async () => {
    vi.mocked(verifySnapshot).mockResolvedValueOnce(makePassResult());
    queueFetches({ text: makeFixture() }, { reject: new Error("Failed to fetch") });
    render(<VerifyClient />);
    await dropSnapshot(makeFixture());
    const panel = await getPanel();
    fireEvent.click(within(panel).getByTestId("verify-fetch-jwks"));
    const result = await within(panel).findByTestId("verify-jwks-result-error");
    expect(result).toHaveTextContent(/JWKS fetch failed/i);
    expect(result).toHaveTextContent(/Failed to fetch/);
    // Crucially the error panel still tells the reader the embedded-key path
    // is structurally safe — we don't fearmonger when CORS hiccups happen.
    expect(result).toHaveTextContent(/embedded key.*covered by the signature/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// V1.3 — fingerprintFromJwkX pure-function tests
//
// The fingerprint algorithm is the security primitive — must match the
// substrate's construction byte-for-byte. Two checks:
//   1. A known-good x (the canonical demo key) produces the expected
//      FULL_FINGERPRINT.
//   2. A different x produces a different fingerprint (sanity).
// ─────────────────────────────────────────────────────────────────────────────

describe("V1.3 — fingerprintFromJwkX (pure)", () => {
  it("computes the canonical demo fingerprint from the canonical demo x", async () => {
    const fp = await fingerprintFromJwkX(REAL_X_BASE64URL);
    expect(fp).toBe(FULL_FINGERPRINT);
  });

  it("produces a different fingerprint for a different key", async () => {
    const fp = await fingerprintFromJwkX(DIFFERENT_X_BASE64URL);
    expect(fp).not.toBe(FULL_FINGERPRINT);
    // Sanity: it's still a valid colon-separated 32-byte hex string.
    expect(fp).toMatch(/^[0-9a-f]{2}(:[0-9a-f]{2}){31}$/);
  });

  it("handles base64url with and without padding identically", async () => {
    // base64url stripping of padding is well-defined; the helper restores it.
    // For a 32-byte input, base64 encodes to 44 chars including 1-2 `=` pads;
    // base64url strips them. Both forms must give the same fingerprint.
    const unpadded = REAL_X_BASE64URL;
    const padded = unpadded + "=".repeat((4 - (unpadded.length % 4)) % 4);
    const fpA = await fingerprintFromJwkX(unpadded);
    const fpB = await fingerprintFromJwkX(padded);
    expect(fpA).toBe(fpB);
  });
});
