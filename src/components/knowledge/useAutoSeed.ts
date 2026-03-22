"use client";

/**
 * useAutoSeed — Single-request graph loader for the knowledge graph.
 *
 * Fetches the complete graph (atoms + Markov edges) in ONE HTTP request
 * using GET /atoms?includeWeights=true.  This server-side enrichment
 * replaces the previous N+1 loading pattern:
 *
 *   Before (N+1):  1× GET /atoms  +  833× GET /weights/:atom  ≈ 35s
 *   After  (1):    1× GET /atoms?includeWeights=true            ≈ 1s
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ Single request: GET /api/memory/atoms?includeWeights=true          │
 * │   → Server returns atoms + outgoing Markov edges per atom          │
 * │   → addNodesLoaded() — ONE store update for ALL nodes              │
 * │   → addEdges()       — ONE store update for ALL edges              │
 * │   → Simulation receives full graph, starts settling immediately    │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Key properties:
 *   1. Single HTTP round trip — eliminates per-request overhead on mobile
 *   2. TWO store updates total (nodes + edges) — minimal React re-renders
 *   3. Server does the heavy lifting (weights are in-memory CSR matrices)
 *   4. AbortController cancels the fetch on component unmount
 *   5. Atoms filtered to active-only; edges filtered to effectiveWeight > 0
 *
 * Payload size for ~833 atoms with sparse edges: ~80-120 KB JSON
 * (well within mobile network budgets, smaller than a typical image).
 */

import { useEffect, useRef } from "react";
import { useKnowledgeStore } from "@/stores/knowledge-store";
import { fetchAtomGraph } from "@/lib/knowledge-api";
import { extractAtomKey } from "@/lib/knowledge-api";

/* ─── Constants ──────────────────────────────────────────────────────── */

/**
 * Minimum effectiveWeight to include an edge in the graph.
 * Edges below this threshold are decayed arcs that would add visual noise
 * without conveying meaningful relationships.
 */
const MIN_EDGE_WEIGHT = 0.01;

/* ─── Hook ───────────────────────────────────────────────────────────── */

export function useAutoSeed() {
  const seeded = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const addNodesLoaded = useKnowledgeStore((s) => s.addNodesLoaded);
  const addEdges = useKnowledgeStore((s) => s.addEdges);
  // KG-01: batch action — one Set clone instead of N individual markExpanded calls
  const markExpandedBatch = useKnowledgeStore((s) => s.markExpandedBatch);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    seed(controller.signal);

    return () => {
      controller.abort();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Main seed function ────────────────────────────────────────── */

  async function seed(signal: AbortSignal) {
    try {
      // Single request: atoms + edges in one payload
      const { atoms } = await fetchAtomGraph(signal);
      if (signal.aborted || atoms.length === 0) return;

      // Filter to active atoms and extract keys
      const activeAtoms = atoms.filter((a) => a.status === "active");
      const atomKeys = activeAtoms.map((a) => extractAtomKey(a.atom));

      // Build a set of known keys for edge validation
      const knownKeys = new Set(atomKeys);

      // ── Store update 1: ALL nodes in one call ──
      addNodesLoaded(atomKeys);

      // ── Collect all edges from the server response ──
      const allEdges: Array<{
        source: string;
        target: string;
        weight: number;
        effectiveWeight: number;
      }> = [];

      for (const atom of activeAtoms) {
        const sourceKey = extractAtomKey(atom.atom);

        if (atom.edges && atom.edges.length > 0) {
          for (const edge of atom.edges) {
            // Only include edges where the target is also in the graph
            // and the weight meets the minimum threshold
            if (edge.effectiveWeight >= MIN_EDGE_WEIGHT && knownKeys.has(edge.to)) {
              allEdges.push({
                source: sourceKey,
                target: edge.to,
                weight: edge.weight,
                effectiveWeight: edge.effectiveWeight,
              });
            }
          }
        }
      }

      if (signal.aborted) return;

      // ── Store update 2: ALL edges in one call ──
      if (allEdges.length > 0) {
        addEdges(allEdges);
      }

      // ── KG-01: mark ALL atoms expanded in ONE store update ──
      // Previously: markExpanded(sourceKey) called inside the loop = N Set clones.
      // Now: single markExpandedBatch call = 1 Set clone regardless of atom count.
      markExpandedBatch(atomKeys);

      console.log(
        `[useAutoSeed] Graph loaded: ${atomKeys.length} nodes, ${allEdges.length} edges (single request)`,
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("[useAutoSeed] Failed to seed knowledge graph:", err);
      }
    }
  }
}
