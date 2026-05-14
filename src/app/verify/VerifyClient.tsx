"use client";

import { useCallback, useEffect, useState } from "react";
import { verifySnapshot, type SnapshotV1, type VerifyResult } from "./verifier";

const DEMO_URL = "/demo-snapshots/mmpm-research-snap.json";

/**
 * Metadata read from the live demo file at component mount. Drives the
 * download button label and the confirm-dialog copy so neither can drift
 * from the file actually served. Null until the fetch completes (or if it
 * fails — in which case the UI falls back to generic copy).
 */
type DemoMeta = {
  bytes: number;
  atomCount: number;
  shardCount: number;
  exporterHost: string;
  exportedAtIso: string;
  exporterVersion: string;
  redacted: boolean;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type State =
  | { kind: "idle" }
  | { kind: "fetching" }
  | { kind: "verifying"; filename: string }
  | { kind: "done"; filename: string; result: VerifyResult; rawSnap: SnapshotV1 }
  | { kind: "error"; filename: string; message: string };

// ─────────────────────────────────────────────────────────────────────────────
// V2.1 — Tamper demo state
//
// After a successful verify, the user can mutate the snapshot in a controlled
// way and watch the verifier re-run and FAIL on the right check. Proof-by-
// demonstration that tamper detection is real, not claimed. Three modes:
//   - flip-master-bit: flip a single bit in tree.masterRoot. Both
//     `masterRoot` (computed from shardRoots doesn't match tampered root) AND
//     `signature` (signed payload covers tree.masterRoot) fail.
//   - mutate-atom-leafhash: flip a bit in atoms[0].leafHash. The recomputed
//     shard root for that atom's shard differs from the snapshot's stored
//     shardRoot — `shardRoots` fails. Also cascades: masterRoot computed
//     over shardRoots is unchanged (shardRoots themselves are the stored
//     values, not recomputed from atoms here) so masterRoot still passes,
//     making the failure surgically scoped to one check.
//   - drop-audit-entry: remove auditLogExcerpt.entries[0]. The recomputed
//     auditLogRoot differs from the stored value — `auditLogRoot` fails.
//
// State is HELD INDEPENDENTLY from `state.rawSnap`. We deep-clone before
// mutation so no tamper ever bleeds into the original. Reset on any new
// file drop.
// ─────────────────────────────────────────────────────────────────────────────

export type TamperMode = "flip-master-bit" | "mutate-atom-leafhash" | "drop-audit-entry";

type TamperState =
  | { kind: "off" }
  | {
      kind: "active";
      mode: TamperMode;
      result: VerifyResult;
      snap: SnapshotV1;
    };

const TAMPER_MODE_LABELS: Record<TamperMode, string> = {
  "flip-master-bit": "1-bit flip in masterRoot",
  "mutate-atom-leafhash": "mutated leaf hash on atoms[0]",
  "drop-audit-entry": "dropped first audit-log entry",
};

const TAMPER_MODE_EXPECTED_FAILS: Record<TamperMode, string> = {
  "flip-master-bit": "masterRoot + Ed25519 signature",
  "mutate-atom-leafhash": "shardRoots (the shard containing atoms[0])",
  "drop-audit-entry": "auditLogRoot",
};

/** Deep-clone a snapshot via structured cloning. SnapshotV1 is plain JSON
 * (no functions, no circular refs) so this is safe + fast. */
function cloneSnap(snap: SnapshotV1): SnapshotV1 {
  return structuredClone(snap);
}

/** Flip the high bit of a hex string's first nibble.  Returns the same
 * length, guaranteed-different value. Bails on empty / non-hex. */
function flipFirstBit(hex: string): string | null {
  if (!hex || hex.length === 0) return null;
  const first = parseInt(hex[0], 16);
  if (Number.isNaN(first)) return null;
  return (first ^ 0x8).toString(16) + hex.slice(1);
}

export function tamperFlipMasterBit(snap: SnapshotV1): SnapshotV1 | null {
  const clone = cloneSnap(snap);
  const flipped = flipFirstBit(clone.tree.masterRoot);
  if (flipped === null) return null;
  clone.tree.masterRoot = flipped;
  return clone;
}

export function tamperMutateAtom(snap: SnapshotV1): SnapshotV1 | null {
  if (!snap.atoms || snap.atoms.length === 0) return null;
  const clone = cloneSnap(snap);
  const first = clone.atoms[0];
  const flipped = flipFirstBit(first.leafHash);
  if (flipped === null) return null;
  clone.atoms[0] = { ...first, leafHash: flipped };
  return clone;
}

export function tamperDropAuditEntry(snap: SnapshotV1): SnapshotV1 | null {
  if (
    !snap.auditLogExcerpt ||
    !Array.isArray(snap.auditLogExcerpt.entries) ||
    snap.auditLogExcerpt.entries.length === 0
  ) {
    return null;
  }
  const clone = cloneSnap(snap);
  clone.auditLogExcerpt!.entries.shift();
  return clone;
}

const TAMPER_FUNCTIONS: Record<TamperMode, (snap: SnapshotV1) => SnapshotV1 | null> = {
  "flip-master-bit": tamperFlipMasterBit,
  "mutate-atom-leafhash": tamperMutateAtom,
  "drop-audit-entry": tamperDropAuditEntry,
};

export default function VerifyClient() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [dragActive, setDragActive] = useState(false);
  const [demoMeta, setDemoMeta] = useState<DemoMeta | null>(null);
  // V2.1 — Tamper-demo overlay. When `active`, ResultPanel + ScopePanel
  // render against the tampered result instead of the original verify, and
  // a yellow ribbon makes clear this is a demo, not a real failure. Reset
  // on any new file drop so the next verify starts clean.
  const [tamperState, setTamperState] = useState<TamperState>({ kind: "off" });
  // V1.4 ticker — refreshes the "exported N minutes ago" line every 60s so the
  // freshness signal doesn't go stale during a long audit-page session. Kept
  // here rather than inside <FreshnessLine> so the interval lives at the
  // component-instance level and survives child re-mounts.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Read the demo file on mount so the button + confirm dialog can show
  // real values (file size, atom count, exporter, redacted flag) instead of
  // hard-coded copy that drifts every time the snapshot is regenerated.
  useEffect(() => {
    let cancelled = false;
    fetch(DEMO_URL)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((text) => {
        if (cancelled) return;
        const snap = JSON.parse(text) as SnapshotV1;
        const hasPlaintext = snap.atoms.some(
          (a) => Object.prototype.hasOwnProperty.call(a, "value") && a.value !== undefined,
        );
        setDemoMeta({
          bytes: new Blob([text]).size,
          atomCount: snap.tree.atomCount,
          shardCount: snap.tree.shardCount,
          exporterHost: snap.exporter.host,
          exportedAtIso: snap.exporter.exportedAtIso,
          exporterVersion: snap.exporter.version,
          redacted: !hasPlaintext,
        });
      })
      .catch(() => {
        // Leave demoMeta null; UI uses fallback copy. Don't surface this in
        // the page — the download button still works, only the metadata
        // preview is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFile = useCallback(async (file: File) => {
    // V2.1 — clear any tamper-demo overlay BEFORE starting the new verify,
    // so a previous tampered state never bleeds into the next file's result.
    setTamperState({ kind: "off" });
    setState({ kind: "verifying", filename: file.name });
    try {
      const text = await file.text();
      const snap = JSON.parse(text) as SnapshotV1;
      if (!snap?.signature?.alg) {
        throw new Error("Not a SnapshotV1 document (missing signature block).");
      }
      const result = await verifySnapshot(snap);
      setState({ kind: "done", filename: file.name, result, rawSnap: snap });
    } catch (err) {
      setState({
        kind: "error",
        filename: file.name,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  // V2.1 — apply a tamper mutation, re-run the verifier on the mutated clone,
  // and swap the displayed result. The user can flip between modes (each
  // click re-tampers from the ORIGINAL, not from the currently-displayed
  // tampered state — preventing compound mutations).
  const handleTamper = useCallback(
    async (mode: TamperMode) => {
      if (state.kind !== "done") return;
      const tampered = TAMPER_FUNCTIONS[mode](state.rawSnap);
      if (!tampered) return;
      const result = await verifySnapshot(tampered);
      setTamperState({ kind: "active", mode, result, snap: tampered });
    },
    [state],
  );

  const handleRestoreOriginal = useCallback(() => {
    setTamperState({ kind: "off" });
  }, []);

  const handleDownloadDemo = useCallback(() => {
    // Native confirm gives the user a real beat to think + a cancel button.
    // The "I can do this" interactive ritual: click -> see prompt -> click
    // download -> file lands -> drag onto drop zone -> watch it verify.
    // No server round-trip, no API key plumbing -- the file is a static
    // asset shipped with the site.
    //
    // All numeric/identity values come from the file itself (read on mount
    // via demoMeta). If the fetch failed, we fall back to generic copy so
    // the button still works.
    let body: string;
    if (demoMeta) {
      const sizeStr = formatBytes(demoMeta.bytes);
      const dateStr = demoMeta.exportedAtIso.slice(0, 10);
      // Note: previous copy claimed "the file is small because of redaction".
      // That framing only worked when the demo was 31 KB; the MMPM-research
      // export is 3.6 MB and "small" no longer fits. Reframe around what
      // redaction *means* (no readable content) rather than file size.
      const redactedNote = demoMeta.redacted
        ? `Atom values are redacted \u2014 only the cryptographic leaf hashes are exposed (no readable content). ` +
          `An unredacted export of the same substrate is larger and is never shipped publicly.`
        : `(This demo is NOT redacted \u2014 atom values are present. ${sizeStr}.)`;
      body =
        `Download the signed demo snapshot?\n\n` +
        `${demoMeta.atomCount} atoms across ${demoMeta.shardCount} shards, exported by ${demoMeta.exporterHost} ` +
        `(exporter v${demoMeta.exporterVersion}) on ${dateStr}. ${sizeStr}.\n\n` +
        `${redactedNote}\n\n` +
        `Once it lands, drag it back onto the drop zone above to verify it in your browser \u2014 ` +
        `no server round-trip, no API keys.`;
    } else {
      // Fallback: metadata fetch failed, use generic copy. Download still works.
      body =
        `Download the signed demo snapshot from MMPM's substrate?\n\n` +
        `Atom values are redacted (only the cryptographic leaf hashes are exposed \u2014 no readable content).\n\n` +
        `Once it lands, drag it back onto the drop zone above to verify it in your browser.`;
    }
    const ok = window.confirm(body);
    if (!ok) return;
    const a = document.createElement("a");
    a.href = DEMO_URL;
    a.download = "mmpm-research-snap.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [demoMeta]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const f = e.dataTransfer.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const onSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  return (
    <div className="space-y-4">
      {/* Drop zone is the primary interaction. Trust copy lives INSIDE
                it as a translucent backdrop so visitors absorb the message
                without losing the affordance. */}
      <DropZone
        dragActive={dragActive}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onSelect={onSelect}
        state={state}
      />

      {/* Inline secondary action -- small pill button, not a hero card.
                Button label and explainer below it both reflect the
                live file's metadata (loaded on mount) so nothing here
                can drift from what actually downloads. */}
      <div className="flex flex-col items-center gap-2">
        <DownloadDemoButton onClick={handleDownloadDemo} meta={demoMeta} />
        {demoMeta && (
          <p className="max-w-md text-center text-[11px] leading-snug text-white/40">
            Redacted demo: only the cryptographic leaf hashes are exposed — no readable atom
            content. An unredacted export of the same substrate would be larger and is never shipped
            publicly.
          </p>
        )}
      </div>

      {state.kind === "verifying" && (
        <div className="border-surface-200/10 bg-surface-900/50 rounded-xl border p-6 text-sm text-white/70">
          Verifying <span className="font-mono text-white">{state.filename}</span>...
        </div>
      )}

      {state.kind === "error" && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6">
          <div className="text-sm font-semibold text-rose-300">Could not verify</div>
          <div className="mt-2 text-sm text-white/70">{state.message}</div>
        </div>
      )}

      {state.kind === "done" && (
        <>
          {/* V2.1 — tamper-demo ribbon. Yellow (not red) so a careful reader
              cannot mistake "we deliberately broke this" for "the snapshot
              we shipped is bad". */}
          {tamperState.kind === "active" && (
            <div
              data-testid="verify-tamper-ribbon"
              className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] text-amber-200"
            >
              <span className="font-semibold tracking-wide uppercase">⚠ Tamper demo</span>
              <span className="text-amber-100/80">
                {" "}
                &mdash; this snapshot has been mutated in your browser (
                {TAMPER_MODE_LABELS[tamperState.mode]}). Verifier should fail on:{" "}
                {TAMPER_MODE_EXPECTED_FAILS[tamperState.mode]}. Click <em>Restore original</em>{" "}
                below to revert.
              </span>
            </div>
          )}

          {/* V1.1 — explicit scope statement BEFORE the technical result panel.
              Auditors expect to see what a verification proves and (just as
              importantly) what it does not. Implicit over-claiming is the
              fastest way to lose a careful reader. */}
          <ScopePanel
            overallOk={
              tamperState.kind === "active" ? tamperState.result.overallOk : state.result.overallOk
            }
          />
          <ResultPanel
            result={tamperState.kind === "active" ? tamperState.result : state.result}
            snap={tamperState.kind === "active" ? tamperState.snap : state.rawSnap}
            originalSnap={state.rawSnap}
            tamperState={tamperState}
            onTamper={handleTamper}
            onRestore={handleRestoreOriginal}
            now={now}
          />
        </>
      )}
    </div>
  );
}

function DropZone(props: {
  dragActive: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  state: State;
}) {
  const idle = props.state.kind === "idle";
  // After a successful verify, collapse the drop zone from the BOTTOM up:
  // top stays anchored (with the trust copy in view), inner affordance
  // animates max-height + opacity to 0, padding shrinks. Net effect: the
  // result panels below glide into view as the bottom edge moves up.
  const collapsed = props.state.kind === "done";
  return (
    <label
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
      className={`relative flex cursor-pointer flex-col items-center overflow-hidden rounded-xl border-2 border-dashed text-center transition-all duration-500 ease-out ${
        collapsed ? "px-6 py-5" : "px-6 py-12"
      } ${
        props.dragActive
          ? "border-brand-400 bg-brand-500/5"
          : "border-surface-200/15 bg-surface-900/30 hover:border-surface-200/30"
      }`}
    >
      <input
        type="file"
        accept="application/json,.json"
        onChange={props.onSelect}
        className="absolute inset-0 cursor-pointer opacity-0"
      />

      {/* Trust copy: ghostly yellow, normal flow at the top so when the
                zone collapses it stays anchored. Fades out on drag. */}
      <div
        className={`pointer-events-none w-full transition-opacity duration-300 ${
          props.dragActive ? "opacity-0" : "opacity-100"
        }`}
        aria-hidden="true"
      >
        <div className="text-[11px] font-semibold tracking-[0.22em] text-amber-200/60 uppercase">
          Same cryptography you already trust
        </div>
        <div className="mt-1 text-[10px] font-medium tracking-wide text-amber-200/40">
          Bitcoin &middot; Git &middot; Certificate Transparency &middot; Sigstore
        </div>
      </div>

      {/* Drop affordance -- max-height + opacity transition collapses
                this whole block to 0 once verification completes, leaving
                only the trust copy at top. */}
      <div
        className={`pointer-events-none flex w-full flex-col items-center overflow-hidden transition-all duration-500 ease-out ${
          collapsed ? "mt-0 max-h-0 opacity-0" : "mt-6 max-h-[200px] opacity-100"
        }`}
      >
        <svg
          className={`h-12 w-12 ${props.dragActive ? "text-brand-300" : "text-surface-400"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 13l3 3m0 0l3-3m-3 3V4M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3"
          />
        </svg>
        <div className="mt-4 text-base font-semibold text-white">
          {idle ? "Drop a signed snapshot JSON here" : "Drop another file to re-verify"}
        </div>
        <div className="mt-1 text-xs text-white/50">
          or click to choose a file. Verification runs entirely in your browser.
        </div>
      </div>
    </label>
  );
}

function ResultPanel({
  result,
  snap,
  originalSnap,
  tamperState,
  onTamper,
  onRestore,
  now,
}: {
  result: VerifyResult;
  snap: SnapshotV1;
  // V2.1 audit-flow refinement: TamperControls always tampers from the
  // ORIGINAL snapshot (never compounded mutations). When the display is
  // showing a tampered result, `snap` above is the tampered clone and
  // `originalSnap` is the un-mutated baseline the user dropped.
  originalSnap: SnapshotV1;
  tamperState: TamperState;
  onTamper: (mode: TamperMode) => void;
  onRestore: () => void;
  now: number;
}) {
  const Badge = (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
        result.overallOk
          ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border border-rose-500/30 bg-rose-500/10 text-rose-300"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          result.overallOk ? "bg-emerald-400" : "bg-rose-400"
        }`}
      />
      {result.overallOk ? "VERIFIED" : "FAILED"}
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="border-surface-200/10 bg-surface-900/50 rounded-xl border p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs tracking-wide text-white/40 uppercase">Result</div>
            {/* V3.4 — human-tone success header. Renders ONLY on a successful
                verify; on FAIL the rose-coloured summary speaks for itself and
                a warmer greeting would feel tone-deaf. The sentence sits above
                the technical summary so the reader's first beat is what they
                just accomplished, not the engine output. */}
            {result.overallOk ? (
              <p
                className="mt-1 text-sm leading-relaxed text-white/70"
                data-testid="verify-success-greeting"
              >
                You just independently verified an MMPM signed memory snapshot in your browser. No
                server trust, no API key, no Parametric Memory code path. Welcome.
              </p>
            ) : null}
            <div className="mt-1 text-base font-semibold text-white">{result.summary}</div>
            {/* V1.4 — freshness + exporter line. Renders the host/version that
                signed THIS snapshot plus an auto-refreshing "N minutes ago"
                derived from the parent component's `now` ticker. */}
            <FreshnessLine exporter={snap.exporter} now={now} />
          </div>
          {Badge}
        </div>
      </div>

      {/* V1.2 — public-keys panel sits directly under the result hero so the
          strongest trust signal (independent key publication) is visible
          without scrolling past every check card. The page also keeps the
          static version below <VerifyClient/> for visitors who arrive before
          dropping a file. */}
      <PublicKeysPanel signature={snap.signature} />

      {/* V2.1 audit-flow refinement (2026-05-14): TamperControls now sits
          BETWEEN the public-keys panel and the per-check cards rather than at
          the bottom. The reader's eye lands on it as they're absorbing the
          all-green proofs — first sees "you can flip a bit", scrolls past to
          read every PASS card and the snapshot metadata, then the dawning
          question "wait, can I actually test this?" pulls them back up. The
          panel is visible from the trust block without being intrusive. */}
      <TamperControls
        snap={originalSnap}
        tamperState={tamperState}
        onTamper={onTamper}
        onRestore={onRestore}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <CheckCard label="formatVersion" check={result.formatVersion} />
        <CheckCard label="Ed25519 signature" check={result.signature} />
        <CheckCard label="edgesRoot" check={result.edgesRoot} />
        <CheckCard label="masterRoot" check={result.masterRoot} />
        <CheckCard label="auditLogRoot" check={result.auditLogRoot} />
        <CheckCard label="atom value-bind" check={result.atomValueBind} />
        <CheckCard label="consistency proof" check={result.consistencyProof} />
        <CheckCard label="audit entries" check={result.auditEntries} />
      </div>

      <ShardRootsTable shardRoots={result.shardRoots} shardLeafCounts={snap.tree.shardLeafCounts} />

      <SnapshotMeta snap={snap} />
    </div>
  );
}

function CheckCard({
  label,
  check,
}: {
  label: string;
  check: { ok: boolean; expected?: string; computed?: string; detail?: string; absent?: boolean };
}) {
  const isAbsent = check.absent === true;
  return (
    <div
      className={`rounded-xl border p-5 ${
        isAbsent
          ? "border-surface-200/15 bg-surface-900/40"
          : check.ok
            ? "border-emerald-500/15 bg-emerald-500/5"
            : "border-rose-500/20 bg-rose-500/5"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-white">{label}</div>
        <span
          className={`text-xs font-semibold tracking-wide uppercase ${
            isAbsent ? "text-white/40" : check.ok ? "text-emerald-300" : "text-rose-300"
          }`}
        >
          {isAbsent ? "not in snapshot" : check.ok ? "PASS" : "FAIL"}
        </span>
      </div>
      {check.detail && <div className="mt-2 text-xs text-white/50">{check.detail}</div>}
      {(check.expected || check.computed) && (
        <div className="mt-3 space-y-1 text-[11px] text-white/40">
          {check.expected && (
            <div>
              <span className="text-white/30">expected </span>
              <HashWithCopy hex={check.expected} ariaLabel={`${label} expected hash`} />
            </div>
          )}
          {/* V2.3 — always render `computed` when present, not only on diff.
              Auditor-friendly: seeing `computed === expected` is the proof.
              On PASS (match), neutral colour + green ✓ to signal the match.
              On FAIL (mismatch), red text — same as before V2.3. */}
          {check.computed && (
            <div className={check.ok ? "text-white/40" : "text-rose-300"}>
              <span className="text-white/30">computed </span>
              <HashWithCopy hex={check.computed} ariaLabel={`${label} computed hash`} />
              {check.ok && check.expected && check.computed === check.expected && (
                <span
                  className="ml-2 text-emerald-300"
                  aria-label="computed matches expected"
                  data-testid="verify-hash-match-tick"
                >
                  ✓
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ShardRootsTable({
  shardRoots,
  shardLeafCounts,
}: {
  shardRoots: {
    ok: boolean;
    perShard: Array<{ shardId: number; ok: boolean; expected?: string; computed?: string }>;
  };
  shardLeafCounts: number[];
}) {
  return (
    <div className="border-surface-200/10 bg-surface-900/50 overflow-hidden rounded-xl border">
      <div className="border-surface-200/10 border-b px-5 py-3 text-sm font-medium text-white">
        Shard roots ({shardRoots.perShard.length})
        <span
          className={`ml-2 text-xs font-semibold ${
            shardRoots.ok ? "text-emerald-300" : "text-rose-300"
          }`}
        >
          {shardRoots.ok ? "all PASS" : "some FAIL"}
        </span>
      </div>
      <table className="w-full text-left text-xs">
        <thead className="text-white/40">
          <tr>
            <th className="px-5 py-2">shard</th>
            <th className="px-5 py-2">leaves</th>
            <th className="px-5 py-2">root (click to expand)</th>
            <th className="px-5 py-2">status</th>
          </tr>
        </thead>
        <tbody>
          {shardRoots.perShard.map((s) => (
            <tr key={s.shardId} className="border-surface-200/5 border-t">
              <td className="px-5 py-2 font-mono text-white/70">{s.shardId}</td>
              <td className="px-5 py-2 font-mono text-white/50">
                {shardLeafCounts[s.shardId] ?? "?"}
              </td>
              <td className="px-5 py-2 text-white/60">
                <HashWithCopy
                  hex={s.expected ?? ""}
                  truncateAt={16}
                  ariaLabel={`shard ${s.shardId} root`}
                />
              </td>
              <td
                className={`px-5 py-2 font-mono font-semibold ${s.ok ? "text-emerald-300" : "text-rose-300"}`}
              >
                {s.ok ? "PASS" : "FAIL"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SnapshotMeta({ snap }: { snap: SnapshotV1 }) {
  // V2.4 — derive redacted/not-redacted from the snapshot itself, not from a
  // hardcoded assumption. Customers (or future demos) might drop an unredacted
  // snapshot — the copy should adapt rather than over-claim privacy.
  const hasPlaintext = snap.atoms.some(
    (a) => Object.prototype.hasOwnProperty.call(a, "value") && a.value !== undefined,
  );
  const redacted = !hasPlaintext;

  return (
    <div className="border-surface-200/10 bg-surface-900/30 rounded-xl border p-5">
      <div className="text-sm font-medium text-white">Snapshot metadata</div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Row k="formatVersion" v={snap.formatVersion} />
        <Row k="treeVersion" v={String(snap.tree.treeVersion)} />
        <Row k="atomCount" v={String(snap.tree.atomCount)} />
        <Row k="shardCount" v={String(snap.tree.shardCount)} />
        <Row k="masterRoot" v={snap.tree.masterRoot} copyable />
        <Row k="signature.kid" v={snap.signature.kid} />
        <Row k="signature.alg" v={snap.signature.alg} />
        <Row k="publicKey fingerprint" v={snap.signature.publicKeyFingerprint} copyable />
      </dl>
      {/* V2.4 — atom-context sentence. Anchors the otherwise-abstract atom
          count to a concrete meaning (what an "atom" actually is) and makes
          the redaction stance explicit per-snapshot. No hardcoded counts;
          the existing atomCount row above carries the number. */}
      <p className="mt-4 text-xs leading-relaxed text-white/55" data-testid="verify-atom-context">
        These atoms are MMPM agent memory entries — facts, procedures, state, events, and hub atoms
        — the same atom types used in production substrates.{" "}
        {redacted ? (
          <>
            <strong className="text-white/75">Atom plaintext is redacted in this snapshot</strong> —
            only the cryptographic leaf hashes are exposed, never the readable content.
          </>
        ) : (
          <>
            <strong className="text-amber-200/80">This snapshot is NOT redacted</strong> — atom
            plaintext is included alongside the leaf hashes. Customer-facing shares should always be
            redacted.
          </>
        )}
      </p>
    </div>
  );
}

function DownloadDemoButton({ onClick, meta }: { onClick: () => void; meta: DemoMeta | null }) {
  // Label is driven by live file metadata when available, so it always
  // matches what actually downloads. Fallback covers the brief window
  // before the metadata fetch resolves (and the rare case where it fails).
  const label = meta
    ? `Download demo snapshot — ${formatBytes(meta.bytes)} · ${meta.atomCount} atoms · redacted`
    : "Download a demo snapshot to verify";
  return (
    <button
      type="button"
      onClick={onClick}
      title="Downloads a redacted snapshot. Drag it onto the drop zone above to verify."
      className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-4 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/10"
    >
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
        />
      </svg>
      {label}
    </button>
  );
}

function Row({
  k,
  v,
  mono,
  copyable,
}: {
  k: string;
  v: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  if (copyable) {
    return (
      <>
        <dt className="text-white/40">{k}</dt>
        <dd className="text-white/80">
          <HashWithCopy hex={v} ariaLabel={k} />
        </dd>
      </>
    );
  }
  return (
    <>
      <dt className="text-white/40">{k}</dt>
      <dd className={`truncate text-white/80 ${mono ? "font-mono" : ""}`} title={v}>
        {v}
      </dd>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// V2.1 — TamperControls
//
// Renders below the ResultPanel on a successful verify. Three buttons each
// trigger a specific mutation of the snapshot (via the exported tamper*
// helpers) and re-run the verifier on the mutated copy. The user watches
// the right cards flip to FAIL — proof-by-demonstration that tamper detection
// is real. A fourth button restores the original.
//
// Buttons disable when the corresponding mutation isn't possible:
//   - mutate-atom-leafhash: disabled if snap.atoms is empty
//   - drop-audit-entry: disabled if no auditLogExcerpt with entries
//
// The component never mutates `snap` (the original). The tamper helpers all
// structuredClone before mutating, so re-tampering with a different mode
// starts from the clean original — no compound mutations.
// ─────────────────────────────────────────────────────────────────────────────

function TamperControls({
  snap,
  tamperState,
  onTamper,
  onRestore,
}: {
  snap: SnapshotV1;
  tamperState: TamperState;
  onTamper: (mode: TamperMode) => void | Promise<void>;
  onRestore: () => void;
}) {
  const hasAtoms = (snap.atoms?.length ?? 0) > 0;
  const hasAuditEntries =
    !!snap.auditLogExcerpt &&
    Array.isArray(snap.auditLogExcerpt.entries) &&
    snap.auditLogExcerpt.entries.length > 0;
  const isActive = tamperState.kind === "active";
  const activeMode = isActive ? tamperState.mode : null;

  const buttonClass = (mode: TamperMode, disabled: boolean) =>
    [
      "rounded-md border px-3 py-2 text-left text-[11px] transition-colors",
      disabled
        ? "border-surface-200/10 bg-surface-900/30 text-white/30 cursor-not-allowed"
        : activeMode === mode
          ? "border-amber-500/50 bg-amber-500/15 text-amber-100"
          : "border-surface-200/20 bg-surface-900/40 text-white/70 hover:border-amber-500/40 hover:bg-amber-500/5 cursor-pointer",
    ].join(" ");

  return (
    <div
      className="border-surface-200/10 bg-surface-900/30 rounded-xl border p-5"
      data-testid="verify-tamper-controls"
    >
      <div className="text-[11px] font-semibold tracking-[0.18em] text-white/40 uppercase">
        Tamper with this snapshot
      </div>
      <p className="mt-2 text-xs text-white/60">
        Mutate the snapshot in your browser and watch the verifier catch it. Nothing is sent
        anywhere &mdash; the original file you dropped is untouched. Click <em>Restore original</em>{" "}
        to revert.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => onTamper("flip-master-bit")}
          data-testid="verify-tamper-flip-master"
          aria-label="Flip a bit in tree.masterRoot"
          className={buttonClass("flip-master-bit", false)}
        >
          <div className="font-semibold">Flip a bit in masterRoot</div>
          <div className="mt-1 text-white/50">Expects masterRoot + Ed25519 signature to FAIL.</div>
        </button>
        <button
          type="button"
          onClick={() => onTamper("mutate-atom-leafhash")}
          disabled={!hasAtoms}
          data-testid="verify-tamper-mutate-atom"
          aria-label="Mutate the leaf hash on the first atom"
          className={buttonClass("mutate-atom-leafhash", !hasAtoms)}
        >
          <div className="font-semibold">Mutate atoms[0].leafHash</div>
          <div className="mt-1 text-white/50">
            Expects the affected shard root to FAIL.
            {!hasAtoms && " (Disabled — snapshot has no atoms.)"}
          </div>
        </button>
        <button
          type="button"
          onClick={() => onTamper("drop-audit-entry")}
          disabled={!hasAuditEntries}
          data-testid="verify-tamper-drop-audit"
          aria-label="Drop the first audit-log entry"
          className={buttonClass("drop-audit-entry", !hasAuditEntries)}
        >
          <div className="font-semibold">Drop an audit entry</div>
          <div className="mt-1 text-white/50">
            Expects auditLogRoot to FAIL.
            {!hasAuditEntries && " (Disabled — snapshot has no audit-log entries.)"}
          </div>
        </button>
      </div>
      {isActive && (
        <button
          type="button"
          onClick={onRestore}
          data-testid="verify-tamper-restore"
          aria-label="Restore the original (un-tampered) snapshot"
          className="mt-3 inline-flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium text-emerald-200 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/15"
        >
          ↺ Restore original
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// V2.2 — HashWithCopy
//
// Auditor-friendly display for any hex hash on the verify page. Two affordances:
//   1. Click the truncated hex → expands to the full string. Re-click collapses.
//   2. Click the copy icon → navigator.clipboard.writeText(fullHex). Visual
//      feedback (green tick + title="Copied") for 1.5s, then resets.
//
// Used by CheckCard (expected/computed hashes), ShardRootsTable (per-shard
// roots), and SnapshotMeta (masterRoot, publicKey fingerprint). The auditor
// flow this enables: drop a snapshot, click any displayed hash to expand,
// click copy, paste into a terminal, run `sha256sum` or equivalent against
// the source-of-truth to cross-check. The verify page becomes a starting
// point for independent verification rather than a black-box trust signal.
//
// Falls through cleanly on non-truncatable hashes (renders the full hex as
// a plain `<span>` with the copy button still attached) and on clipboard
// API failure (older browsers / non-secure contexts — the hash stays
// visible; the user can still select-and-copy manually).
// ─────────────────────────────────────────────────────────────────────────────

export function HashWithCopy({
  hex,
  truncateAt = 32,
  ariaLabel,
}: {
  hex: string;
  truncateAt?: number;
  ariaLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const isTruncatable = hex.length > truncateAt;
  const displayed = expanded || !isTruncatable ? hex : hex.slice(0, truncateAt) + "…";
  const safeLabel = ariaLabel ?? "hash";

  const handleCopy = useCallback(async () => {
    if (!hex) return;
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(true);
      // Reset the "copied" state after a short window so consecutive copies
      // still produce visible feedback.
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail in non-secure contexts or older browsers.
      // We deliberately swallow — the hex remains visible for manual copy.
    }
  }, [hex]);

  return (
    <span className="inline-flex items-baseline gap-1.5 font-mono break-all">
      {isTruncatable ? (
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          data-testid="verify-hash-toggle"
          aria-label={`${expanded ? "Collapse" : "Expand"} ${safeLabel}`}
          aria-expanded={expanded}
          className="cursor-pointer text-left transition-colors hover:text-white/80"
        >
          {displayed}
        </button>
      ) : (
        <span>{displayed}</span>
      )}
      <button
        type="button"
        onClick={handleCopy}
        data-testid="verify-hash-copy"
        aria-label={`Copy ${safeLabel} to clipboard`}
        title={copied ? "Copied" : "Copy to clipboard"}
        className="flex-shrink-0 cursor-pointer self-center opacity-50 transition-opacity hover:opacity-100"
      >
        {copied ? (
          <svg
            className="h-3 w-3 text-emerald-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        )}
      </button>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// V1.1 — ScopePanel
//
// Explicit two-column statement of what this verification proves vs what it
// does NOT prove. Sits between the drop zone and the technical check cards.
// The single most-leverage addition for an auditor's read of this page —
// without an explicit scope statement, the green "VERIFIED" badge implicitly
// over-claims. Renders on every `state.kind === "done"` (pass OR fail) because
// the scope statement is relevant in both directions.
// ─────────────────────────────────────────────────────────────────────────────

function ScopePanel({ overallOk }: { overallOk: boolean }) {
  return (
    <div className="border-surface-200/10 bg-surface-900/30 rounded-xl border p-6">
      <div className="text-[11px] font-semibold tracking-[0.18em] text-white/40 uppercase">
        Scope of {overallOk ? "this verification" : "this verification attempt"}
      </div>
      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <div>
          <div className="text-xs font-semibold tracking-wide text-emerald-300 uppercase">
            What this proves
          </div>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-white/70">
            <li>
              Every atom and edge in this snapshot is bit-exact what the signer committed to at
              export time.
            </li>
            <li>
              The Ed25519 signature was produced by the holder of the private key matching the
              published fingerprint shown below.
            </li>
            <li>The audit-log entries are authentic and in their original recorded order.</li>
            <li>
              The Merkle commitments (per-shard roots → master root) are internally consistent.
            </li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-semibold tracking-wide text-amber-200/80 uppercase">
            What this does NOT prove
          </div>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-white/60">
            <li>
              That the substrate is <em>complete</em> — a substrate operator can sign a snapshot
              that omits atoms; only out-of-band attestation prevents that.
            </li>
            <li>
              That atom <em>contents</em> are accurate to source — only that the leaf hashes commit
              to whichever value the signer chose.
            </li>
            <li>
              That the published public key belongs to the entity you believe owns it — that&apos;s
              a separate identity-verification step (see &ldquo;Public keys&rdquo; panel below).
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// V1.2 — PublicKeysPanel (inline, anchored to the verified file)
//
// Renders directly under the result hero so the strongest trust signal
// (independent key publication) is visible without scrolling. Includes a copy-
// pasteable curl one-liner that fetches the JWKS and pipes through grep — a
// careful reader can verify the embedded public key matches what's published
// in 5 seconds. Keyed off the verified snapshot's signature.keyUri so the
// panel always points at the correct publication URL.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * V1.3 — state machine for the in-page "Fetch JWKS now" affordance.
 * Exported as a named type so the test file can pattern-match against
 * the expected shape.
 */
export type JwksFetchState =
  | { kind: "idle" }
  | { kind: "fetching" }
  | {
      kind: "done";
      matched: boolean;
      jwksKid: string | null;
      jwksFingerprint: string | null;
      kidFound: boolean;
      embeddedFingerprint: string;
    }
  | { kind: "error"; message: string };

/**
 * V1.3 — compute the same fingerprint format the substrate uses
 * (`SHA-256(raw 32-byte Ed25519 public key)` formatted as colon-separated
 * lowercase hex pairs) from a JWK `x` field (base64url-encoded 32-byte key).
 *
 * Mirrors the substrate's fingerprint construction byte-for-byte; if either
 * side ever changes algorithm, this function plus the fixture-driven test
 * for the Fetch JWKS button (V1.3) catches the drift.
 */
export async function fingerprintFromJwkX(xBase64Url: string): Promise<string> {
  const padded = xBase64Url + "=".repeat((4 - (xBase64Url.length % 4)) % 4);
  const std = padded.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const hash = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  const arr = Array.from(new Uint8Array(hash));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join(":");
}

function PublicKeysPanel({ signature }: { signature: SnapshotV1["signature"] }) {
  const curl = `curl -fsS ${signature.keyUri} | jq '.keys[] | select(.kid == "${signature.kid}")'`;
  const [fetchState, setFetchState] = useState<JwksFetchState>({ kind: "idle" });

  const handleFetchJwks = useCallback(async () => {
    setFetchState({ kind: "fetching" });
    try {
      const res = await fetch(signature.keyUri, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText || ""}`.trim());
      }
      const body = (await res.json()) as { keys?: Array<{ kid?: string; x?: string }> };
      const match = body.keys?.find((k) => k.kid === signature.kid);
      if (!match || typeof match.x !== "string") {
        setFetchState({
          kind: "done",
          matched: false,
          jwksKid: null,
          jwksFingerprint: null,
          kidFound: false,
          embeddedFingerprint: signature.publicKeyFingerprint,
        });
        return;
      }
      const jwksFp = await fingerprintFromJwkX(match.x);
      setFetchState({
        kind: "done",
        matched: jwksFp === signature.publicKeyFingerprint,
        jwksKid: match.kid ?? null,
        jwksFingerprint: jwksFp,
        kidFound: true,
        embeddedFingerprint: signature.publicKeyFingerprint,
      });
    } catch (err) {
      setFetchState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [signature]);

  return (
    <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-5">
      <div className="flex items-start gap-3">
        <svg
          className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
          />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">
            Public keys published independently
          </div>
          <p className="mt-1 text-xs leading-relaxed text-white/60">
            The public key used to verify this signature is published in standard JWKS format at the
            URL below. Anyone can fetch it and confirm it matches the fingerprint shown —
            independent of MMPM. If the embedded key doesn&apos;t match the JWKS entry for its{" "}
            <code className="bg-surface-900/60 rounded px-1 py-0.5 text-[10px] text-white/70">
              kid
            </code>
            , the snapshot is rejected.
          </p>
          <div className="mt-3 space-y-2 text-[11px]">
            <div>
              <span className="text-white/40">URL </span>
              <a
                href={signature.keyUri}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono break-all text-emerald-300 hover:text-emerald-200 hover:underline"
              >
                {signature.keyUri}
              </a>
            </div>
            <div>
              <span className="text-white/40">kid </span>
              <span className="font-mono text-white/70">{signature.kid}</span>
            </div>
            <div>
              <span className="text-white/40">fingerprint </span>
              <span className="font-mono break-all text-white/70">
                {signature.publicKeyFingerprint}
              </span>
            </div>
          </div>

          {/* ── V1.3 — interactive Fetch JWKS now ─────────────────────────
              Gives the reader agency in the trust chain: instead of asking
              them to copy-paste a curl, the browser does the fetch live and
              compares the published key's SHA-256 fingerprint against the
              one embedded in the signed snapshot. This is the same Check A
              the verifier already does on first verify (resolveSignatureKey),
              but the result is normally hidden inside the Ed25519 card's
              detail string — surfacing it as an explicit button is the
              auditor-facing demonstration that "the JWKS path actually works
              and proves what we claim". */}
          <div className="mt-4 border-t border-emerald-500/10 pt-3">
            <button
              type="button"
              onClick={handleFetchJwks}
              disabled={fetchState.kind === "fetching"}
              data-testid="verify-fetch-jwks"
              className="inline-flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {fetchState.kind === "fetching" ? "Fetching…" : "Fetch JWKS now"}
            </button>
            <span className="ml-2 text-[10px] text-white/40">
              Live cross-origin GET. Runs in your browser. Verify independently.
            </span>

            {fetchState.kind === "done" && fetchState.matched && (
              <div
                className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-[11px]"
                data-testid="verify-jwks-result-match"
              >
                <div className="font-semibold text-emerald-300">
                  ✓ Published key matches embedded key
                </div>
                <div className="mt-2 space-y-1 text-white/60">
                  <div>
                    kid found in JWKS:{" "}
                    <span className="font-mono text-white/80">{fetchState.jwksKid}</span>
                  </div>
                  <div className="break-all">
                    published fingerprint:{" "}
                    <span className="font-mono text-white/80">{fetchState.jwksFingerprint}</span>
                  </div>
                  <div className="break-all">
                    embedded fingerprint:{" "}
                    <span className="font-mono text-white/80">
                      {fetchState.embeddedFingerprint}
                    </span>
                  </div>
                </div>
                <div className="mt-2 text-white/50">
                  Same key, two independent sources. The snapshot signature can be trusted to the
                  public-key fingerprint above.
                </div>
              </div>
            )}

            {fetchState.kind === "done" && !fetchState.matched && (
              <div
                className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-[11px]"
                data-testid="verify-jwks-result-mismatch"
              >
                <div className="font-semibold text-rose-300">
                  ✗ MISMATCH — refuse to trust this snapshot
                </div>
                <div className="mt-2 space-y-1 text-white/70">
                  {!fetchState.kidFound ? (
                    <div>
                      kid <span className="font-mono">{signature.kid}</span> is NOT present in the
                      JWKS document published at the URL above. The substrate may be signing with a
                      key it never published, or the snapshot was signed by a different party.
                    </div>
                  ) : (
                    <>
                      <div className="break-all">
                        published fingerprint:{" "}
                        <span className="font-mono">{fetchState.jwksFingerprint}</span>
                      </div>
                      <div className="break-all">
                        embedded fingerprint:{" "}
                        <span className="font-mono">{fetchState.embeddedFingerprint}</span>
                      </div>
                      <div>
                        The JWKS publishes a different key under the same kid than the one embedded
                        in this snapshot. Reject the snapshot.
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {fetchState.kind === "error" && (
              <div
                className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[11px]"
                data-testid="verify-jwks-result-error"
              >
                <div className="font-semibold text-amber-300">JWKS fetch failed</div>
                <div className="mt-1 text-white/70">{fetchState.message}</div>
                <div className="mt-2 text-white/50">
                  The signature is still valid against the embedded key (which is covered by the
                  signature and cannot be swapped in transit), but independent verification against
                  the JWKS endpoint is currently unavailable from this browser. Possible causes:
                  CORS misconfiguration, network error, endpoint down.
                </div>
              </div>
            )}
          </div>

          <div className="mt-4">
            <div className="text-[10px] tracking-wide text-white/30 uppercase">
              Verify independently from a terminal
            </div>
            <pre className="bg-surface-900/60 mt-1 overflow-x-auto rounded-lg p-2 font-mono text-[10px] leading-relaxed text-white/70">
              {curl}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// V1.4 — FreshnessLine
//
// Renders under the result hero summary. Shows exporter host + version (the
// identity that signed this specific file) plus an auto-refreshing "N minutes
// ago" derived from the parent component's `now` ticker. Stale snapshots are
// suspicious — surfacing the timestamp prominently is a free trust signal.
// ─────────────────────────────────────────────────────────────────────────────

function FreshnessLine({ exporter, now }: { exporter: SnapshotV1["exporter"]; now: number }) {
  const ms = now - new Date(exporter.exportedAtIso).getTime();
  const rel = formatRelativeAge(ms);
  return (
    <div className="mt-2 text-xs text-white/40">
      Signed by <span className="font-mono text-white/60">{exporter.host}</span> (exporter v
      {exporter.version}), exported{" "}
      <span className="font-mono text-white/60">{exporter.exportedAtIso}</span> — {rel}.
    </div>
  );
}

/**
 * Format a duration-since-export as a short human-readable string.
 * Pure function — exported indirectly via FreshnessLine so it can be unit-tested
 * independently of React rendering.
 */
export function formatRelativeAge(ms: number): string {
  if (ms < 0) return "in the future"; // clock skew safety
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}
