"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useMemoryStore } from "@/stores/memory-store";
import { atomTreeDepth } from "@/stores/memory-store";
import { ATOM_COLORS, AtomType } from "@/types/memory";

/* ─── Per-type Test Animation Config ─── */

/** Pick random live atoms, optionally from a preferred shard */
function pickRandomAtoms(count: number, preferShard?: number): { keys: string[]; shard: number } {
  const { atoms } = useMemoryStore.getState();
  const live = atoms.filter((a) => !a.tombstoned);
  if (live.length === 0) return { keys: [], shard: 0 };

  const pool =
    preferShard !== undefined
      ? live.filter((a) => a.shard === preferShard)
      : live;
  const source = pool.length >= count ? pool : live;

  const shuffled = [...source].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, Math.min(count, shuffled.length));
  return {
    keys: picked.map((a) => a.key),
    shard: picked[0]?.shard ?? 0,
  };
}

const ANIM_ITEMS: {
  type: "add" | "tombstone" | "train" | "access";
  label: string;
  icon: string;
  count: number;
  color: string;
  bgHover: string;
}[] = [
  { type: "add", label: "Add", icon: "+", count: 2, color: "text-cyan-400", bgHover: "hover:bg-cyan-500/10" },
  { type: "tombstone", label: "Tombstone", icon: "✕", count: 1, color: "text-pink-400", bgHover: "hover:bg-pink-500/10" },
  { type: "train", label: "Train", icon: "⚡", count: 3, color: "text-indigo-400", bgHover: "hover:bg-indigo-500/10" },
  { type: "access", label: "Access", icon: "◎", count: 1, color: "text-amber-400", bgHover: "hover:bg-amber-500/10" },
];

/**
 * Floating overlay controls for the Merkle visualiser.
 *
 * Contains:
 *  - Test animation dropdown (top-left)
 *  - "Random Atom" button (bottom-right)
 *  - Detail panel (top-center) with close button, atom info, and verification badge
 */
export default function AccessControls() {
  const atoms = useMemoryStore((s) => s.atoms);
  const accessPath = useMemoryStore((s) => s.accessPath);
  const clearAccessPath = useMemoryStore((s) => s.clearAccessPath);
  const proofVerification = useMemoryStore((s) => s.proofVerification);
  const accessProofs = useMemoryStore((s) => s.accessProofs);
  const pushSseAnimation = useMemoryStore((s) => s.pushSseAnimation);

  const [showProofDetail, setShowProofDetail] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  /* Close dropdown on outside click / tap */
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
    };
  }, [menuOpen]);

  /** Fire a single test animation of the given type */
  const fireTestAnim = useCallback(
    (type: "add" | "tombstone" | "train" | "access", count: number) => {
      const preferShard = Math.floor(Math.random() * 4);
      const { keys, shard } = pickRandomAtoms(count, preferShard);
      if (keys.length === 0) return;
      pushSseAnimation(type, keys, shard);
    },
    [pushSseAnimation],
  );

  // Find the accessed atom's metadata for the tooltip
  const accessedAtom = accessPath ? atoms.find((a) => a.key === accessPath.atomKey) : null;

  const accessedDepth = accessedAtom
    ? (() => {
        const shardAtoms = atoms
          .filter((a) => a.shard === accessedAtom.shard)
          .sort((a, b) => a.index - b.index);
        const sortedIdx = shardAtoms.findIndex((a) => a.key === accessedAtom.key);
        return sortedIdx >= 0 ? atomTreeDepth(sortedIdx) : 0;
      })()
    : 0;

  const atomType = accessedAtom?.type ?? "other";
  const typeColor = ATOM_COLORS[atomType as AtomType] ?? ATOM_COLORS.other;

  return (
    <>
      {/* ─── Test Animation Dropdown — top-center ─── */}
      <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center md:top-6" ref={menuRef}>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="pointer-events-auto flex items-center gap-1.5 rounded-lg bg-slate-800/80 px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-slate-300 shadow-lg ring-1 ring-slate-600/50 backdrop-blur-md transition-all duration-200 hover:bg-slate-700/80 hover:text-slate-100 active:scale-95 md:px-3 md:py-2 md:text-xs"
          >
            <span className="text-slate-400">▶</span>
            <span>TEST</span>
            <span className={`ml-0.5 text-[8px] text-slate-500 transition-transform duration-150 ${menuOpen ? "rotate-180" : ""}`}>▾</span>
          </button>

          {menuOpen && (
            <div className="pointer-events-auto absolute left-1/2 mt-1.5 min-w-[140px] -translate-x-1/2 overflow-hidden rounded-lg bg-slate-800/95 shadow-xl ring-1 ring-slate-600/50 backdrop-blur-md md:min-w-[160px]">
              {ANIM_ITEMS.map((item) => (
                <button
                  key={item.type}
                  onClick={() => fireTestAnim(item.type, item.count)}
                  disabled={atoms.length === 0}
                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left font-mono text-[11px] tracking-wider transition-colors disabled:opacity-30 md:px-4 md:py-2.5 md:text-xs ${item.color} ${item.bgHover}`}
                >
                  <span className="w-4 text-center text-sm">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Detail panel for the accessed atom ─── */}
      {accessPath && accessedAtom && (
        <div className="animate-in fade-in slide-in-from-top-2 pointer-events-none absolute inset-x-2 top-16 flex justify-center duration-300 md:inset-x-0 md:top-20">
          <div className="pointer-events-auto max-w-[calc(100vw-1rem)] rounded-lg bg-slate-900/90 px-3 py-2 font-mono text-[10px] shadow-lg ring-1 shadow-amber-900/20 ring-amber-500/30 backdrop-blur-md md:max-w-none md:px-4 md:py-2.5 md:text-xs">
            {/* Row 1: Close button + atom key + badge */}
            <div className="flex items-center gap-2 md:gap-3">
              <button
                onClick={() => {
                  clearAccessPath();
                  setShowProofDetail(false);
                }}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-700/60 hover:text-slate-300"
                title="Close"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M1 1l8 8M9 1l-8 8" />
                </svg>
              </button>

              <div
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: typeColor,
                  boxShadow: `0 0 8px ${typeColor}`,
                }}
              />

              <span className="min-w-0 truncate font-semibold text-slate-200">
                {accessedAtom.key}
              </span>

              {/* Desktop: inline metadata */}
              <span className="hidden text-slate-600 md:inline">·</span>
              <span className="hidden text-slate-400 md:inline">Shard {accessedAtom.shard}</span>
              <span className="hidden text-slate-600 md:inline">·</span>
              <span className="hidden text-slate-400 md:inline">Depth {accessedDepth}</span>
              <span className="hidden text-slate-600 md:inline">·</span>
              <span className="hidden text-amber-400/70 md:inline">
                {accessPath.positions.length - 1} hops
              </span>
              <span className="hidden text-slate-600 md:inline">·</span>

              <VerificationBadge
                proofVerification={proofVerification}
                showDetail={showProofDetail}
                onToggleDetail={() => setShowProofDetail((v) => !v)}
              />
            </div>

            {/* Mobile: second row with compact metadata */}
            <div className="mt-1 flex items-center gap-2 text-[9px] text-slate-500 md:hidden">
              <span>S{accessedAtom.shard}</span>
              <span className="text-slate-700">·</span>
              <span>D{accessedDepth}</span>
              <span className="text-slate-700">·</span>
              <span className="text-amber-400/60">{accessPath.positions.length - 1} hops</span>
            </div>

            {/* Proof detail (expandable) */}
            {showProofDetail && proofVerification && accessProofs && (
              <div className="mt-2 border-t border-slate-700/50 pt-2 text-[9px] text-slate-400 md:text-[10px]">
                <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 md:gap-x-3">
                  <span className="text-slate-500">Leaf</span>
                  <span className="truncate">{proofVerification.leafHash.slice(0, 16)}...</span>
                  <span className="text-slate-500">Root</span>
                  <span className="truncate">{proofVerification.expectedRoot.slice(0, 16)}...</span>
                  <span className="text-slate-500">Path</span>
                  <span>
                    {accessProofs.current.auditPath.length} shard +{" "}
                    {accessProofs.shardRoot.auditPath.length} top ={" "}
                    {proofVerification.auditPathLength} total
                  </span>
                  <span className="text-slate-500">Verified in</span>
                  <span>{proofVerification.verificationTimeMs}ms (SHA-256, client-side)</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ─── S16-4: Verification Badge sub-component ─── */

import type { VerificationResult } from "@/lib/verify-merkle-proof";

function VerificationBadge({
  proofVerification,
  showDetail,
  onToggleDetail,
}: {
  proofVerification: VerificationResult | null;
  showDetail: boolean;
  onToggleDetail: () => void;
}) {
  if (!proofVerification) {
    // Still loading — show spinner state
    return (
      <span className="flex items-center gap-1 text-slate-500" title="Verifying proof...">
        <svg className="h-3 w-3 animate-spin" viewBox="0 0 12 12" fill="none">
          <circle
            cx="6"
            cy="6"
            r="5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="20"
            strokeDashoffset="5"
          />
        </svg>
        <span>VERIFYING</span>
      </span>
    );
  }

  if (proofVerification.verified) {
    return (
      <button
        onClick={onToggleDetail}
        className="flex items-center gap-1 text-emerald-400 transition-colors hover:text-emerald-300"
        title={`Proof verified in ${proofVerification.verificationTimeMs}ms — click for details`}
      >
        {/* Shield checkmark icon */}
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0L1 3v4.5c0 4.1 2.9 7.9 7 8.5 4.1-.6 7-4.4 7-8.5V3L8 0zm-1.2 11.3L4 8.5l1.4-1.4 1.4 1.4 3.8-3.8 1.4 1.4-5.2 5.2z" />
        </svg>
        <span className="font-semibold tracking-wider">VERIFIED</span>
        {showDetail && <span className="text-emerald-600">▾</span>}
      </button>
    );
  }

  // Verification failed
  return (
    <button
      onClick={onToggleDetail}
      className="flex items-center gap-1 text-yellow-400 transition-colors hover:text-yellow-300"
      title="Proof verification failed — click for details"
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0L1 3v4.5c0 4.1 2.9 7.9 7 8.5 4.1-.6 7-4.4 7-8.5V3L8 0zm-.8 11.5V10h1.6v1.5H7.2zm0-3V4.5h1.6v4H7.2z" />
      </svg>
      <span className="font-semibold tracking-wider">UNVERIFIED</span>
      {showDetail && <span className="text-yellow-600">▾</span>}
    </button>
  );
}
