"use client";

import { useCallback, useState } from "react";
import { verifySnapshot, type SnapshotV1, type VerifyResult } from "./verifier";

type State =
  | { kind: "idle" }
  | { kind: "fetching" }
  | { kind: "verifying"; filename: string }
  | { kind: "done"; filename: string; result: VerifyResult; rawSnap: SnapshotV1 }
  | { kind: "error"; filename: string; message: string };

export default function VerifyClient() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [dragActive, setDragActive] = useState(false);

  const handleFile = useCallback(async (file: File) => {
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

  const handleDownloadDemo = useCallback(() => {
    // Native confirm gives the user a real beat to think + a cancel button.
    // The "I can do this" interactive ritual: click -> see prompt -> click
    // download -> file lands -> drag onto drop zone -> watch it verify.
    // No server round-trip, no API key plumbing -- the file is a static
    // asset shipped with the site.
    const ok = window.confirm(
      "Download a sample signed snapshot from MMPM\u2019s own substrate?\n\n" +
        "It is the real production snapshot, with atom values redacted (only the cryptographic " +
        "leaf hashes are exposed -- no readable content). About 3.4 MB.\n\n" +
        "Once it lands, drag it back onto the drop zone above to verify it in your browser.",
    );
    if (!ok) return;
    const a = document.createElement("a");
    a.href = "/demo-snapshots/mmpm-research-snap.json";
    a.download = "mmpm-research-snap.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

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

      {/* Inline secondary action -- small pill button, not a hero card. */}
      <div className="flex justify-center">
        <DownloadDemoButton onClick={handleDownloadDemo} />
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

      {state.kind === "done" && <ResultPanel result={state.result} snap={state.rawSnap} />}
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

function ResultPanel({ result, snap }: { result: VerifyResult; snap: SnapshotV1 }) {
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
            <div className="mt-1 text-base font-semibold text-white">{result.summary}</div>
          </div>
          {Badge}
        </div>
      </div>

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
        <div className="mt-3 space-y-1 font-mono text-[11px] text-white/40">
          {check.expected && (
            <div>
              <span className="text-white/30">expected </span>
              {check.expected.length > 32 ? check.expected.slice(0, 32) + "..." : check.expected}
            </div>
          )}
          {check.computed && check.computed !== check.expected && (
            <div className="text-rose-300">
              <span className="text-white/30">computed </span>
              {check.computed.length > 32 ? check.computed.slice(0, 32) + "..." : check.computed}
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
            <th className="px-5 py-2">root (first 16 hex)</th>
            <th className="px-5 py-2">status</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {shardRoots.perShard.map((s) => (
            <tr key={s.shardId} className="border-surface-200/5 border-t">
              <td className="px-5 py-2 text-white/70">{s.shardId}</td>
              <td className="px-5 py-2 text-white/50">{shardLeafCounts[s.shardId] ?? "?"}</td>
              <td className="px-5 py-2 text-white/60">{(s.expected ?? "").slice(0, 16)}...</td>
              <td
                className={`px-5 py-2 font-semibold ${s.ok ? "text-emerald-300" : "text-rose-300"}`}
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
  return (
    <div className="border-surface-200/10 bg-surface-900/30 rounded-xl border p-5">
      <div className="text-sm font-medium text-white">Snapshot metadata</div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Row k="formatVersion" v={snap.formatVersion} />
        <Row k="treeVersion" v={String(snap.tree.treeVersion)} />
        <Row k="atomCount" v={String(snap.tree.atomCount)} />
        <Row k="shardCount" v={String(snap.tree.shardCount)} />
        <Row k="masterRoot" v={snap.tree.masterRoot} mono />
        <Row k="signature.kid" v={snap.signature.kid} />
        <Row k="signature.alg" v={snap.signature.alg} />
        <Row k="publicKey fingerprint" v={snap.signature.publicKeyFingerprint} mono />
      </dl>
    </div>
  );
}

function DownloadDemoButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Downloads a redacted production snapshot. Drag it onto the drop zone above to verify."
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
      Download a demo snapshot to verify
    </button>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-white/40">{k}</dt>
      <dd className={`truncate text-white/80 ${mono ? "font-mono" : ""}`} title={v}>
        {v}
      </dd>
    </>
  );
}
