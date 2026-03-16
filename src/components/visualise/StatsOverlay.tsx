"use client";

import { useEffect, useMemo, useState } from "react";
import { useMemoryStore } from "@/stores/memory-store";
import { ATOM_COLORS, AtomType } from "@/types/memory";
import type { SceneError } from "@/stores/memory-store";

const TYPE_LABELS: Record<AtomType, string> = {
  fact: "Facts",
  state: "States",
  event: "Events",
  procedure: "Procedures",
  relation: "Relations",
  other: "Other",
};

const SEVERITY_COLORS: Record<SceneError["severity"], string> = {
  warn: "text-amber-400/80",
  error: "text-red-400/80",
  fatal: "text-red-300 font-semibold",
};

export default function StatsOverlay() {
  const atoms = useMemoryStore((s) => s.atoms);
  const treeHead = useMemoryStore((s) => s.treeHead);
  const healthy = useMemoryStore((s) => s.healthy);
  const isLoading = useMemoryStore((s) => s.isLoading);
  const error = useMemoryStore((s) => s.error);
  const selectedAtom = useMemoryStore((s) => s.selectedAtom);
  const atomDetails = useMemoryStore((s) => s.atomDetails);
  const autoRotate = useMemoryStore((s) => s.autoRotate);
  const toggleAutoRotate = useMemoryStore((s) => s.toggleAutoRotate);
  const fetchTree = useMemoryStore((s) => s.fetchTree);
  const fetchAtomDetail = useMemoryStore((s) => s.fetchAtomDetail);
  const resolvedCount = useMemoryStore((s) => s.resolvedCount);
  const resolvingInProgress = useMemoryStore((s) => s.resolvingInProgress);
  const sceneErrors = useMemoryStore((s) => s.errors);
  const clearErrors = useMemoryStore((s) => s.clearErrors);
  const sseStatus = useMemoryStore((s) => s.sseStatus);
  const sseClientCount = useMemoryStore((s) => s.sseClientCount);
  const [showErrorLog, setShowErrorLog] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [showStats, setShowStats] = useState(false);

  // Fetch atom detail on-demand when selected
  useEffect(() => {
    if (selectedAtom && !atomDetails.has(selectedAtom)) {
      fetchAtomDetail(selectedAtom);
    }
  }, [selectedAtom, atomDetails, fetchAtomDetail]);

  // Memoized counts — only recompute when atoms array changes, not on every render
  const typeCounts = useMemo(() => {
    const counts: Partial<Record<AtomType, number>> = {};
    for (const a of atoms) {
      counts[a.type] = (counts[a.type] ?? 0) + 1;
    }
    return counts;
  }, [atoms]);

  const selected = selectedAtom ? atomDetails.get(selectedAtom) : null;
  const selectedVisualAtom = selectedAtom ? atoms.find((a) => a.key === selectedAtom) : null;
  const isTombstoned = selectedVisualAtom?.tombstoned ?? false;

  // Show centered loading spinner while scene builds
  const showLoadingOverlay = atoms.length === 0 && (isLoading || !healthy);

  return (
    <>
      {/* Centered loading overlay — visible until first atoms arrive */}
      {showLoadingOverlay && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#030712]/80 backdrop-blur-sm transition-opacity duration-500">
          <div className="text-center">
            <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-2 border-cyan-500/20 border-t-cyan-400" />
            <div className="mb-2 font-mono text-sm tracking-widest text-cyan-400/80">
              BUILDING SUBSTRATE
            </div>
            <div className="font-mono text-xs text-slate-500">
              {isLoading ? "Fetching Merkle tree…" : "Connecting to MMPM…"}
            </div>
          </div>
        </div>
      )}

      {/* Resolving overlay — visible only while actively fetching positions */}
      {resolvingInProgress && (
        <div className="pointer-events-none absolute inset-x-0 top-14 z-10 flex justify-center">
          <div className="flex items-center gap-2.5 rounded-full bg-slate-900/80 px-4 py-1.5 ring-1 ring-violet-500/20 backdrop-blur-sm">
            <div className="h-3 w-3 animate-spin rounded-full border border-violet-400/30 border-t-violet-400" />
            <span className="font-mono text-xs text-violet-400/80">
              Resolving positions… {resolvedCount}/{atoms.length}
            </span>
          </div>
        </div>
      )}

      {/* ═══ Top-left: tree stats ═══ */}
      {/* Desktop: always visible. Mobile: compact status line + expandable detail */}
      <div className="absolute top-11 left-3 md:top-14 md:left-6">
        {/* Status line — always visible on all sizes */}
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${healthy ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-red-400 shadow-[0_0_6px_#f87171]"}`}
          />
          <span className="font-mono text-[10px] tracking-wider text-slate-400 md:text-xs">
            {healthy ? "CONNECTED" : "DISCONNECTED"}
          </span>
          {sseStatus === "connected" && (
            <span className="rounded-full bg-violet-500/15 px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-violet-400 ring-1 ring-violet-500/30 md:ml-2 md:px-2 md:text-[10px]">
              SSE LIVE
            </span>
          )}
          {sseStatus === "connecting" && (
            <span className="font-mono text-[9px] text-amber-400/60 md:ml-2 md:text-[10px]">
              SSE…
            </span>
          )}
          {sseStatus === "fallback" && (
            <span className="font-mono text-[9px] text-slate-500 md:ml-2 md:text-[10px]">POLL</span>
          )}
          {/* Mobile: toggle to expand stats */}
          <button
            onClick={() => setShowStats((v) => !v)}
            className="ml-1 rounded px-1.5 py-0.5 font-mono text-[9px] text-slate-500 transition-colors hover:text-slate-300 md:hidden"
          >
            {showStats ? "▾" : "▸"} INFO
          </button>
        </div>

        {/* Expanded stats — always on desktop, toggle on mobile */}
        <div className={`mt-2 space-y-2 ${showStats ? "block" : "hidden"} md:block`}>
          {sseStatus === "connected" && sseClientCount > 0 && (
            <div className="font-mono text-[10px] text-slate-500">
              {sseClientCount} viewer{sseClientCount !== 1 ? "s" : ""} connected
            </div>
          )}

          {treeHead && (
            <div className="space-y-1 font-mono text-xs text-slate-500">
              <div>
                TREE v{treeHead.version} · {atoms.length} atoms · 4 shards
              </div>
              <div className="hidden truncate text-[10px] text-slate-600 md:block">
                ROOT {treeHead.root.slice(0, 16)}…
              </div>
            </div>
          )}

          {isLoading && (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 animate-spin rounded-full border border-cyan-400/30 border-t-cyan-400" />
              <span className="font-mono text-xs text-cyan-400/70">Fetching tree…</span>
            </div>
          )}

          {error && !isLoading && (
            <div className="max-w-xs space-y-2">
              <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 font-mono text-[11px] text-red-400/80">
                {error}
              </div>
              <button
                onClick={() => fetchTree()}
                className="rounded-md bg-slate-800/60 px-3 py-1 font-mono text-[11px] text-slate-400 ring-1 ring-slate-700/50 transition-colors hover:text-white"
              >
                ↻ RETRY
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Top-right: legend ═══ */}
      {/* Desktop: always visible. Mobile: hidden behind toggle button */}
      <div className="absolute top-11 right-3 md:top-14 md:right-6">
        {/* Mobile toggle button */}
        <button
          onClick={() => setShowLegend((v) => !v)}
          className="rounded-md bg-slate-800/60 px-2 py-1 font-mono text-[9px] tracking-wider text-slate-400 ring-1 ring-slate-700/50 backdrop-blur-sm transition-colors hover:text-slate-200 md:hidden"
        >
          {showLegend ? "✕ KEY" : "◉ KEY"}
        </button>

        {/* Legend items — always on desktop, toggle on mobile */}
        <div
          className={`${
            showLegend
              ? "mt-2 rounded-lg bg-slate-900/90 p-2.5 ring-1 ring-slate-700/50 backdrop-blur-md"
              : "hidden"
          } space-y-1.5 md:mt-0 md:block md:rounded-none md:bg-transparent md:p-0 md:ring-0 md:backdrop-blur-none`}
        >
          {(Object.keys(TYPE_LABELS) as AtomType[]).map((type) => {
            const count = typeCounts[type];
            if (!count) return null;
            return (
              <div key={type} className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor: ATOM_COLORS[type],
                    boxShadow: `0 0 6px ${ATOM_COLORS[type]}`,
                  }}
                />
                <span className="font-mono text-[10px] text-slate-400 md:text-xs">
                  {TYPE_LABELS[type]} ({count})
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ Bottom controls ═══ */}
      {/* Mobile: centered row. Desktop: left-aligned as before */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 md:bottom-6 md:left-6 md:gap-3">
        <button
          onClick={toggleAutoRotate}
          className={`rounded-md px-2 py-1.5 font-mono text-[10px] transition-colors md:px-3 md:text-xs ${
            autoRotate
              ? "bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/30"
              : "bg-slate-800/50 text-slate-500 ring-1 ring-slate-700/50"
          }`}
        >
          <span className="md:hidden">{autoRotate ? "◉" : "○"} ROT</span>
          <span className="hidden md:inline">{autoRotate ? "◉ AUTO-ROTATE" : "○ AUTO-ROTATE"}</span>
        </button>

        {/* Error log toggle */}
        <button
          onClick={() => setShowErrorLog((v) => !v)}
          className={`rounded-md px-2 py-1.5 font-mono text-[10px] transition-colors md:px-3 md:text-xs ${
            sceneErrors.length > 0
              ? "bg-red-500/10 text-red-400 ring-1 ring-red-500/30"
              : "bg-slate-800/50 text-slate-500 ring-1 ring-slate-700/50"
          }`}
        >
          {sceneErrors.length > 0 ? `⚠ ${sceneErrors.length}` : "LOG"}
        </button>
      </div>

      {/* Error log panel */}
      {showErrorLog && (
        <div className="absolute right-3 bottom-12 left-3 max-h-48 overflow-y-auto rounded-lg border border-slate-700/50 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-md md:right-auto md:bottom-16 md:left-6 md:max-h-64 md:w-[480px]">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-xs font-semibold text-slate-300">
              ERROR LOG ({sceneErrors.length})
            </span>
            <button
              onClick={clearErrors}
              className="font-mono text-[10px] text-slate-500 hover:text-slate-300"
            >
              CLEAR
            </button>
          </div>
          {sceneErrors.length === 0 ? (
            <div className="py-2 text-center font-mono text-[11px] text-slate-600">
              No errors recorded
            </div>
          ) : (
            <div className="space-y-1">
              {[...sceneErrors].reverse().map((e, i) => (
                <div key={`${e.timestamp}-${i}`} className="font-mono text-[10px] md:text-[11px]">
                  <span className="text-slate-600">
                    {new Date(e.timestamp).toLocaleTimeString()}
                  </span>{" "}
                  <span className="hidden text-slate-500 md:inline">[{e.source}]</span>{" "}
                  <span className={SEVERITY_COLORS[e.severity]}>{e.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ Bottom-center: selected atom detail ═══ */}
      {(selected || (selectedAtom && isTombstoned)) && (
        <div className="absolute inset-x-2 bottom-12 mx-auto w-auto max-w-lg md:inset-x-0 md:bottom-6 md:w-full">
          <div
            className={`rounded-xl border p-3 shadow-2xl backdrop-blur-md md:p-4 ${
              isTombstoned
                ? "border-slate-600/50 bg-slate-900/95"
                : "border-slate-700/50 bg-slate-900/90"
            }`}
          >
            <div className="mb-2 flex items-start gap-2">
              <button
                onClick={() => useMemoryStore.getState().selectAtom(null)}
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-700/60 hover:text-slate-300"
              >
                ✕
              </button>
              <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                <span
                  className={`font-mono text-xs font-semibold break-all md:text-sm ${isTombstoned ? "text-slate-500" : ""}`}
                  style={
                    isTombstoned
                      ? undefined
                      : {
                          color:
                            ATOM_COLORS[(selected?.atom ?? "").split(".")[1] as AtomType] ??
                            ATOM_COLORS.other,
                        }
                  }
                >
                  {selected?.atom ?? selectedAtom ?? "unknown"}
                </span>
                {isTombstoned && (
                  <span className="rounded-full bg-slate-700/60 px-2 py-0.5 font-mono text-[10px] tracking-wider text-slate-400 ring-1 ring-slate-600/50">
                    TOMBSTONED
                  </span>
                )}
              </div>
            </div>
            {isTombstoned && !selected && (
              <div className="mb-2 font-mono text-[11px] text-slate-500">
                This atom was removed or superseded by a newer version.
              </div>
            )}
            {selected && (
              <>
                <div className="grid grid-cols-3 gap-3 font-mono text-[10px] text-slate-400 md:text-[11px]">
                  <div>
                    <span className="text-slate-600">SHARD</span>
                    <br />
                    {selected.shard}
                  </div>
                  <div>
                    <span className="text-slate-600">INDEX</span>
                    <br />
                    {selected.index}
                  </div>
                  <div>
                    <span className="text-slate-600">VERSION</span>
                    <br />
                    {selected.committedAtVersion}
                  </div>
                </div>
                {selected.hash && (
                  <div className="mt-2 hidden font-mono text-[10px] text-slate-600 md:block">
                    HASH {selected.hash.slice(0, 32)}…
                  </div>
                )}
                {(selected.outgoingTransitions?.length ?? 0) > 0 && (
                  <div className="mt-2 border-t border-slate-700/50 pt-2">
                    <span className="font-mono text-[10px] text-slate-600">
                      MARKOV EDGES ({selected.outgoingTransitions.length})
                    </span>
                    {selected.outgoingTransitions.slice(0, 3).map((t) => (
                      <div
                        key={t.to}
                        className="mt-1 truncate font-mono text-[10px] text-slate-500"
                      >
                        → {t.to} <span className="text-cyan-500/60">w={t.weight.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
