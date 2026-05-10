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
  hubAtoms: Array<{
    key: string;
    memberCount: number;
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
  masterRoot: CheckResult;
  auditLogRoot: CheckResult;
  hubAtoms: CheckResult;
  tombstones: CheckResult;
  atomValueBind: CheckResult;
  consistencyProof: CheckResult;
  auditEntries: CheckResult;
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

// Spec §6.4 Check B sub-check 4: tree.masterRoot MUST equal the Merkle root
// over the shard roots, where each shard root is decoded hex → 32-byte buffer
// and used DIRECTLY as a Merkle leaf (no further hashing — see SPEC-SNAPSHOT.md
// §2.6 for the descriptive walkthrough). Until this check existed, a substrate
// emitting an internally-inconsistent masterRoot would still display "all green"
// in this verifier (sprint S-AC-30 closed that gap).
export async function verifyMasterRoot(snap: SnapshotV1): Promise<CheckResult> {
  const expected = snap.tree.masterRoot;
  const shardRootBufs = (snap.tree.shardRoots ?? []).map(fromHex);
  const computed = await rootOfHashes(shardRootBufs);
  const ok = computed === expected;
  return {
    ok,
    expected,
    computed,
    detail: ok
      ? `master root over ${shardRootBufs.length} shard root${shardRootBufs.length === 1 ? '' : 's'} matches`
      : `masterRoot mismatch: stored=${expected.slice(0, 12)}... computed=${computed.slice(0, 12)}...`,
  };
}

// Spec §6.4 Check F — Atom value-bind.
// Per atom, enforce: tombstoned ⇒ value absent, vP=true ⇒ leafHash=SHA-256(utf8(value)),
// vP=false ⇒ value absent. Reject at first violation.
async function verifyAtomValueBind(snap: SnapshotV1): Promise<CheckResult> {
  for (let i = 0; i < snap.atoms.length; i++) {
    const a = snap.atoms[i] as SnapshotV1["atoms"][number] & { value?: string };
    const hasValueField = Object.prototype.hasOwnProperty.call(a, 'value') && a.value !== undefined;
    if (a.tombstoned) {
      if (a.valuePresent) {
        return { ok: false, detail: `atoms[${i}] tombstoned but valuePresent=true (key=${a.key})` };
      }
      if (hasValueField) {
        return { ok: false, detail: `atoms[${i}] tombstoned but value field present (key=${a.key})` };
      }
      continue;
    }
    if (a.valuePresent) {
      if (!hasValueField) {
        return { ok: false, detail: `atoms[${i}] valuePresent=true but value field missing (key=${a.key})` };
      }
      const recomputed = hex(await sha256(new TextEncoder().encode(a.value!)));
      if (recomputed !== a.leafHash) {
        return {
          ok: false,
          detail: `atoms[${i}] leafHash mismatch: stored=${a.leafHash.slice(0, 12)}... computed=${recomputed.slice(0, 12)}... (key=${a.key})`,
        };
      }
      continue;
    }
    if (hasValueField) {
      return { ok: false, detail: `atoms[${i}] valuePresent=false (redacted) but value field present (key=${a.key})` };
    }
  }
  return { ok: true, detail: `${snap.atoms.length} atoms checked; value-bind invariants hold` };
}

// Spec §6.4 Check G — Consistency proof recompute (guarded; only when present).
async function verifyConsistencyProof(snap: SnapshotV1): Promise<CheckResult> {
  const cp = (snap as { consistencyProof?: {
    fromShardRoots: string[]; toShardRoots: string[]; fromRoot: string; toRoot: string;
    fromVersion: number; toVersion: number;
  } }).consistencyProof;
  if (!cp) return { ok: true, absent: true, detail: 'absent — single-version snapshot' };
  if (cp.toShardRoots.length !== snap.tree.shardRoots.length) {
    return { ok: false, detail: `toShardRoots length mismatch: cp=${cp.toShardRoots.length} tree=${snap.tree.shardRoots.length}` };
  }
  for (let i = 0; i < cp.toShardRoots.length; i++) {
    if (cp.toShardRoots[i] !== snap.tree.shardRoots[i]) {
      return { ok: false, detail: `toShardRoots[${i}] mismatch: cp=${cp.toShardRoots[i].slice(0, 12)}... tree=${snap.tree.shardRoots[i].slice(0, 12)}...` };
    }
  }
  if (cp.toRoot !== snap.tree.masterRoot) {
    return { ok: false, detail: `toRoot mismatch: cp=${cp.toRoot.slice(0, 12)}... tree=${snap.tree.masterRoot.slice(0, 12)}...` };
  }
  const fromBufs = cp.fromShardRoots.map(fromHex);
  const recomputedFromRoot = await rootOfHashes(fromBufs);
  if (recomputedFromRoot !== cp.fromRoot) {
    return {
      ok: false,
      detail: `fromRoot mismatch: stored=${cp.fromRoot.slice(0, 12)}... computed=${recomputedFromRoot.slice(0, 12)}...`,
    };
  }
  return { ok: true, detail: `version ${cp.fromVersion} → ${cp.toVersion}; consistency proof verified` };
}

// Spec §6.4 Check H — Audit-entry conformance (guarded; only when auditLogExcerpt present).
// Four sub-checks: shape, window bounds, eventId uniqueness, ordering.
function verifyAuditEntries(snap: SnapshotV1): CheckResult {
  const ale = (snap as { auditLogExcerpt?: {
    windowStartMs: number; windowEndMs: number; entries: Array<Record<string, unknown>>;
  } }).auditLogExcerpt;
  if (!ale || !Array.isArray(ale.entries)) {
    return { ok: true, absent: true, detail: 'absent — no auditLogExcerpt in snapshot' };
  }
  const entries = ale.entries;
  const seenEventIds = new Map<string, number>();
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (typeof e.eventId !== 'string' || (e.eventId as string).length === 0) {
      return { ok: false, detail: `entries[${i}] missing required field eventId` };
    }
    if (typeof e.recordedAtMs !== 'number' || !Number.isInteger(e.recordedAtMs)) {
      return { ok: false, detail: `entries[${i}] missing required field recordedAtMs (integer)` };
    }
    if (typeof e.kind !== 'string' || (e.kind as string).length === 0) {
      return { ok: false, detail: `entries[${i}] missing required field kind` };
    }
    const recordedAtMs = e.recordedAtMs as number;
    if (recordedAtMs < ale.windowStartMs || recordedAtMs >= ale.windowEndMs) {
      return { ok: false, detail: `entries[${i}] recordedAtMs=${recordedAtMs} out of window [${ale.windowStartMs}, ${ale.windowEndMs})` };
    }
    const eventId = e.eventId as string;
    if (seenEventIds.has(eventId)) {
      return { ok: false, detail: `duplicate audit entry eventId at indices ${seenEventIds.get(eventId)} and ${i}` };
    }
    seenEventIds.set(eventId, i);
    if (i > 0) {
      const prev = entries[i - 1];
      const prevAt = prev.recordedAtMs as number;
      if (recordedAtMs < prevAt) {
        return { ok: false, detail: `entries[${i}] out of order: recordedAtMs=${recordedAtMs} < previous=${prevAt}` };
      }
      if (recordedAtMs === prevAt && eventId < (prev.eventId as string)) {
        return { ok: false, detail: `entries[${i}] tie-break violated: eventId=${eventId} < previous=${prev.eventId}` };
      }
    }
  }
  return { ok: true, detail: `${entries.length} entries; shape, window, uniqueness, ordering all valid` };
}

async function verifyAuditLogRoot(snap: SnapshotV1): Promise<CheckResult> {
  // Audit log is OPTIONAL in a snapshot. When absent (operator exported
  // with includeAudit:false, or this is a redacted demo snapshot), the
  // card still renders with a neutral "not present" badge.
  if (!snap.auditLogExcerpt || !snap.tree.auditLogRoot) {
    return {
      ok: true,
      absent: true,
      detail: "No audit log included in this snapshot (includeAudit:false at export, or redacted).",
    };
  }
  // PRE-FREEZE 2026-05-08: auditLogRoot is now a SHA-256 Merkle root over
  // per-entry leaf hashes. Each entry hashes to: SHA-256(canonicalize(entry)).
  // The Merkle tree of those leaf hashes is built with the same algorithm
  // as substrate shard roots (see SPEC §6.5; algorithm in src/merkle.ts).
  //
  // PROPERTY: a verifier holding only a single audit entry plus a log2(N)-
  //           depth audit path can prove inclusion in this snapshot's signed
  //           commitment without holding the entire entries array.
  // CITATION: Laurie et al., RFC 6962 "Certificate Transparency" §2.1
  //           uses the same per-entry-leaf-hash + Merkle-root pattern.
  const entryLeafHashes: Uint8Array[] = [];
  for (const entry of snap.auditLogExcerpt.entries) {
    const canon = canonicalize(entry);
    entryLeafHashes.push(await sha256(canon));
  }
  const computed = await rootOfHashes(entryLeafHashes);
  const expected = snap.tree.auditLogRoot;
  return {
    ok: computed === expected,
    expected,
    computed,
    detail: "Merkle root of SHA-256(canonicalize(entry)) per audit entry",
  };
}

async function verifyHubAtoms(snap: SnapshotV1): Promise<CheckResult> {
  // PRE-FREEZE 2026-05-08: snap.hubAtoms is DERIVED data computed by the
  // substrate's classifyHubAtoms() function from snap.atoms and snap.edges.
  // The Merkle commitment over the snapshot body covers hubAtoms (so a
  // tampered memberCount changes the master root and breaks the signature),
  // BUT a verifier that reads snap.hubAtoms blindly without recomputing is
  // accepting derived data without an integrity check.
  //
  // PROPERTY: tamper any memberCount, the recomputed value won't match.
  // CITATION: classification of hub atoms is defined at SPEC §3.5.
  //           Reference impl: substrate/src/snapshot/exporter.ts
  //           function classifyHubAtoms.
  // ALGO:     identify atoms whose key matches /^v1\.other\.hub_/ and
  //           count incoming member_of edges that target each.
  const HUB_KEY_RE = /^v1\.other\.hub_/;
  const memberCounts = new Map<string, number>();
  for (const a of snap.atoms) {
    if (HUB_KEY_RE.test(a.key)) memberCounts.set(a.key, 0);
  }
  for (const e of snap.edges) {
    if (e.type === "member_of" && memberCounts.has(e.target)) {
      memberCounts.set(e.target, (memberCounts.get(e.target) ?? 0) + 1);
    }
  }
  const recomputed: Array<{ key: string; memberCount: number }> = [];
  for (const [key, memberCount] of memberCounts) {
    recomputed.push({ key, memberCount });
  }
  const claimed = snap.hubAtoms ?? [];
  const claimedCanon = canonicalize(claimed);
  const recomputedCanon = canonicalize(recomputed);
  return {
    ok: claimedCanon === recomputedCanon,
    expected: claimedCanon.slice(0, 64) + (claimedCanon.length > 64 ? "..." : ""),
    computed: recomputedCanon.slice(0, 64) + (recomputedCanon.length > 64 ? "..." : ""),
    detail: `Recomputed ${recomputed.length} hub atoms from atoms+edges (regex + member_of edge counting)`,
  };
}

async function verifyTombstoneInvariants(snap: SnapshotV1): Promise<CheckResult> {
  // PRE-FREEZE 2026-05-08 (SPEC §2.5, gap #8):
  // The all-zero hex string '00'*64 (TOMBSTONE_HASH) is a reserved sentinel.
  // It marks tombstoned positions in the substrate's Merkle tree so other
  // atoms keep their leafIndex stable. Two invariants MUST hold:
  //
  //   I1. atoms[i].tombstoned == true   =>  leafHash == '00'*64
  //   I2. atoms[i].tombstoned == false  =>  leafHash != '00'*64
  //
  // I1 prevents a tombstoned atom from carrying its old SHA-256 (which would
  // let a verifier re-derive the original key from a leaked rainbow-table).
  // I2 prevents an active atom from being mis-identified as tombstoned (or
  // vice versa) at verification time. The reservation is valid even though
  // SHA-256('any string') == '00'*64 has probability 2^-256 -- spec MUST
  // forbid the value rather than rely on collision improbability.
  //
  // CITATION: RFC 6962 §2.1 reserves d_0 = SHA-256(0x00 || leaf) for leaves
  // and d_n = SHA-256(0x01 || left || right) for internals; we don't use
  // domain-separation prefix bytes (see §2.3) so we instead reserve
  // '00'*64 explicitly and forbid it for active leaves.
  const SENTINEL = "0".repeat(64);
  const violations: string[] = [];
  for (const a of snap.atoms) {
    if (a.tombstoned && a.leafHash !== SENTINEL) {
      violations.push(`${a.key}: tombstoned but leafHash != sentinel`);
    }
    if (!a.tombstoned && a.leafHash === SENTINEL) {
      violations.push(`${a.key}: active but leafHash == sentinel`);
    }
  }
  return {
    ok: violations.length === 0,
    detail:
      violations.length === 0
        ? `All ${snap.atoms.length} atoms satisfy tombstone-sentinel invariants (I1, I2)`
        : `${violations.length} violation(s): ${violations.slice(0, 3).join("; ")}${violations.length > 3 ? "..." : ""}`,
  };
}

// Spec §6.4 Check A — JWKS three-case key-resolution. Mirrors
// markov-merkle-memory/scripts/check-substrate-readiness.ts byte-for-byte
// behaviourally. Browser-side: CORS or any non-2xx maps to case (a).
//
//   case (a) — endpoint unreachable → fall back to embedded publicKey
//   case (b) — kid present in JWKS → use JWK.x; reject if revoked or disagrees
//   case (c) — kid absent from a reachable JWKS → REJECT (no fallback)

type JwksFetchOutcome =
  | { kind: 'http'; status: number; body: unknown }
  | { kind: 'transport-error'; reason: string };

type JwksFetcher = (keyUri: string) => Promise<JwksFetchOutcome>;

type KeyResolution =
  | { ok: true; key: CryptoKey; keySource: 'jwks' | 'embedded-fallback-jwks-unreachable'; detail: string }
  | { ok: false; error: string; detail: string };

const JWKS_FETCH_TIMEOUT_MS = 5_000;

async function defaultJwksFetcher(keyUri: string): Promise<JwksFetchOutcome> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), JWKS_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(keyUri, { signal: ctl.signal });
    const text = await res.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* keep raw */ }
    return { kind: 'http', status: res.status, body };
  } catch (e) {
    // CORS, DNS, abort — all map to case (a) per spec §6.4 Check A
    return { kind: 'transport-error', reason: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

async function importEmbeddedKey(b64: string): Promise<CryptoKey> {
  // Spec §3.9: raw 32-byte OR DER SPKI. Discriminator: post-decode length.
  const bytes = fromBase64(b64);
  if (bytes.length === 32) {
    return crypto.subtle.importKey('raw', bytes as BufferSource, 'Ed25519', false, ['verify']);
  }
  return crypto.subtle.importKey('spki', bytes as BufferSource, 'Ed25519', false, ['verify']);
}

async function importJwkKey(xBase64Url: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    { kty: 'OKP', crv: 'Ed25519', x: xBase64Url, ext: true } as JsonWebKey,
    'Ed25519',
    false,
    ['verify'],
  );
}

async function resolveSignatureKey(
  sig: SnapshotV1['signature'],
  fetcher: JwksFetcher = defaultJwksFetcher,
): Promise<KeyResolution> {
  let outcome: JwksFetchOutcome;
  try { outcome = await fetcher(sig.keyUri); }
  catch (e) { outcome = { kind: 'transport-error', reason: e instanceof Error ? e.message : String(e) }; }

  const isCaseA =
    outcome.kind === 'transport-error' ||
    (outcome.kind === 'http' && (outcome.status < 200 || outcome.status >= 300)) ||
    (outcome.kind === 'http' && (outcome.body === null || typeof outcome.body !== 'object'));

  if (isCaseA) {
    try {
      const key = await importEmbeddedKey(sig.publicKey);
      const reason =
        outcome.kind === 'transport-error' ? `transport: ${outcome.reason}` :
        outcome.kind === 'http' && (outcome.status < 200 || outcome.status >= 300) ? `HTTP ${outcome.status}` :
        'JWKS body not parseable';
      return {
        ok: true, key,
        keySource: 'embedded-fallback-jwks-unreachable',
        detail: `JWKS unreachable (${reason}); fell back to embedded publicKey (kid=${sig.kid})`,
      };
    } catch (e) {
      return { ok: false, error: 'embedded publicKey unparseable', detail: e instanceof Error ? e.message : String(e) };
    }
  }

  const httpOutcome = outcome as { kind: 'http'; status: number; body: unknown };
  const jwks = httpOutcome.body as { keys?: Array<{ kid?: string; x?: string; revoked?: boolean }> } | null;
  if (!jwks || !Array.isArray(jwks.keys)) {
    try {
      const key = await importEmbeddedKey(sig.publicKey);
      return {
        ok: true, key,
        keySource: 'embedded-fallback-jwks-unreachable',
        detail: `JWKS body not a JWKS document; fell back to embedded (kid=${sig.kid})`,
      };
    } catch (e) {
      return { ok: false, error: 'JWKS malformed AND embedded unparseable', detail: e instanceof Error ? e.message : String(e) };
    }
  }

  const jwk = jwks.keys.find((k) => k.kid === sig.kid);
  if (!jwk) {
    return {
      ok: false,
      error: 'kid not in JWKS',
      detail: `kid=${sig.kid} absent from JWKS at ${sig.keyUri}; ${jwks.keys.length} key(s) present, none matching`,
    };
  }
  if (jwk.revoked === true) {
    return { ok: false, error: 'key revoked in JWKS', detail: `JWK kid=${sig.kid} carries revoked:true` };
  }
  if (typeof jwk.x !== 'string') {
    return { ok: false, error: 'JWK missing x field', detail: `JWK kid=${sig.kid} has no x` };
  }

  let jwkKey: CryptoKey;
  try { jwkKey = await importJwkKey(jwk.x); }
  catch (e) { return { ok: false, error: 'JWK parse failed', detail: e instanceof Error ? e.message : String(e) }; }

  // Cross-source disagreement check
  if (sig.publicKey && sig.publicKey.length > 0) {
    try {
      const xBytes = fromBase64Url(jwk.x);
      const embeddedBytes = fromBase64(sig.publicKey);
      const embeddedRawBytes = embeddedBytes.length === 32
        ? embeddedBytes
        : embeddedBytes.subarray(embeddedBytes.length - 32);
      if (!equalBytes(embeddedRawBytes, xBytes)) {
        return {
          ok: false,
          error: 'key disagreement',
          detail: `snapshot.publicKey raw bytes != JWK.x raw bytes (kid=${sig.kid})`,
        };
      }
    } catch {
      // Embedded couldn't be parsed; ignore disagreement check
    }
  }

  return {
    ok: true, key: jwkKey,
    keySource: 'jwks',
    detail: `resolved via JWKS (kid=${sig.kid}; ${jwks.keys.length} key(s) total)`,
  };
}

function fromBase64Url(s: string): Uint8Array {
  const padded = s + '='.repeat((4 - s.length % 4) % 4);
  const std = padded.replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(std);
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
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

  // §6.4 Check A: three-case key resolution (JWKS or embedded fallback).
  const keyRes = await resolveSignatureKey(snap.signature);
  if (!keyRes.ok) {
    return { ok: false, detail: `${keyRes.error}: ${keyRes.detail}` };
  }
  const ok = await crypto.subtle.verify(
    'Ed25519', keyRes.key, sig as BufferSource, message as BufferSource,
  );
  return {
    ok,
    detail: ok
      ? `Ed25519 valid (kid=${snap.signature.kid}; keySource=${keyRes.keySource})`
      : `Ed25519 verification FAILED — signature does not match canonicalized snapshot (kid=${snap.signature.kid}; keySource=${keyRes.keySource})`,
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

  const [signature, edgesRoot, shardRoots, masterRoot, auditLogRoot, hubAtoms, tombstones, atomValueBind, consistencyProof] = await Promise.all([
    verifySignature(snap).catch((err) => ({
      ok: false,
      detail: `Signature check threw: ${err instanceof Error ? err.message : String(err)}`,
    })),
    verifyEdgesRoot(snap),
    verifyShardRoots(snap),
    verifyMasterRoot(snap),
    verifyAuditLogRoot(snap),
    verifyHubAtoms(snap),
    verifyTombstoneInvariants(snap),
    verifyAtomValueBind(snap),
    verifyConsistencyProof(snap),
  ]);
  // Sync check (no async work); kept outside Promise.all for readability.
  const auditEntries = verifyAuditEntries(snap);

  const overallOk =
    formatVersion.ok &&
    signature.ok &&
    edgesRoot.ok &&
    shardRoots.ok &&
    masterRoot.ok &&
    auditLogRoot.ok &&
    hubAtoms.ok &&
    tombstones.ok &&
    atomValueBind.ok &&
    consistencyProof.ok &&
    auditEntries.ok;

  const failed: string[] = [];
  if (!formatVersion.ok) failed.push("formatVersion");
  if (!signature.ok) failed.push("signature");
  if (!edgesRoot.ok) failed.push("edgesRoot");
  if (!shardRoots.ok) failed.push("shardRoots");
  if (!masterRoot.ok) failed.push("masterRoot");
  if (!auditLogRoot.ok) failed.push("auditLogRoot");
  if (!hubAtoms.ok) failed.push("hubAtoms");
  if (!tombstones.ok) failed.push("tombstones");
  if (!atomValueBind.ok) failed.push("atomValueBind");
  if (!consistencyProof.ok) failed.push("consistencyProof");
  if (!auditEntries.ok) failed.push("auditEntries");

  const summary = overallOk
    ? `Verified: ${snap.atoms.length} atoms, ${snap.edges.length} edges, master root ${snap.tree.masterRoot.slice(0, 12)}... -- all checks passed.`
    : `FAILED: ${failed.join(", ")} did not pass.`;

  return {
    overallOk,
    formatVersion,
    signature,
    edgesRoot,
    shardRoots,
    masterRoot,
    auditLogRoot,
    hubAtoms,
    tombstones,
    atomValueBind,
    consistencyProof,
    auditEntries,
    summary,
  };
}
