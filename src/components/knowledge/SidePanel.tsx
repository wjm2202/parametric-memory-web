"use client";

/**
 * SidePanel — atom detail slide-in panel.
 *
 * Sprint 2 (Item 2.6): Triggered by selectedAtom in the Zustand store.
 *
 * Shows:
 *   - Type badge + full atom key + parsed label
 *   - Status (active / tombstoned)
 *   - Creation date, shard, TTL if present
 *   - Conflict warning with competing claims
 *   - Top 8 outgoing Markov transitions ranked by effectiveWeight
 *
 * Fetches fetchAtomDetail on open. Caches via store.cacheDetail to avoid
 * re-fetching on re-select (honours the KG-16 LRU cap of 50 entries).
 *
 * Lives outside the R3F scene — absolute positioned HTML overlay.
 */

import { useEffect, useState } from "react";
import { useKnowledgeStore, parseLabel } from "@/stores/knowledge-store";
import { fetchAtomDetail } from "@/lib/knowledge-api";
import { parseAtomType, ATOM_COLORS } from "@/types/memory";
import type { AtomDetailResponse } from "@/types/memory";

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-NZ", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function SidePanel() {
  const selectedAtom  = useKnowledgeStore((s) => s.selectedAtom);
  const cachedDetails = useKnowledgeStore((s) => s.cachedDetails);
  const cacheDetail   = useKnowledgeStore((s) => s.cacheDetail);
  const selectAtom    = useKnowledgeStore((s) => s.selectAtom);

  const [detail,    setDetail]    = useState<AtomDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  /* ── Fetch on atom select ─────────────────────────────────────────── */

  useEffect(() => {
    if (!selectedAtom) {
      setDetail(null);
      setError(null);
      return;
    }

    // Cache hit — no fetch needed
    const cached = cachedDetails.get(selectedAtom);
    if (cached) {
      setDetail(cached);
      setError(null);
      return;
    }

    setIsLoading(true);
    setDetail(null);
    setError(null);

    fetchAtomDetail(selectedAtom)
      .then((d) => {
        cacheDetail(selectedAtom, d);
        setDetail(d);
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") {
          setError("Failed to load atom details.");
        }
      })
      .finally(() => setIsLoading(false));
  }, [selectedAtom, cachedDetails, cacheDetail]);

  /* ── Derived ──────────────────────────────────────────────────────── */

  const isOpen    = !!selectedAtom;
  const type      = selectedAtom ? parseAtomType(selectedAtom) : "other";
  const label     = selectedAtom ? parseLabel(selectedAtom) : "";
  const typeColor = ATOM_COLORS[type];

  const sortedTransitions = detail?.outgoingTransitions
    .slice()
    .sort((a, b) => b.effectiveWeight - a.effectiveWeight)
    .slice(0, 8) ?? [];

  /* ── Render ───────────────────────────────────────────────────────── */

  return (
    <div
      className={`absolute right-0 top-0 z-20 flex h-full w-80 transform flex-col overflow-hidden border-l border-slate-800/60 bg-slate-950/95 backdrop-blur-md transition-transform duration-300 ease-in-out ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {isOpen && (
        <>
          {/* ── Header ─────────────────────────────────────────────── */}
          <div className="flex items-start justify-between border-b border-slate-800/60 p-4">
            <div className="min-w-0 flex-1 pr-3">

              {/* Type + status badges */}
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  className="inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider"
                  style={{
                    backgroundColor: `${typeColor}20`,
                    color: typeColor,
                    border: `1px solid ${typeColor}40`,
                  }}
                >
                  {type}
                </span>

                {detail?.status === "tombstoned" && (
                  <span className="inline-block rounded border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-red-400">
                    tombstoned
                  </span>
                )}
              </div>

              {/* Label */}
              <p className="break-words font-mono text-sm font-medium leading-snug text-slate-100">
                {label}
              </p>

              {/* Full key */}
              <p className="mt-0.5 break-all font-mono text-[10px] text-slate-600">
                {selectedAtom}
              </p>
            </div>

            {/* Close */}
            <button
              onClick={() => selectAtom(null)}
              aria-label="Close panel"
              className="flex-shrink-0 rounded-md p-1 text-slate-500 transition hover:bg-slate-800/60 hover:text-slate-300"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* ── Body ───────────────────────────────────────────────── */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4">

            {/* Loading */}
            {isLoading && (
              <div className="flex items-center gap-2 text-slate-500">
                <div className="h-3 w-3 animate-spin rounded-full border border-violet-400/30 border-t-violet-400" />
                <span className="font-mono text-xs">Loading…</span>
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="font-mono text-xs text-red-400">{error}</p>
            )}

            {/* Detail content */}
            {detail && (
              <>
                {/* ── Meta ─────────────────────────────────────────── */}
                <div className="space-y-1.5 rounded-lg border border-slate-800/60 bg-slate-900/40 p-3">
                  <div className="flex justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Created</span>
                    <span className="font-mono text-[10px] text-slate-400">{formatDate(detail.createdAtMs)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Shard</span>
                    <span className="font-mono text-[10px] text-slate-400">{detail.shard}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Version</span>
                    <span className="font-mono text-[10px] text-slate-400">v{detail.committedAtVersion}</span>
                  </div>
                  {detail.ttl !== null && (
                    <div className="flex justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">TTL</span>
                      <span className="font-mono text-[10px] text-amber-400">{detail.ttl}s</span>
                    </div>
                  )}
                </div>

                {/* ── Conflict warning ──────────────────────────────── */}
                {detail.contradiction.hasConflict && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <p className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-wider text-amber-400">
                      ⚠ Conflict — {detail.contradiction.competingClaims.length} competing claim{detail.contradiction.competingClaims.length !== 1 ? "s" : ""}
                    </p>
                    <div className="space-y-1">
                      {detail.contradiction.competingClaims.map((claim, i) => (
                        <p
                          key={i}
                          className="break-words font-mono text-[10px] text-amber-300/70"
                          title={claim.atom}
                        >
                          {parseLabel(claim.atom)}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Outgoing transitions ──────────────────────────── */}
                {sortedTransitions.length > 0 ? (
                  <div>
                    <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                      Markov transitions
                      <span className="ml-1 text-slate-600">({sortedTransitions.length})</span>
                    </p>
                    <div className="space-y-2">
                      {sortedTransitions.map((t) => (
                        <div key={t.to} className="group flex items-center gap-2">
                          {/* Weight bar */}
                          <div className="h-1 w-16 flex-shrink-0 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full bg-violet-500/60 transition-all"
                              style={{ width: pct(t.effectiveWeight) }}
                            />
                          </div>

                          {/* Percentage */}
                          <span className="w-7 flex-shrink-0 text-right font-mono text-[10px] text-slate-500">
                            {pct(t.effectiveWeight)}
                          </span>

                          {/* Label */}
                          <span
                            className="min-w-0 flex-1 truncate font-mono text-[10px] text-slate-400 group-hover:text-slate-200"
                            title={t.to}
                          >
                            {parseLabel(t.to)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="font-mono text-[10px] text-slate-600">No outgoing transitions.</p>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
