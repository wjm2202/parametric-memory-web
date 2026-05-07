// =============================================================================
// /verify -- pure browser verifier for MMPM SnapshotV1 artifacts.
// =============================================================================
// Self-contained: no Node deps, no third-party libs, no API calls. Runs
// entirely in the browser using WebCrypto SubtleCrypto for SHA-256 + Ed25519.
//
// MIRRORS THE SUBSTRATE'S WIRE-FORMAT EXACTLY -- see:
//   - markov-merkle-memory/src/canonical/jcs.ts        (RFC 8785 canonicalize)
//   - markov-merkle-memory/src/merkle.ts                (Merkle algorithm)
//   - markov-merkle-memory/src/snapshot/exporter.ts     (signing flow)
//
// When S2 (Node verifier CLI) starts, this file gets factored into a shared
// package consumed by both /verify and the CLI. For now it lives inline so
// we can iterate fast.
// =============================================================================

// --- Types (subset of SnapshotV1 we actually verify) -------------------------

export interface SnapshotV1 {
  formatVersion: string;
  formatUri: string;
  exporter: {
    name: string;
    version: string;
    host: string;
    exportedAtMs: number;
    exportedAtIso: string;
  };
  tree: {
    treeVersion: number;
    masterRoot: string;
    shardCount: number;
    shardRoots: string[];
    shardLeafCounts: number[];
    atomCount: number;
    edgesRoot: string;
    auditLogRoot?: string;
  };
  atoms: Array<{
    key: string;
    type: string;
    shardId: number;
    leafIndex: number;
    leafHash: string;
    tombstoned: boolean;
    valuePresent: boolean;
    value?: string;
  }>;
  edges: Array<{
    source: string;
    target: string;
    type: string;
    confidence: number;
    createdAtMs: number;
    createdBy: string;
  }>;
  auditLogExcerpt?: {
    windowStartMs: number;
    windowEndMs: number;
    totalRecorded: number;
    entries: Array<Record<string, unknown>>;
  };
  signature: {
    alg: "Ed25519";
    kid: string;
    publicKey: string; // base64
    publicKeyFingerprint: string;
    keyUri: string;
    sig: string; // base64
  };
}

export interface CheckResult {
  ok: boolean;
  expected?: string;
  computed?: string;
  detail?: string;
  /** true when the data needed to verify this check is not present in the
        snapshot (e.g. auditLogRoot when includeAudit:false was set at export
        time). overallOk treats absent as a pass; the UI renders a neutral
        "not present in this snapshot" badge instead of green PASS or red FAIL. */
  absent?: boolean;
}

export interface VerifyResult {
  overallOk: boolean;
  formatVersion: CheckResult;
  signature: CheckResult;
  edgesRoot: CheckResult;
  shardRoots: { ok: boolean; perShard: Array<CheckResult & { shardId: number }> };
  auditLogRoot: CheckResult;
  summary: string;
}

// --- RFC 8785 canonicalize (mirrors src/canonical/jcs.ts) --------------------

export function canonicalize(value: unknown): string {
  return serialize(value);
}

function serialize(v: unknown): string {
  if (v === null) return "null";
  switch (typeof v) {
    case "boolean":
      return v ? "true" : "false";
    case "number":
      return serializeNumber(v);
    case "string":
      return serializeString(v);
    case "object":
      if (Array.isArray(v)) return serializeArray(v);
      return serializeObject(v as Record<string, unknown>);
    default:
      throw new TypeError(`JCS: unsupported value of type ${typeof v}`);
  }
}

function serializeNumber(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError(`JCS: non-finite number not allowed: ${n}`);
  if (Object.is(n, -0)) return "0";
  return n.toString();
}

function serializeString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) out += '\\"';
    else if (c === 0x5c) out += "\\\\";
    else if (c === 0x08) out += "\\b";
    else if (c === 0x09) out += "\\t";
    else if (c === 0x0a) out += "\\n";
    else if (c === 0x0c) out += "\\f";
    else if (c === 0x0d) out += "\\r";
    else if (c < 0x20) out += "\\u" + c.toString(16).padStart(4, "0");
    else out += s[i];
  }
  return out + '"';
}

function serializeArray(arr: unknown[]): string {
  if (arr.length === 0) return "[]";
  const parts = new Array<string>(arr.length);
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === undefined) throw new TypeError(`JCS: undefined at array index ${i}`);
    parts[i] = serialize(arr[i]);
  }
  return "[" + parts.join(",") + "]";
}

function serializeObject(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  if (keys.length === 0) return "{}";
  const parts = new Array<string>(keys.length);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (obj[k] === undefined) throw new TypeError(`JCS: undefined at key '${k}'`);
    parts[i] = serializeString(k) + ":" + serialize(obj[k]);
  }
  return "{" + parts.join(",") + "}";
}

// --- Hex/base64 helpers ------------------------------------------------------

function hex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}

function fromHex(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256(bytes: Uint8Array | string): Promise<Uint8Array> {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  // SubtleCrypto returns ArrayBuffer; wrap in Uint8Array for indexed access.
  const buf = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return new Uint8Array(buf);
}

// --- Merkle root (mirrors MerkleKernel.rootOfHashes) -------------------------
//
// Algorithm: empty -> 64 zero hex chars; 1 leaf -> the leaf hex unmodified;
// odd > 1 -> duplicate last; pair hash = SHA-256(left || right) with NO
// RFC 6962 prefix byte. See the wire-format block comment in
// markov-merkle-memory/src/merkle.ts for the canonical statement.

async function parentLayer(layer: Uint8Array[]): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for (let i = 0; i < layer.length; i += 2) {
    const left = layer[i];
    const right = i + 1 < layer.length ? layer[i + 1] : layer[i];
    const concat = new Uint8Array(left.length + right.length);
    concat.set(left, 0);
    concat.set(right, left.length);
    out.push(await sha256(concat));
  }
  return out;
}

async function rootOfHashes(leaves: Uint8Array[]): Promise<string> {
  if (leaves.length === 0) return "0".repeat(64);
  let layer = leaves;
  while (layer.length > 1) layer = await parentLayer(layer);
  return hex(layer[0]);
}

// --- Per-check verifiers -----------------------------------------------------

async function verifyEdgesRoot(snap: SnapshotV1): Promise<CheckResult> {
  const canon = canonicalize(snap.edges);
  const computed = hex(await sha256(canon));
  const expected = snap.tree.edgesRoot;
  return {
    ok: computed === expected,
    expected,
    computed,
    detail: "SHA-256 of canonicalize(edges)",
  };
}

async function verifyShardRoots(snap: SnapshotV1): Promise<VerifyResult["shardRoots"]> {
  const expectedRoots = snap.tree.shardRoots ?? [];
  const perShard: Array<CheckResult & { shardId: number }> = [];

  // Group leafHashes by shard, in leafIndex order.
  const byShard = new Map<number, Array<{ leafIndex: number; leafHash: string }>>();
  for (const a of snap.atoms) {
    const arr = byShard.get(a.shardId) ?? [];
    arr.push({ leafIndex: a.leafIndex, leafHash: a.leafHash });
    byShard.set(a.shardId, arr);
  }

  let allOk = true;
  for (let shardId = 0; shardId < expectedRoots.length; shardId++) {
    const arr = (byShard.get(shardId) ?? []).slice().sort((a, b) => a.leafIndex - b.leafIndex);
    const leafBufs = arr.map((l) => fromHex(l.leafHash));
    const computed = await rootOfHashes(leafBufs);
    const expected = expectedRoots[shardId];
    const ok = computed === expected;
    perShard.push({ shardId, ok, expected, computed });
    if (!ok) allOk = false;
  }
  return { ok: allOk, perShard };
}

async function verifyAuditLogRoot(snap: SnapshotV1): Promise<CheckResult> {
  // Audit log is OPTIONAL in a snapshot. When absent (operator exported
  // with includeAudit:false, or this is a redacted demo snapshot), we
  // still render the check card -- just with a neutral "not present"
  // badge instead of hiding it. Hiding would make verifiers wonder if
  // the check was silently skipped.
  if (!snap.auditLogExcerpt || !snap.tree.auditLogRoot) {
    return {
      ok: true,
      absent: true,
      detail: "No audit log included in this snapshot (includeAudit:false at export, or redacted).",
    };
  }
  // Substrate computes auditLogRoot as SHA-256(canonicalize(entries)) per
  // exporter.ts. NOT a Merkle tree -- single-shot canonical hash.
  const canon = canonicalize(snap.auditLogExcerpt.entries);
  const computed = hex(await sha256(canon));
  const expected = snap.tree.auditLogRoot;
  return {
    ok: computed === expected,
    expected,
    computed,
    detail: "SHA-256 of canonicalize(auditLogExcerpt.entries)",
  };
}

async function verifySignature(snap: SnapshotV1): Promise<CheckResult> {
  // =========================================================================
  // Reconstruct the SIGNED PAYLOAD = header + tree + signature minus sig.
  // Atoms, edges, hubAtoms, consistencyProof, auditLogExcerpt are NOT signed
  // -- they are committed to via tree.shardRoots / tree.edgesRoot /
  // tree.auditLogRoot, which the parallel root-recompute checks below verify.
  //
  // This is the same Merkle commitment pattern Bitcoin uses (sign the block
  // header that commits to the txn merkle root), Git uses (commit object
  // signs over the tree object), and Certificate Transparency uses (sign
  // the log head that commits to all entries).
  //
  // Constant signed payload size (~500 bytes) means substrate scale does
  // not affect signing or verification cost.
  // =========================================================================
  const signedPayload = {
    formatVersion: snap.formatVersion,
    formatUri: snap.formatUri,
    exporter: snap.exporter,
    tree: snap.tree,
    signature: {
      alg: snap.signature.alg,
      kid: snap.signature.kid,
      publicKey: snap.signature.publicKey,
      publicKeyFingerprint: snap.signature.publicKeyFingerprint,
      keyUri: snap.signature.keyUri,
      // signature.sig is what we are verifying; deliberately excluded.
    },
  };
  const message = new TextEncoder().encode(canonicalize(signedPayload));
  const sig = fromBase64(snap.signature.sig);
  const pkBytes = fromBase64(snap.signature.publicKey);

  // Vault Transit may return a 32-byte raw key OR a DER-encoded SPKI (44+ bytes).
  // Try raw first; fall back to SPKI if WebCrypto rejects the format.
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey("raw", pkBytes as BufferSource, "Ed25519", false, [
      "verify",
    ]);
  } catch {
    key = await crypto.subtle.importKey("spki", pkBytes as BufferSource, "Ed25519", false, [
      "verify",
    ]);
  }
  const ok = await crypto.subtle.verify(
    "Ed25519",
    key,
    sig as BufferSource,
    message as BufferSource,
  );
  return {
    ok,
    detail: ok
      ? `Ed25519 valid (kid=${snap.signature.kid})`
      : `Ed25519 verification FAILED -- signature does not match canonicalized snapshot`,
  };
}

// --- Top-level verifier ------------------------------------------------------

export async function verifySnapshot(snap: SnapshotV1): Promise<VerifyResult> {
  const formatVersion: CheckResult = {
    ok: snap.formatVersion === "1.0.0",
    expected: "1.0.0",
    computed: snap.formatVersion,
    detail: "Snapshot format version compatibility",
  };

  const [signature, edgesRoot, shardRoots, auditLogRoot] = await Promise.all([
    verifySignature(snap).catch((err) => ({
      ok: false,
      detail: `Signature check threw: ${err instanceof Error ? err.message : String(err)}`,
    })),
    verifyEdgesRoot(snap),
    verifyShardRoots(snap),
    verifyAuditLogRoot(snap),
  ]);

  const overallOk =
    formatVersion.ok && signature.ok && edgesRoot.ok && shardRoots.ok && auditLogRoot.ok;

  const failed: string[] = [];
  if (!formatVersion.ok) failed.push("formatVersion");
  if (!signature.ok) failed.push("signature");
  if (!edgesRoot.ok) failed.push("edgesRoot");
  if (!shardRoots.ok) failed.push("shardRoots");
  if (!auditLogRoot.ok) failed.push("auditLogRoot");

  const summary = overallOk
    ? `Verified: ${snap.atoms.length} atoms, ${snap.edges.length} edges, master root ${snap.tree.masterRoot.slice(0, 12)}... -- all checks passed.`
    : `FAILED: ${failed.join(", ")} did not pass.`;

  return { overallOk, formatVersion, signature, edgesRoot, shardRoots, auditLogRoot, summary };
}
