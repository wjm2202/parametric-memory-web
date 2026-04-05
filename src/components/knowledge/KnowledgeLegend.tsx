"use client";

/**
 * KnowledgeLegend — collapsible visual key for the Knowledge Graph.
 *
 * Explains the visual language to first-time viewers:
 *   • Atom sizes  — connection count × NODE WEIGHT slider
 *   • Edge colours — each relationship type mapped to a colour
 *   • Nebula clouds — semantic cluster territory
 *   • Search overlays — amber bridge atom, gold pulsing hits
 *
 * Design language: dark-glass panel matching DegreeSizeSlider / ViewToggle.
 * Position: bottom-right, above any scrollbar chrome.
 * Collapsed by default — a small "?" button opens it.
 */

import { useState } from "react";
import { useKnowledgeStore } from "@/stores/knowledge-store";

/* ─── Data ───────────────────────────────────────────────────────────────── */

const EDGE_TYPES = [
  { color: "#22d3ee", label: "Markov arc", desc: "Predictive link — arc weight = recall strength" },
  { color: "#4ade80", label: "Member of", desc: "Atom belongs to a semantic cluster hub" },
  { color: "#38bdf8", label: "References", desc: "Cites or mentions another atom" },
  { color: "#f97316", label: "Depends on", desc: "Requires another fact to hold true" },
  { color: "#a855f7", label: "Supersedes", desc: "Replaces an older version of a fact" },
  { color: "#ef4444", label: "Constrains", desc: "Limits or corrects another atom" },
  { color: "#2dd4bf", label: "Derived from", desc: "Finding came from investigating another atom" },
  { color: "#94a3b8", label: "Structural", desc: "Cross-domain backbone edge" },
] as const;

const NEBULA_CLUSTERS = [
  { color: "#22d3ee", label: "Core" },
  { color: "#f97316", label: "Compute" },
  { color: "#2dd4bf", label: "Testing" },
  { color: "#a855f7", label: "Procedures" },
  { color: "#fbbf24", label: "Sprint state" },
  { color: "#ef4444", label: "Corrections" },
  { color: "#38bdf8", label: "Visualisation" },
] as const;

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 mb-1.5 font-mono text-[9px] tracking-widest text-slate-500 uppercase first:mt-0">
      {children}
    </div>
  );
}

function Swatch({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: color, boxShadow: `0 0 4px ${color}88` }}
    />
  );
}

function EdgeRow({ color, label, desc }: { color: string; label: string; desc: string }) {
  return (
    <div className="flex items-start gap-2 py-0.5">
      {/* Swatch + line fragment */}
      <div className="mt-[3px] flex shrink-0 items-center gap-1">
        <Swatch color={color} size={6} />
        <span
          className="inline-block h-px w-5 rounded"
          style={{ background: color, boxShadow: `0 0 3px ${color}` }}
        />
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] leading-tight font-medium text-slate-200">{label}</span>
        <span className="text-[9px] leading-tight text-slate-500">{desc}</span>
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */

export default function KnowledgeLegend() {
  const [open, setOpen] = useState(false);
  const visibleAtoms = useKnowledgeStore((s) => s.visibleAtoms);
  const isSearchActive = visibleAtoms !== null;

  return (
    <div className="flex flex-col items-end gap-2">
      {/* Expanded panel */}
      {open && (
        <div
          className="w-60 rounded-xl border border-white/8 bg-black/60 px-3.5 py-3 shadow-xl backdrop-blur-md"
          style={{ maxHeight: "calc(100vh - 14rem)", overflowY: "auto" }}
        >
          {/* ── Atoms ──────────────────────────────────────────────────── */}
          <SectionHeader>Atoms</SectionHeader>
          <div className="flex items-start gap-2 py-0.5">
            <div className="mt-0.5 flex shrink-0 items-center gap-0.5">
              {[4, 6, 9].map((s, i) => (
                <Swatch key={i} color="#8b5cf6" size={s} />
              ))}
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] leading-tight font-medium text-slate-200">
                Node size
              </span>
              <span className="text-[9px] leading-tight text-slate-500">
                Scales with connection count. Adjust with the Node Weight slider.
              </span>
            </div>
          </div>
          <div className="flex items-start gap-2 py-0.5">
            <div className="mt-0.5 flex shrink-0 items-center gap-0.5">
              {["#3b82f6", "#22d3ee", "#a855f7", "#f97316", "#ef4444"].map((c, i) => (
                <Swatch key={i} color={c} size={6} />
              ))}
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] leading-tight font-medium text-slate-200">
                Node colour
              </span>
              <span className="text-[9px] leading-tight text-slate-500">
                Hue derived from semantic domain (Poincaré coordinates).
              </span>
            </div>
          </div>

          {/* ── Edges ──────────────────────────────────────────────────── */}
          <SectionHeader>Relationships</SectionHeader>
          {EDGE_TYPES.map((e) => (
            <EdgeRow key={e.label} {...e} />
          ))}
          <p className="mt-1 text-[9px] leading-tight text-slate-600">
            Centre section of each edge fades to transparent — only endpoints are bright.
          </p>

          {/* ── Nebulae ────────────────────────────────────────────────── */}
          <SectionHeader>Cluster nebulae</SectionHeader>
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            {NEBULA_CLUSTERS.map((n) => (
              <div key={n.label} className="flex items-center gap-1">
                <span
                  className="inline-block h-3 w-3 rounded-full opacity-60"
                  style={{
                    background: `radial-gradient(circle, ${n.color}55 0%, ${n.color}00 100%)`,
                    border: `1px solid ${n.color}44`,
                  }}
                />
                <span className="text-[9px] text-slate-400">{n.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[9px] leading-tight text-slate-600">
            Soft halos mark semantic cluster territory. Hub atoms sit at the densest point.
          </p>

          {/* ── Search overlays (contextual) ───────────────────────────── */}
          <SectionHeader>Search overlays</SectionHeader>
          <div className="flex items-start gap-2 py-0.5">
            <Swatch color="#fbbf24" size={8} />
            <div className="flex flex-col">
              <span className="text-[10px] leading-tight font-medium text-slate-200">
                Gold — search hit
              </span>
              <span className="text-[9px] leading-tight text-slate-500">
                Atoms that directly matched your query, pulsing with bloom.
              </span>
            </div>
          </div>
          <div className="flex items-start gap-2 py-0.5">
            <Swatch color="#f59e0b" size={8} />
            <div className="flex flex-col">
              <span className="text-[10px] leading-tight font-medium text-slate-200">
                Amber — bridge atom
              </span>
              <span className="text-[9px] leading-tight text-slate-500">
                The external atom with most connections into the result set — the strongest
                contextual link.
              </span>
            </div>
          </div>
          {!isSearchActive && (
            <p className="mt-1 text-[9px] leading-tight text-slate-600 italic">
              Use the search bar above to activate these overlays.
            </p>
          )}
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close legend" : "Open visualisation key"}
        className={`flex h-8 w-8 items-center justify-center rounded-xl border border-white/8 bg-black/50 font-mono text-xs font-semibold tracking-widest backdrop-blur-md transition-colors duration-200 ${
          open
            ? "border-violet-400/30 bg-violet-900/20 text-violet-300"
            : "text-slate-400 hover:border-violet-400/20 hover:text-violet-300"
        } `}
      >
        {open ? "×" : "?"}
      </button>
    </div>
  );
}
