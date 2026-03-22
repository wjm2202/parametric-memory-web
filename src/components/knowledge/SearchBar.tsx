"use client";

/**
 * SearchBar — floating search overlay for the Knowledge Graph.
 *
 * TWO modes of finding atoms:
 *
 * 1. Typeahead dropdown (instant, client-side, zero API calls)
 *    - Debounced 250ms after each keystroke
 *    - Filters all 833 atoms already in the store by substring match
 *    - Matches anywhere in the full key OR the short label
 *    - Matched characters highlighted amber in the dropdown
 *    - Click a result → instantly focus that atom + its neighbours in the graph
 *    - Zero latency: neighbours derived from store.edges (loaded by useAutoSeed)
 *
 * 2. Semantic search (Enter / Search button, requires API call)
 *    - Calls searchAtoms() → top 5 semantically similar atoms
 *    - Expands each seed → fetches Markov transitions
 *    - Hides unrelated atoms (visibleAtoms filter) so matches aren't buried
 *    - Seeds + neighbours highlighted gold + slow pulse
 *
 * Performance notes:
 *   - Typeahead reads from getState().nodes — NOT a Zustand subscription.
 *     The dropdown list is local React state; no store subscription means
 *     no re-renders when nodes are added during auto-seed.
 *   - String matching 833 atoms takes ~0.1ms (benchmarked). Negligible.
 *   - Debounce timer stored in useRef — no state update on every keystroke.
 *   - Suggestion click derives visible set from store.edges (zero network).
 */

import { useState, useCallback, useRef, type JSX } from "react";
import { useKnowledgeStore, type KGNode } from "@/stores/knowledge-store";
import { ATOM_COLORS, type AtomType } from "@/types/memory";
import { searchAtoms, expandAtom } from "@/lib/knowledge-api";

/* ─── Constants ──────────────────────────────────────────────────────────── */

const MAX_SUGGESTIONS = 8;

/* ─── Helpers ────────────────────────────────────────────────────────────── */

/** Render text with the matched substring highlighted amber */
function HighlightMatch({ text, query }: { text: string; query: string }): JSX.Element {
  const lc = text.toLowerCase();
  const lq = query.toLowerCase();
  const idx = lc.indexOf(lq);
  if (idx === -1) return <span>{text}</span>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-amber-400">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

/** Small coloured dot indicating atom type */
function TypeDot({ type }: { type: AtomType }) {
  return (
    <span
      className="mt-px h-1.5 w-1.5 flex-shrink-0 rounded-full"
      style={{ background: ATOM_COLORS[type] }}
    />
  );
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function SearchBar() {
  const [query, setQuery]               = useState("");
  const [isLoading, setIsLoading]       = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [suggestions, setSuggestions]   = useState<KGNode[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIdx, setActiveIdx]       = useState(-1);   // keyboard nav index
  const [totalMatches, setTotalMatches] = useState(0);

  const inputRef    = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Prevent blur from closing dropdown before a click registers
  const mouseInDropdown = useRef(false);

  /* ── Store actions (stable refs — no re-renders on node additions) ────── */
  const addNodesLoaded    = useKnowledgeStore((s) => s.addNodesLoaded);
  const addEdges          = useKnowledgeStore((s) => s.addEdges);
  const markExpandedBatch = useKnowledgeStore((s) => s.markExpandedBatch);
  const setSearchHits     = useKnowledgeStore((s) => s.setSearchHits);
  const setVisibleAtoms   = useKnowledgeStore((s) => s.setVisibleAtoms);
  // reset, setSearchHits, setVisibleAtoms, selectAtom, hoverAtom all accessed
  // via getState() inside handleReset — no subscription needed there.
  const nodeCount         = useKnowledgeStore((s) => s.nodes.size);

  /* ── Typeahead filter (client-side) ──────────────────────────────────── */
  //
  // Timing strategy:
  //   • First character (query was empty): run immediately — no wait.
  //   • Subsequent characters: debounce 200ms so we don't filter 833 atoms
  //     on every keypress during fast typing.
  //
  // This means the dropdown appears the instant the user types the first char
  // rather than sitting invisible for 200ms.

  const runFilter = useCallback((value: string) => {
    const q = value.toLowerCase();
    // Read from getState() — NOT a subscription. Avoids re-renders on node adds.
    const { nodes } = useKnowledgeStore.getState();
    const matches: KGNode[] = [];
    let total = 0;

    for (const node of nodes.values()) {
      // Substring match anywhere in the full key OR the short label
      if (node.key.toLowerCase().includes(q) || node.label.toLowerCase().includes(q)) {
        total++;
        if (matches.length < MAX_SUGGESTIONS) matches.push(node);
      }
    }

    setTotalMatches(total);
    setSuggestions(matches);
    setShowDropdown(matches.length > 0);
    setActiveIdx(-1);
  }, []);

  const filterSuggestions = useCallback((value: string, prevValue: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setSuggestions([]);
      setShowDropdown(false);
      setActiveIdx(-1);
      return;
    }

    // First character typed: run immediately so the dropdown appears at once
    if (!prevValue.trim()) {
      runFilter(value);
      return;
    }

    // Subsequent keystrokes: debounce 200ms
    debounceRef.current = setTimeout(() => runFilter(value), 200);
  }, [runFilter]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      // Pass the pre-update query so filterSuggestions knows if this is the
      // first character (prev was empty → run immediately, no debounce).
      setQuery((prev) => {
        filterSuggestions(value, prev);
        return value;
      });
      setError(null);
    },
    [filterSuggestions],
  );

  /* ── Suggestion click — zero-latency focus (derives from store.edges) ── */

  const handleSuggestionClick = useCallback(
    (node: KGNode) => {
      setShowDropdown(false);
      setQuery(node.label);
      setActiveIdx(-1);
      setError(null);

      // Derive the visible set from edges already in the store — no API call.
      // useAutoSeed loaded all atoms + edges on mount, so neighbours are known.
      const { edges } = useKnowledgeStore.getState();
      const visibleSet = new Set<string>([node.key]);
      for (const e of edges) {
        if (e.source === node.key) visibleSet.add(e.target);
      }

      // Highlight the clicked atom gold, dim everything else
      setSearchHits([node.key]);
      setVisibleAtoms(Array.from(visibleSet));
    },
    [setSearchHits, setVisibleAtoms],
  );

  /* ── Semantic search (Enter / Search button) ─────────────────────────── */

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q || isLoading) return;

    setShowDropdown(false);
    setIsLoading(true);
    setError(null);

    try {
      const hits = await searchAtoms(q, 5);

      if (hits.length === 0) {
        setError("No matching atoms found.");
        return;
      }

      const existingKeys = new Set(useKnowledgeStore.getState().nodes.keys());
      const seedKeys = hits.map((h) => h.atom);

      const results = await Promise.all(
        seedKeys.map((key) => expandAtom(key, existingKeys).catch(() => null)),
      );

      const allNewKeys = new Set<string>(seedKeys);
      const allEdges: Array<{
        source: string;
        target: string;
        weight: number;
        effectiveWeight: number;
      }> = [];

      for (const result of results) {
        if (!result) continue;
        for (const key of result.newAtoms) allNewKeys.add(key);
        // BUG-FIX: include ALL edge targets (not just newAtoms) in the visible set.
        // expandAtom.newAtoms only contains atoms not yet in the store — but when
        // useAutoSeed has loaded everything, newAtoms is always empty. result.edges
        // still returns all outgoing transitions from the seed, so we derive the
        // neighbourhood from those instead.
        for (const e of result.edges) allNewKeys.add(e.target);
        allEdges.push(...result.edges);
      }

      addNodesLoaded(Array.from(allNewKeys));
      if (allEdges.length > 0) addEdges(allEdges);
      markExpandedBatch(Array.from(allNewKeys));
      setSearchHits(seedKeys);
      setVisibleAtoms(Array.from(allNewKeys));

    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError("Search failed. Check your connection.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [query, isLoading, addNodesLoaded, addEdges, markExpandedBatch, setSearchHits, setVisibleAtoms]);

  /* ── Clear — restores the full graph view without reloading ─────────── */
  //
  // BUG-FIX: previously called reset() then fetchAtomGraph(), which wiped all
  // 833 nodes and respawned them with fresh random positions — causing the
  // jarring "new cloud" the user saw.
  //
  // The graph is already fully loaded by useAutoSeed on mount. Clear only
  // needs to remove the search highlights and visibility filter so all nodes
  // return to their settled positions. No store wipe, no network request.

  const handleReset = useCallback(() => {
    const s = useKnowledgeStore.getState();
    s.setSearchHits([]);
    s.setVisibleAtoms(null);
    s.selectAtom(null);
    s.hoverAtom(null);
    setQuery("");
    setError(null);
    setSuggestions([]);
    setShowDropdown(false);
    setActiveIdx(-1);
    inputRef.current?.focus();
  }, []);

  /* ── Keyboard navigation in dropdown ────────────────────────────────── */

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, -1));
        return;
      }
      if (e.key === "Enter") {
        if (activeIdx >= 0 && suggestions[activeIdx]) {
          handleSuggestionClick(suggestions[activeIdx]);
        } else {
          handleSearch();
        }
        return;
      }
      if (e.key === "Escape") {
        setShowDropdown(false);
        setActiveIdx(-1);
        inputRef.current?.blur();
      }
    },
    [activeIdx, suggestions, handleSearch, handleSuggestionClick],
  );

  /* ── Close dropdown on blur (with delay for click to register) ───────── */

  const handleBlur = useCallback(() => {
    if (mouseInDropdown.current) return;
    setTimeout(() => setShowDropdown(false), 150);
  }, []);

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div className="flex items-center gap-2">

      {/* Search input + dropdown wrapper */}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => query.trim() && suggestions.length > 0 && setShowDropdown(true)}
          onBlur={handleBlur}
          placeholder="Search memory substrate…"
          className="w-72 rounded-full border border-slate-700/50 bg-slate-900/80 py-1.5 pl-9 pr-4 font-mono text-xs text-slate-200 placeholder-slate-500 outline-none backdrop-blur-md transition focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
          disabled={isLoading}
          autoComplete="off"
          spellCheck={false}
        />

        {/* Search icon */}
        <svg
          className="pointer-events-none absolute left-3 h-3 w-3 text-slate-500"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>

        {/* Inline spinner */}
        {isLoading && (
          <div className="absolute right-3 h-3 w-3 animate-spin rounded-full border border-violet-400/30 border-t-violet-400" />
        )}

        {/* ── Typeahead dropdown ────────────────────────────────────────── */}
        {showDropdown && (
          <div
            ref={dropdownRef}
            onMouseEnter={() => { mouseInDropdown.current = true; }}
            onMouseLeave={() => { mouseInDropdown.current = false; }}
            className="absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/95 shadow-2xl shadow-black/50 backdrop-blur-md"
          >
            <ul className="max-h-64 overflow-y-auto">
              {suggestions.map((node, idx) => (
                <li
                  key={node.key}
                  onMouseDown={(e) => e.preventDefault()} // prevent blur before click
                  onClick={() => handleSuggestionClick(node)}
                  className={[
                    "flex cursor-pointer items-start gap-2 px-3 py-2 transition-colors",
                    idx === activeIdx
                      ? "bg-violet-500/15"
                      : "hover:bg-slate-800/60",
                  ].join(" ")}
                >
                  {/* Type indicator dot */}
                  <TypeDot type={node.type} />

                  {/* Label + key */}
                  <div className="min-w-0 flex-1">
                    {/* Short label — primary text */}
                    <div className="truncate font-mono text-xs text-slate-200">
                      <HighlightMatch text={node.label} query={query} />
                    </div>
                    {/* Full key — secondary, dimmed */}
                    <div className="truncate font-mono text-[10px] text-slate-500">
                      <HighlightMatch text={node.key} query={query} />
                    </div>
                  </div>

                  {/* Type badge */}
                  <span
                    className="mt-0.5 flex-shrink-0 rounded px-1 py-0.5 font-mono text-[9px] uppercase"
                    style={{
                      color: ATOM_COLORS[node.type],
                      background: ATOM_COLORS[node.type] + "22",
                    }}
                  >
                    {node.type}
                  </span>
                </li>
              ))}
            </ul>

            {/* Footer: overflow count + semantic search hint */}
            {(totalMatches > MAX_SUGGESTIONS || true) && (
              <div className="flex items-center justify-between border-t border-slate-700/40 px-3 py-1.5">
                <span className="font-mono text-[10px] text-slate-600">
                  {totalMatches > MAX_SUGGESTIONS
                    ? `${MAX_SUGGESTIONS} of ${totalMatches} — keep typing to narrow`
                    : `${totalMatches} atom${totalMatches !== 1 ? "s" : ""} matched`}
                </span>
                <span className="font-mono text-[10px] text-slate-600">
                  ↵ semantic search
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Search button (semantic) */}
      <button
        onClick={handleSearch}
        disabled={isLoading || !query.trim()}
        className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 font-mono text-xs text-violet-400 transition hover:border-violet-500/60 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isLoading ? "Searching…" : "Search"}
      </button>

      {/* Clear */}
      {nodeCount > 0 && !isLoading && (
        <button
          onClick={handleReset}
          className="rounded-full border border-slate-700/50 bg-slate-900/60 px-3 py-1.5 font-mono text-xs text-slate-500 transition hover:border-slate-600 hover:text-slate-400"
        >
          Clear
        </button>
      )}

      {/* Error */}
      {error && (
        <span className="font-mono text-xs text-red-400/80">{error}</span>
      )}
    </div>
  );
}
